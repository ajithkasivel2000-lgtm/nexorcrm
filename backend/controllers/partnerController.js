const bcrypt = require('bcryptjs');
const prisma = require('../prismaClient');
const { sendError } = require('../utils/apiError');
const { intakeLead, IntakeError } = require('../utils/leadIntake');
const { isUsernameTaken } = require('../utils/companyAdmin');
const { summarize } = require('../utils/bookings');

/**
 * The channel partner portal.
 *
 * A partner signs in with an account an administrator created for them
 * (status 'Partner', linked to their ChannelPartner record). authMiddleware
 * keeps that account inside /api/partner; everything here is further limited
 * to the partner's own leads, bookings and commissions.
 *
 *   GET  /api/partner/me            profile and totals
 *   GET  /api/partner/leads         leads this partner brought in
 *   POST /api/partner/leads         submit a lead
 *   GET  /api/partner/commissions   earnings per booking
 *
 * And for administrators, on the Channel Partner record:
 *   POST /api/partner-accounts/:channelPartnerId   create the portal login
 *   GET  /api/partner-accounts/:channelPartnerId   who has a login
 */

/** The partner record behind the signed-in account, or a 403. */
async function myPartner(req, res) {
  if (String(req.user.status) !== 'Partner' || !req.user.channelPartnerId) {
    res.status(403).json({ message: 'This page is for channel partner accounts.' });
    return null;
  }
  const partner = await prisma.channelPartner.findUnique({ where: { id: req.user.channelPartnerId } });
  if (!partner) {
    res.status(403).json({ message: 'Your partner record no longer exists. Contact the company.' });
    return null;
  }
  return partner;
}

/** A partner sees enough of a lead to follow it, not the full record. */
const maskMobile = (m) => (m ? `${String(m).slice(0, 2)}••••••${String(m).slice(-2)}` : '');

exports.me = async (req, res) => {
  try {
    const partner = await myPartner(req, res);
    if (!partner) return;
    const [leads, byStatus, commissions] = await Promise.all([
      prisma.lead.count({ where: { channelPartnerId: partner.id } }),
      prisma.lead.groupBy({ by: ['status'], where: { channelPartnerId: partner.id }, _count: { id: true } }),
      prisma.commission.findMany({ where: { channelPartnerId: partner.id, status: { not: 'Cancelled' } } }),
    ]);
    const total = (status) => commissions.filter((c) => !status || c.status === status).reduce((s, c) => s + Number(c.amount), 0);
    res.status(200).json({
      partner: { id: partner.id, companyName: partner.companyName, ownerName: partner.ownerName, status: partner.status },
      leads,
      byStatus: byStatus.map((r) => ({ status: r.status, count: r._count.id })),
      commission: { total: total(), pending: total('Pending'), approved: total('Approved'), paid: total('Paid') },
    });
  } catch (error) {
    sendError(res, error, 'Could not load your partner summary', 500);
  }
};

exports.leads = async (req, res) => {
  try {
    const partner = await myPartner(req, res);
    if (!partner) return;
    const leads = await prisma.lead.findMany({
      where: { channelPartnerId: partner.id },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: { id: true, name: true, mobile: true, project: true, status: true, createdAt: true, siteVisitDate: true, bookingStatus: true },
    });
    const projectIds = [...new Set(leads.map((l) => l.project).filter(Boolean))];
    const projects = await prisma.project.findMany({
      where: { OR: [{ id: { in: projectIds } }, { projectName: { in: projectIds } }] },
      select: { id: true, projectName: true },
    });
    const nameOf = (p) => projects.find((x) => x.id === p || x.projectName === p)?.projectName || p;
    res.status(200).json(leads.map((l) => ({ ...l, mobile: maskMobile(l.mobile), project: nameOf(l.project) })));
  } catch (error) {
    sendError(res, error, 'Could not load your leads', 500);
  }
};

exports.submitLead = async (req, res) => {
  try {
    const partner = await myPartner(req, res);
    if (!partner) return;
    const { name, mobile, mobileCountryCode, email, project, notes } = req.body || {};
    const lead = await intakeLead({
      name, mobile, mobileCountryCode, email, project,
      primarySource: 'Channel partner',
      notes,
      channelPartnerId: partner.id,
      channelPartnerName: partner.companyName,
      creator: 'Channel Partner',
      logSubtitle: `submitted by ${partner.companyName} via the partner portal`,
    });
    res.status(201).json({ id: lead.id, status: lead.status, message: 'Lead submitted. You can follow its progress here.' });
  } catch (error) {
    if (error instanceof IntakeError) return res.status(400).json({ message: error.message });
    sendError(res, error, 'Could not submit the lead', 500);
  }
};

exports.commissions = async (req, res) => {
  try {
    const partner = await myPartner(req, res);
    if (!partner) return;
    const rows = await prisma.commission.findMany({
      where: { channelPartnerId: partner.id },
      include: { booking: { include: { milestones: true, payments: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.status(200).json(rows.map((c) => ({
      id: c.id,
      status: c.status,
      percent: c.percent,
      amount: c.amount,
      paidOn: c.paidOn,
      booking: {
        id: c.booking.id,
        buyerName: c.booking.buyerName,
        bookingDate: c.booking.bookingDate,
        agreementValue: c.booking.agreementValue,
        status: c.booking.status,
        percentPaidByBuyer: summarize(c.booking).percentPaid,
      },
    })));
  } catch (error) {
    sendError(res, error, 'Could not load your commissions', 500);
  }
};

/* ---- administrators: portal logins for a partner ------------------------ */

exports.listAccounts = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { channelPartnerId: req.params.channelPartnerId, status: 'Partner' },
      select: { id: true, username: true, email: true, lastLoginAt: true, createdAt: true },
    });
    res.status(200).json(users);
  } catch (error) {
    sendError(res, error, 'Could not load partner logins', 500);
  }
};

exports.createAccount = async (req, res) => {
  try {
    const partner = await prisma.channelPartner.findUnique({ where: { id: req.params.channelPartnerId } });
    if (!partner) return res.status(404).json({ message: 'Channel partner not found' });
    const { username, email, password } = req.body || {};
    if (!username || !email || !password) return res.status(400).json({ message: 'Username, email and password are required.' });
    if (String(password).length < 10) return res.status(400).json({ message: 'The password must be at least 10 characters.' });
    if (await isUsernameTaken(String(username).trim())) return res.status(409).json({ message: 'That username is already taken.' });

    const user = await prisma.user.create({
      data: {
        username: String(username).trim(),
        firstName: partner.ownerName || partner.companyName,
        email: String(email).trim(),
        password: await bcrypt.hash(String(password), 10),
        status: 'Partner',
        role: 'Partner',
        userlevel: 0,
        channelPartnerId: partner.id,
        forcePasswordChange: true,
      },
      select: { id: true, username: true, email: true, createdAt: true },
    });
    res.status(201).json(user);
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ message: 'That username is already taken.' });
    sendError(res, error, 'Could not create the partner login', 400);
  }
};
