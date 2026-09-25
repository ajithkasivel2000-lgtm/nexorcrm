const prisma = require('../prismaClient');
const tenant = require('../utils/tenant');
const storage = require('../utils/storage');
const collections = require('../utils/collections');
const { summarize } = require('../utils/bookings');
const { sendMail } = require('../utils/mailer');
const { sendError } = require('../utils/apiError');

/**
 * The buyer portal: people who bought a unit see their booking, payment plan,
 * receipts and documents, and can pay online.
 *
 * Buyers have no password. They sign in with a one-time link, either emailed
 * to the address on their booking or made by staff to send on WhatsApp, which
 * is exchanged for a buyer session (X-Buyer-Token). Everything is looked up by
 * that email, inside the company the session belongs to.
 */

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]);
const SENT = 'If that email is on a booking with us, a sign-in link is on its way. It works for 30 minutes.';

/** POST /api/buyer/request-link { company, email }. Always the same answer. */
exports.requestLink = (req, res) => tenant.runResolving(async () => {
  try {
    const slug = String(req.body?.company || '').trim().toLowerCase();
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!slug || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ message: 'Enter the email address on your booking.' });
    const company = await prisma.company.findUnique({ where: { slug } });
    if (!company || company.status !== 'Active') return res.status(200).json({ message: SENT });
    tenant.adopt(company.id);
    const bookings = await collections.buyerBookings(email);
    if (bookings.length) {
      const url = await collections.issueLoginLink(email, { createdBy: 'buyer' });
      await sendMail({
        to: email,
        category: 'buyer-login',
        subject: `Your ${company.name} buyer portal link`,
        html: `<div style="font-family:Arial,sans-serif;padding:20px;line-height:1.6">
          <p>Hello ${esc(bookings[0].buyerName)},</p>
          <p>Use the button below to open your buyer portal. It works once, for the next 30 minutes.</p>
          <p><a href="${esc(url)}" style="display:inline-block;background:#4F46E5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Open my buyer portal</a></p>
          <p style="color:#666;font-size:13px">If you did not ask for this, you can ignore this email.</p>
        </div>`,
      }).catch((error) => console.error('Buyer link email failed:', error.message));
    }
    return res.status(200).json({ message: SENT });
  } catch (error) {
    return sendError(res, error, 'Could not send the link', 500);
  }
});

/** POST /api/buyer/sign-in { token } returns { token }, the buyer session. */
exports.signIn = (req, res) => tenant.runResolving(async () => {
  try {
    const token = String(req.body?.token || '').trim();
    if (!/^[a-f0-9]{64}$/.test(token)) return res.status(400).json({ message: 'That link is not valid.' });
    const result = await collections.exchangeLoginToken(token);
    if (!result) return res.status(401).json({ message: 'That link has expired or was already used. Ask for a new one.' });
    return res.status(200).json({ token: result.session.id, email: result.email });
  } catch (error) {
    return sendError(res, error, 'Could not sign you in', 500);
  }
});

exports.signOut = async (req, res) => {
  await prisma.buyerSession.deleteMany({ where: { id: req.buyer.sessionId } }).catch(() => {});
  res.status(200).json({ message: 'Signed out.' });
};

/** GET /api/buyer/me: everything the portal shows. */
exports.me = async (req, res) => {
  try {
    const bookings = await collections.buyerBookings(req.buyer.email);
    const ids = bookings.map((b) => b.id);
    const units = await prisma.projectUnit.findMany({ where: { id: { in: bookings.map((b) => b.unitId) } } });
    const [buildings, projects, documents, links, online] = await Promise.all([
      prisma.projectBuilding.findMany({ where: { id: { in: units.map((u) => u.buildingId).filter(Boolean) } }, select: { id: true, name: true } }),
      prisma.project.findMany({ where: { id: { in: bookings.map((b) => b.projectId) } }, select: { id: true, projectName: true, projectLocation: true, city: true } }),
      prisma.document.findMany({ where: { entityType: 'booking', entityId: { in: ids } }, orderBy: { createdAt: 'desc' } }),
      prisma.paymentLink.findMany({ where: { bookingId: { in: ids }, status: 'created', expiresAt: { gt: new Date() } } }),
      collections.gateway(),
    ]);
    const c = req.buyer.company;
    res.status(200).json({
      email: req.buyer.email,
      company: {
        name: c.name, slug: c.slug, brandColor: c.brandColor || null,
        logoUrl: c.logoKey ? `/api/public/branding/logo/${c.id}` : null,
        phone: c.phone || null, email: c.billingEmail || null,
      },
      onlinePayments: Boolean(online),
      bookings: bookings.map((b) => {
        const unit = units.find((u) => u.id === b.unitId);
        const project = projects.find((p) => p.id === b.projectId);
        return {
          id: b.id,
          buyerName: b.buyerName,
          status: b.status,
          bookingDate: b.bookingDate,
          agreementValue: b.agreementValue,
          project: project ? { name: project.projectName, location: project.projectLocation || project.city || null } : null,
          unit: unit ? {
            number: unit.unitNumber,
            building: buildings.find((x) => x.id === unit.buildingId)?.name || null,
            floor: unit.floor, type: unit.bhk || unit.unitType || null,
            area: unit.carpetArea || unit.saleableArea || null,
          } : null,
          summary: summarize(b),
          payments: b.payments.map((p) => ({ id: p.id, amount: p.amount, paidOn: p.paidOn, mode: p.mode, reference: p.reference, receiptNo: p.receiptNo })),
          documents: documents.filter((d) => d.entityId === b.id)
            .map((d) => ({ id: d.id, fileName: d.fileName, category: d.category, size: d.size, createdAt: d.createdAt })),
          openLinks: links.filter((l) => l.bookingId === b.id)
            .map((l) => ({ id: l.id, milestoneId: l.milestoneId, amount: l.amount, shortUrl: l.shortUrl })),
        };
      }),
    });
  } catch (error) {
    sendError(res, error, 'Could not load your bookings', 500);
  }
};

/** POST /api/buyer/bookings/:id/pay { milestoneId? } returns { shortUrl }. */
exports.pay = async (req, res) => {
  try {
    const booking = (await collections.buyerBookings(req.buyer.email)).find((b) => b.id === req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    const link = await collections.createPaymentLink(booking, { milestoneId: req.body?.milestoneId || null, createdBy: 'buyer' });
    res.status(200).json({ shortUrl: link.shortUrl, amount: link.amount });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    sendError(res, error, 'Could not start the payment', 500);
  }
};

/** GET /api/buyer/documents/:id: only documents on this buyer's own bookings. */
exports.document = async (req, res) => {
  try {
    const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
    const mine = doc?.entityType === 'booking'
      && (await collections.buyerBookings(req.buyer.email)).some((b) => b.id === doc.entityId);
    if (!mine) return res.status(404).json({ message: 'File not found' });
    await storage.send(res, doc.storedName, { contentType: doc.mimeType, fileName: doc.fileName, inline: req.query.inline === '1' });
  } catch (error) {
    sendError(res, error, 'Could not download the file', 500);
  }
};
