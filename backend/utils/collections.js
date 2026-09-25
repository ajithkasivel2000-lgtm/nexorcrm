const crypto = require('crypto');
const prisma = require('../prismaClient');
const tenant = require('./tenant');
const { summarize, round2 } = require('./bookings');
const { sendMail } = require('./mailer');

/**
 * Collections: getting buyers to pay.
 *
 *   - Payment links through the COMPANY's own Razorpay account (money goes to
 *     the builder, not the platform), recorded on the booking automatically
 *     when Razorpay's signed webhook says they were paid.
 *   - The buyer portal's sign-in: one-time links (emailed, or made by staff
 *     to send on WhatsApp) exchanged for a buyer session.
 *   - Reminders before and after each milestone's due date, sent once each.
 */

const DAY = 86400000;
/* Overridable so tests can stand in a fake Razorpay. */
const RAZORPAY_API = process.env.RAZORPAY_API_BASE || 'https://api.razorpay.com/v1';
const hash = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
/* The company's own domain when it has one, else the platform's address. */
const appBase = async (companyId) => (await require('./companyUrl').companyBaseUrl(companyId))
  || String(process.env.APP_URL || 'http://localhost:5173').replace(/\/+$/, '');

/* ---- the company's gateway ---------------------------------------------- */

async function gateway() {
  const s = await prisma.paymentGatewaySetting.findFirst();
  return s && s.enabled && s.keyId && s.keySecret ? s : null;
}

async function razorpay(settings, pathname, { method = 'GET', body } = {}) {
  const auth = Buffer.from(`${settings.keyId}:${settings.keySecret}`).toString('base64');
  const res = await fetch(`${RAZORPAY_API}${pathname}`, {
    method,
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(`Razorpay: ${data?.error?.description || res.status}`), { status: 502 });
  return data;
}

/** The first milestone with money outstanding, or a named one. */
function dueFor(booking, milestoneId) {
  const s = summarize(booking);
  const m = milestoneId ? s.milestones.find((x) => x.id === milestoneId) : s.milestones.find((x) => x.outstanding > 0);
  return { summary: s, milestone: m || null };
}

/**
 * A payment link for what is outstanding on a milestone (or a given amount).
 * An open link for the same milestone and amount is reused rather than
 * sending the buyer a second one.
 */
async function createPaymentLink(booking, { milestoneId = null, amount = null, createdBy = null } = {}) {
  const settings = await gateway();
  if (!settings) throw Object.assign(new Error('Online payments are not set up. An administrator can connect Razorpay in Settings → Integrations → Buyer payments.'), { status: 400 });
  if (booking.status === 'Cancelled') throw Object.assign(new Error('This booking is cancelled.'), { status: 400 });

  const { summary, milestone } = dueFor(booking, milestoneId);
  const value = round2(amount != null ? Number(amount) : (milestone ? milestone.outstanding : summary.balance));
  if (!(value > 0)) throw Object.assign(new Error('Nothing is outstanding.'), { status: 400 });
  if (value > summary.balance + 0.01) throw Object.assign(new Error(`That is more than the balance of ${inr(summary.balance)}.`), { status: 400 });

  const open = await prisma.paymentLink.findFirst({
    where: { bookingId: booking.id, milestoneId: milestone?.id || null, status: 'created', amount: value, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (open) return open;

  const company = await tenant.runAsSystem(() => prisma.company.findUnique({ where: { id: booking.companyId }, select: { slug: true } }));
  const description = `${milestone ? milestone.name : 'Payment'} — booking ${booking.id}`;
  const expiresAt = new Date(Date.now() + 30 * DAY);
  const row = await prisma.paymentLink.create({
    data: { bookingId: booking.id, milestoneId: milestone?.id || null, description, amount: value, createdBy, expiresAt },
  });
  try {
    const link = await razorpay(settings, '/payment_links', {
      method: 'POST',
      body: {
        amount: Math.round(value * 100),
        currency: 'INR',
        description: description.slice(0, 2048),
        reference_id: row.id,
        expire_by: Math.floor(expiresAt.getTime() / 1000),
        customer: {
          name: booking.buyerName,
          ...(booking.buyerEmail ? { email: booking.buyerEmail } : {}),
          ...(booking.buyerMobile ? { contact: String(booking.buyerMobile).replace(/\D/g, '').slice(-10) } : {}),
        },
        notify: { sms: false, email: false }, // we send our own messages
        reminder_enable: false,
        notes: { companyId: booking.companyId, bookingId: booking.id, paymentLinkId: row.id },
        callback_url: `${await appBase(booking.companyId)}/portal?company=${encodeURIComponent(company?.slug || '')}`,
        callback_method: 'get',
      },
    });
    return prisma.paymentLink.update({ where: { id: row.id }, data: { razorpayLinkId: link.id, shortUrl: link.short_url } });
  } catch (error) {
    await prisma.paymentLink.update({ where: { id: row.id }, data: { status: 'failed' } }).catch(() => {});
    throw error;
  }
}

/**
 * Record a paid link on its booking. Idempotent: Payment.gatewayPaymentId is
 * unique, so a replayed or duplicated webhook changes nothing.
 */
async function recordLinkPayment(link, { paymentId, amountPaise, method }) {
  const existing = await prisma.payment.findUnique({ where: { gatewayPaymentId: paymentId } });
  if (existing) return { payment: existing, duplicate: true };
  const amount = round2((Number(amountPaise) || Math.round(Number(link.amount) * 100)) / 100);
  const count = await prisma.payment.count({ where: { bookingId: link.bookingId } });
  let payment;
  try {
    payment = await prisma.payment.create({
      data: {
        bookingId: link.bookingId,
        amount,
        mode: `Online${method ? ` (${method})` : ''}`,
        reference: paymentId,
        receiptNo: `RCPT-${link.bookingId}-${count + 1}`,
        notes: link.description,
        recordedBy: 'razorpay',
        gatewayPaymentId: paymentId,
      },
    });
  } catch (error) {
    if (error.code === 'P2002') return { payment: await prisma.payment.findUnique({ where: { gatewayPaymentId: paymentId } }), duplicate: true };
    throw error;
  }
  await prisma.paymentLink.update({ where: { id: link.id }, data: { status: 'paid', paymentId, paidAt: new Date() } });

  // Keep the opportunity's own totals in step, as a manual payment does.
  const booking = await prisma.booking.findUnique({ where: { id: link.bookingId }, include: { payments: true, milestones: true } });
  if (booking?.opportunityId) {
    await prisma.opportunity.updateMany({
      where: { id: booking.opportunityId },
      data: { amountPaid: round2(booking.payments.reduce((s, p) => s + Number(p.amount), 0)) },
    }).catch(() => {});
  }
  // Tell whoever made the booking, and thank the buyer.
  if (booking?.createdBy) {
    const staff = await prisma.user.findFirst({ where: { username: booking.createdBy }, select: { id: true } });
    if (staff) {
      await require('../controllers/notificationController').notify(staff.id, {
        title: `${inr(amount)} received online from ${booking.buyerName}`,
        body: link.description, url: '/bookings', kind: 'payment',
      }).catch(() => {});
    }
  }
  if (booking?.buyerEmail) {
    const s = summarize(booking);
    await sendMail({
      to: booking.buyerEmail,
      category: 'buyer-receipt',
      subject: `Payment received — ${inr(amount)}`,
      html: `<div style="font-family:Arial,sans-serif;padding:20px">
        <h2 style="margin:0 0 12px">Thank you, ${esc(booking.buyerName)}</h2>
        <p>We have received <strong>${inr(amount)}</strong> (${esc(link.description)}).</p>
        <p>Receipt: <strong>${esc(payment.receiptNo)}</strong> · Razorpay ref ${esc(paymentId)}</p>
        <p>Paid so far: ${inr(s.paid)} of ${inr(s.agreementValue)}. Balance: ${inr(s.balance)}.</p>
        <p>You can download your receipts any time from your buyer portal.</p>
      </div>`,
    }).catch(() => {});
  }
  return { payment, duplicate: false };
}

function verifyWebhookSignature(rawBody, signature, secret) {
  if (!secret || !rawBody || !signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected); const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---- buyer sign-in ------------------------------------------------------- */

/** A one-time sign-in link for a buyer email in the current company. */
async function issueLoginLink(email, { createdBy = null, ttlMs = 30 * 60 * 1000 } = {}) {
  const token = crypto.randomBytes(32).toString('hex');
  await prisma.buyerLoginToken.create({
    data: { tokenHash: hash(token), email: String(email).trim().toLowerCase(), expiresAt: new Date(Date.now() + ttlMs), createdBy },
  });
  const companyId = tenant.currentCompanyId();
  const company = await tenant.runAsSystem(() => prisma.company.findUnique({ where: { id: companyId } }));
  return `${await appBase(companyId)}/portal?company=${encodeURIComponent(company.slug)}&token=${token}`;
}

/** Exchange a link token for a buyer session (single use). Runs in resolving mode. */
async function exchangeLoginToken(token) {
  const row = await prisma.buyerLoginToken.findUnique({ where: { tokenHash: hash(token) } });
  if (!row || row.usedAt || row.expiresAt < new Date()) return null;
  tenant.adopt(row.companyId);
  const claim = await prisma.buyerLoginToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (claim.count !== 1) return null;
  const session = await prisma.buyerSession.create({ data: { email: row.email, expiry: new Date(Date.now() + 30 * DAY) } });
  return { session, email: row.email };
}

/** The buyer's bookings (by email) in the current company. */
function buyerBookings(email) {
  return prisma.booking.findMany({
    where: { buyerEmail: { equals: email, mode: 'insensitive' }, status: { not: 'Cancelled' } },
    include: { milestones: true, payments: { orderBy: { paidOn: 'asc' } } },
    orderBy: { bookingDate: 'desc' },
  });
}

/** Express middleware for /api/buyer: X-Buyer-Token → req.buyer, in the company's context. */
function buyerAuth(req, res, next) {
  const token = String(req.headers['x-buyer-token'] || '').trim();
  if (token.length < 32) return res.status(401).json({ message: 'Please sign in to your buyer portal.' });
  tenant.runResolving(async () => {
    const session = await prisma.buyerSession.findUnique({ where: { id: token } });
    if (!session || session.expiry < new Date()) return res.status(401).json({ message: 'Your portal link has expired. Ask for a new one.' });
    tenant.adopt(session.companyId);
    const company = await prisma.company.findUnique({ where: { id: session.companyId } });
    if (!company || company.status !== 'Active') return res.status(403).json({ message: 'This portal is not available right now.' });
    prisma.buyerSession.update({ where: { id: session.id }, data: { lastActive: new Date() } }).catch(() => {});
    req.buyer = { email: session.email, sessionId: session.id, companyId: session.companyId, company };
    return next();
  }).catch((error) => {
    console.error('Buyer auth failed:', error.message);
    res.status(500).json({ message: 'Could not check your sign-in.' });
  });
}

/* ---- reminders ----------------------------------------------------------- */

async function reminderSettings() {
  return prisma.collectionReminderSetting.findFirst();
}

/** Which reminder slot, if any, a milestone is in today. */
function slotFor(milestone, settings, now = new Date()) {
  if (!milestone.dueDate || milestone.outstanding <= 0) return null;
  const due = new Date(milestone.dueDate);
  const days = Math.floor((due.setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / DAY);
  if (days >= 0) return settings.daysBefore.includes(days) ? `before-${days}` : null;
  const late = -days;
  if (late % Math.max(1, settings.overdueEveryDays) !== 1 % Math.max(1, settings.overdueEveryDays)) return null;
  const n = Math.floor((late - 1) / Math.max(1, settings.overdueEveryDays)) + 1;
  return n <= settings.maxOverdue ? `overdue-${n}` : null;
}

/**
 * Send what is due for the current company. Called once a minute by the
 * background job; only acts between 9am and 8pm server time, and the unique
 * log row means each reminder goes out once however often it runs.
 */
async function runCollectionReminders({ now = new Date(), force = false } = {}) {
  const settings = await reminderSettings();
  if (!settings?.enabled) return { sent: 0 };
  const hour = now.getHours();
  if (!force && (hour < 9 || hour >= 20)) return { sent: 0 };

  const bookings = await prisma.booking.findMany({
    where: { status: { not: 'Cancelled' } },
    include: { milestones: true, payments: true },
  });
  const companyId = tenant.currentCompanyId();
  const company = await tenant.runAsSystem(() => prisma.company.findUnique({ where: { id: companyId } }));
  let sent = 0;
  for (const booking of bookings) {
    for (const m of summarize(booking, now).milestones) {
      const slot = slotFor(m, settings, now);
      if (!slot) continue;
      const channels = [settings.email && booking.buyerEmail ? 'email' : null, settings.whatsapp && booking.buyerMobile && settings.whatsappTemplate ? 'whatsapp' : null].filter(Boolean);
      for (const channel of channels) {
        // Claim first: the unique key makes a second send impossible.
        let log;
        try {
          log = await prisma.collectionReminderLog.create({ data: { bookingId: booking.id, milestoneId: m.id, slot, channel, status: 'sending' } });
        } catch (error) {
          if (error.code === 'P2002') continue;
          throw error;
        }
        try {
          let payUrl = null;
          if (settings.includePayLink && await gateway()) {
            payUrl = (await createPaymentLink(booking, { milestoneId: m.id, createdBy: 'reminder' }).catch(() => null))?.shortUrl || null;
          }
          const portal = booking.buyerEmail ? await issueLoginLink(booking.buyerEmail, { createdBy: 'reminder', ttlMs: 7 * DAY }) : null;
          const overdue = slot.startsWith('overdue');
          const when = new Date(m.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
          let outcome = { status: 'sent' };
          if (channel === 'email') {
            // Queued on an SMTP failure and retried by the mail job.
            outcome = await sendMail({
              to: booking.buyerEmail,
              category: 'collection-reminder',
              subject: overdue ? `Payment overdue: ${m.name} — ${inr(m.outstanding)}` : `Payment due ${when}: ${m.name} — ${inr(m.outstanding)}`,
              html: `<div style="font-family:Arial,sans-serif;padding:20px;line-height:1.6">
                <p>Dear ${esc(booking.buyerName)},</p>
                <p>${overdue ? 'This payment is now overdue' : 'This is a reminder that a payment is coming up'} for your booking <strong>${esc(booking.id)}</strong>:</p>
                <p style="font-size:18px"><strong>${esc(m.name)}: ${inr(m.outstanding)}</strong> — due ${esc(when)}</p>
                ${payUrl ? `<p><a href="${esc(payUrl)}" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Pay ${inr(m.outstanding)} online</a></p>` : ''}
                ${portal ? `<p>See your full payment plan and receipts in your <a href="${esc(portal)}">buyer portal</a>.</p>` : ''}
                <p>If you have already paid, please ignore this message.</p>
                <p>— ${esc(company?.name || 'The sales team')}</p>
              </div>`,
            });
          } else {
            const { sendWhatsApp, toWaNumber } = require('./whatsapp');
            await sendWhatsApp({
              to: toWaNumber(booking.buyerMobile),
              template: settings.whatsappTemplate,
              language: settings.whatsappLanguage || 'en',
              params: [booking.buyerName, m.name, inr(m.outstanding), when, payUrl || portal || ''],
            });
          }
          await prisma.collectionReminderLog.update({ where: { id: log.id }, data: { status: outcome.status, error: outcome.error || null } });
          if (outcome.status !== 'skipped') sent += 1;
        } catch (error) {
          await prisma.collectionReminderLog.update({ where: { id: log.id }, data: { status: 'failed', error: String(error.message).slice(0, 500) } }).catch(() => {});
        }
      }
    }
  }
  return { sent };
}

module.exports = {
  gateway, createPaymentLink, recordLinkPayment, verifyWebhookSignature,
  issueLoginLink, exchangeLoginToken, buyerBookings, buyerAuth,
  reminderSettings, runCollectionReminders, slotFor, hash,
};
