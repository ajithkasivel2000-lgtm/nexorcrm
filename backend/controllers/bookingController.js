const prisma = require('../prismaClient');
const { sendError } = require('../utils/apiError');
const {
  PLAN_TEMPLATES, buildMilestones, templateSteps, summarize, commissionFor, round2,
} = require('../utils/bookings');

/**
 * Bookings: a unit sold to a buyer, its payment plan, the money received and
 * the channel partner's commission.
 *
 *   GET    /api/bookings                list (?projectId, ?status, ?q)
 *   GET    /api/bookings/plans          the ready-made payment plans
 *   GET    /api/bookings/collections    open milestones: due soon and overdue
 *   GET    /api/bookings/:id            one booking with its ledger
 *   POST   /api/bookings                book a unit
 *   PUT    /api/bookings/:id            status / notes / buyer details
 *   POST   /api/bookings/:id/cancel     cancel and release the unit
 *   POST   /api/bookings/:id/payments   record money received
 *   DELETE /api/bookings/:id/payments/:paymentId
 *   PUT    /api/bookings/:id/commission commission status (Approved / Paid)
 */

const WITH_LEDGER = { milestones: true, payments: { orderBy: { paidOn: 'asc' } }, commission: true };

/* What a cost sheet needs from the project: address, RERA, and the charges and
   taxes on top of the unit price. */
const COST_SHEET_FIELDS = {
  id: true, projectName: true, addressLine1: true, addressLine2: true, locality: true, city: true,
  state: true, pincode: true, reraNumber: true, builder: true, gstPercent: true, stampDutyPercent: true,
  registrationPercent: true, parkingCharges: true, clubHouseCharges: true, maintenanceCharges: true,
  corpusFund: true, floorRiseCharges: true, otherCharges: true,
};

const actorOf = (req) => req.user?.username || null;

/** A booking as the screens want it: the row, its ledger and the totals. */
function present(booking) {
  return { ...booking, summary: summarize(booking) };
}

/** Keep the opportunity's own booking fields in step, for the screens that read them. */
async function syncOpportunity(booking) {
  if (!booking.opportunityId) return;
  const paid = round2((booking.payments || []).reduce((s, p) => s + Number(p.amount), 0));
  await prisma.opportunity.updateMany({
    where: { id: booking.opportunityId },
    data: {
      bookingDate: booking.bookingDate,
      agreementValue: booking.agreementValue,
      bookingAmount: booking.bookingAmount,
      amountPaid: paid,
      selectedUnit: booking.unitId,
    },
  }).catch((error) => console.error('Could not update the opportunity from its booking:', error.message));
}

exports.plans = (_req, res) => {
  res.status(200).json(Object.entries(PLAN_TEMPLATES).map(([key, plan]) => ({
    key, label: plan.label, steps: plan.steps.map(([name, percent]) => ({ name, percent })),
  })));
};

exports.list = async (req, res) => {
  try {
    const where = {};
    if (req.query.projectId) where.projectId = String(req.query.projectId);
    if (req.query.status) where.status = String(req.query.status);
    if (req.query.q) {
      const q = String(req.query.q);
      where.OR = [
        { buyerName: { contains: q, mode: 'insensitive' } },
        { buyerMobile: { contains: q } },
        { id: { contains: q, mode: 'insensitive' } },
      ];
    }
    const bookings = await prisma.booking.findMany({
      where, include: WITH_LEDGER, orderBy: { bookingDate: 'desc' }, take: 500,
    });
    const units = await prisma.projectUnit.findMany({
      where: { id: { in: bookings.map((b) => b.unitId) } },
      select: { id: true, unitNumber: true, unitType: true },
    });
    const projects = await prisma.project.findMany({
      where: { id: { in: [...new Set(bookings.map((b) => b.projectId))] } },
      select: { id: true, projectName: true },
    });
    const unitById = new Map(units.map((u) => [u.id, u]));
    const projectById = new Map(projects.map((p) => [p.id, p]));
    res.status(200).json(bookings.map((b) => ({
      ...present(b),
      unit: unitById.get(b.unitId) || null,
      projectName: projectById.get(b.projectId)?.projectName || b.projectId,
    })));
  } catch (error) {
    sendError(res, error, 'Could not load bookings', 500);
  }
};

exports.get = async (req, res) => {
  try {
    const booking = await prisma.booking.findUnique({ where: { id: req.params.id }, include: WITH_LEDGER });
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    const [unit, project] = await Promise.all([
      prisma.projectUnit.findUnique({ where: { id: booking.unitId } }),
      prisma.project.findUnique({ where: { id: booking.projectId }, select: COST_SHEET_FIELDS }),
    ]);
    res.status(200).json({ ...present(booking), unit, project });
  } catch (error) {
    sendError(res, error, 'Could not load the booking', 500);
  }
};

exports.create = async (req, res) => {
  try {
    const {
      projectId, unitId, opportunityId, leadId, customerId,
      buyerName, buyerMobile, buyerEmail, bookingDate,
      agreementValue, bookingAmount, bookingAmountPaid, paymentMode, paymentReference,
      plan, steps, channelPartnerId, commissionPct, notes,
    } = req.body || {};

    if (!projectId || !unitId) return res.status(400).json({ message: 'Project and unit are required.' });
    if (!buyerName || !String(buyerName).trim()) return res.status(400).json({ message: 'Buyer name is required.' });
    const value = Number(agreementValue);
    if (!(value > 0)) return res.status(400).json({ message: 'Agreement value must be more than zero.' });

    let milestones;
    try {
      milestones = buildMilestones(value, Array.isArray(steps) && steps.length ? steps : templateSteps(plan || 'construction-linked'));
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }

    const booking = await prisma.$transaction(async (tx) => {
      // The unit is claimed by a conditional update: two people booking the
      // same flat at once — only one of them wins it.
      const claimed = await tx.projectUnit.updateMany({
        where: { id: unitId, projectId, status: { notIn: ['Booked', 'Sold', 'Blocked'] } },
        data: { status: 'Booked', opportunityId: opportunityId || null, reservedFor: String(buyerName).trim() },
      });
      if (claimed.count !== 1) {
        const exists = await tx.projectUnit.findUnique({ where: { id: unitId } });
        const reason = exists ? `This unit is already ${exists.status}.` : 'That unit was not found in this project.';
        const err = new Error(reason); err.status = 409; throw err;
      }

      const created = await tx.booking.create({
        data: {
          projectId,
          unitId,
          opportunityId: opportunityId || null,
          leadId: leadId || null,
          customerId: customerId || null,
          buyerName: String(buyerName).trim(),
          buyerMobile: buyerMobile || null,
          buyerEmail: buyerEmail || null,
          bookingDate: bookingDate ? new Date(bookingDate) : new Date(),
          agreementValue: value,
          bookingAmount: bookingAmount != null && bookingAmount !== '' ? Number(bookingAmount) : null,
          channelPartnerId: channelPartnerId || null,
          commissionPct: commissionPct != null && commissionPct !== '' ? Number(commissionPct) : null,
          notes: notes || null,
          createdBy: actorOf(req),
          milestones: { create: milestones },
        },
      });

      if (bookingAmountPaid && Number(bookingAmount) > 0) {
        await tx.payment.create({
          data: {
            bookingId: created.id,
            amount: Number(bookingAmount),
            paidOn: created.bookingDate,
            mode: paymentMode || null,
            reference: paymentReference || null,
            receiptNo: `RCPT-${created.id}-1`,
            notes: 'Booking amount',
            recordedBy: actorOf(req),
          },
        });
      }

      if (channelPartnerId && Number(commissionPct) > 0) {
        await tx.commission.create({
          data: {
            bookingId: created.id,
            channelPartnerId,
            percent: Number(commissionPct),
            amount: commissionFor(value, commissionPct),
          },
        });
      }

      return tx.booking.findUnique({ where: { id: created.id }, include: WITH_LEDGER });
    });

    await syncOpportunity(booking);
    res.status(201).json(present(booking));
  } catch (error) {
    if (error.status === 409) return res.status(409).json({ message: error.message });
    sendError(res, error, 'Could not create the booking', 400);
  }
};

exports.update = async (req, res) => {
  try {
    const allowed = ['status', 'notes', 'buyerName', 'buyerMobile', 'buyerEmail', 'customerId'];
    const data = {};
    for (const key of allowed) if (req.body?.[key] !== undefined) data[key] = req.body[key];
    if (data.status === 'Cancelled') {
      return res.status(400).json({ message: 'Use cancel to cancel a booking, so the unit is released.' });
    }
    if (data.status && !['Booked', 'Agreement', 'Registered'].includes(data.status)) {
      return res.status(400).json({ message: 'Unknown booking status.' });
    }
    const booking = await prisma.booking.update({ where: { id: req.params.id }, data, include: WITH_LEDGER });
    if (data.status === 'Registered') {
      await prisma.projectUnit.updateMany({ where: { id: booking.unitId }, data: { status: 'Sold' } });
    }
    res.status(200).json(present(booking));
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Booking not found' });
    sendError(res, error, 'Could not update the booking', 400);
  }
};

exports.cancel = async (req, res) => {
  try {
    const booking = await prisma.$transaction(async (tx) => {
      const current = await tx.booking.findUnique({ where: { id: req.params.id } });
      if (!current) { const e = new Error('Booking not found'); e.status = 404; throw e; }
      if (current.status === 'Cancelled') return tx.booking.findUnique({ where: { id: current.id }, include: WITH_LEDGER });
      await tx.projectUnit.updateMany({
        where: { id: current.unitId },
        data: { status: 'Available', opportunityId: null, reservedFor: null },
      });
      await tx.commission.updateMany({ where: { bookingId: current.id, status: { not: 'Paid' } }, data: { status: 'Cancelled' } });
      const reason = req.body?.reason ? `Cancelled: ${req.body.reason}` : 'Cancelled';
      return tx.booking.update({
        where: { id: current.id },
        data: { status: 'Cancelled', notes: [current.notes, reason].filter(Boolean).join('\n') },
        include: WITH_LEDGER,
      });
    });
    res.status(200).json(present(booking));
  } catch (error) {
    if (error.status === 404) return res.status(404).json({ message: error.message });
    sendError(res, error, 'Could not cancel the booking', 400);
  }
};

exports.addPayment = async (req, res) => {
  try {
    const amount = Number(req.body?.amount);
    if (!(amount > 0)) return res.status(400).json({ message: 'Amount must be more than zero.' });
    const booking = await prisma.booking.findUnique({ where: { id: req.params.id }, include: WITH_LEDGER });
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (booking.status === 'Cancelled') return res.status(400).json({ message: 'This booking is cancelled.' });

    const { balance } = summarize(booking);
    if (amount > balance + 0.01) {
      return res.status(400).json({ message: `That is more than the balance of ${balance}.` });
    }
    const count = await prisma.payment.count({ where: { bookingId: booking.id } });
    await prisma.payment.create({
      data: {
        bookingId: booking.id,
        amount,
        paidOn: req.body.paidOn ? new Date(req.body.paidOn) : new Date(),
        mode: req.body.mode || null,
        reference: req.body.reference || null,
        receiptNo: req.body.receiptNo || `RCPT-${booking.id}-${count + 1}`,
        notes: req.body.notes || null,
        recordedBy: actorOf(req),
      },
    });
    const updated = await prisma.booking.findUnique({ where: { id: booking.id }, include: WITH_LEDGER });
    await syncOpportunity(updated);
    res.status(201).json(present(updated));
  } catch (error) {
    sendError(res, error, 'Could not record the payment', 400);
  }
};

exports.deletePayment = async (req, res) => {
  try {
    const result = await prisma.payment.deleteMany({ where: { id: req.params.paymentId, bookingId: req.params.id } });
    if (result.count === 0) return res.status(404).json({ message: 'Payment not found' });
    const updated = await prisma.booking.findUnique({ where: { id: req.params.id }, include: WITH_LEDGER });
    await syncOpportunity(updated);
    res.status(200).json(present(updated));
  } catch (error) {
    sendError(res, error, 'Could not delete the payment', 400);
  }
};

exports.updateCommission = async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!['Pending', 'Approved', 'Paid'].includes(status)) return res.status(400).json({ message: 'Unknown commission status.' });
    const result = await prisma.commission.updateMany({
      where: { bookingId: req.params.id, status: { not: 'Cancelled' } },
      data: { status, paidOn: status === 'Paid' ? new Date() : null },
    });
    if (result.count === 0) return res.status(404).json({ message: 'This booking has no open commission.' });
    const updated = await prisma.booking.findUnique({ where: { id: req.params.id }, include: WITH_LEDGER });
    res.status(200).json(present(updated));
  } catch (error) {
    sendError(res, error, 'Could not update the commission', 400);
  }
};

/** Every open milestone that is overdue or due within `days` (default 30). */
exports.collections = async (req, res) => {
  try {
    const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));
    const horizon = new Date(Date.now() + days * 86400000);
    const bookings = await prisma.booking.findMany({
      where: { status: { not: 'Cancelled' } },
      include: WITH_LEDGER,
    });
    const rows = [];
    let overdueTotal = 0;
    let dueTotal = 0;
    for (const booking of bookings) {
      for (const m of summarize(booking).milestones) {
        if (m.outstanding <= 0 || !m.dueDate || new Date(m.dueDate) > horizon) continue;
        if (m.overdue) overdueTotal += m.outstanding; else dueTotal += m.outstanding;
        rows.push({
          bookingId: booking.id, buyerName: booking.buyerName, buyerMobile: booking.buyerMobile,
          unitId: booking.unitId, projectId: booking.projectId,
          milestone: m.name, dueDate: m.dueDate, outstanding: m.outstanding, overdue: m.overdue,
        });
      }
    }
    rows.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    res.status(200).json({ overdueTotal: round2(overdueTotal), dueTotal: round2(dueTotal), rows });
  } catch (error) {
    sendError(res, error, 'Could not load collections', 500);
  }
};
