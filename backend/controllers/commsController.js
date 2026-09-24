const prisma = require('../prismaClient');
const { sendError } = require('../utils/apiError');
const { sendWhatsApp, toWaNumber } = require('../utils/whatsapp');
const { connectCall, toExotelNumber, callbackSignature } = require('../utils/exotel');
const { recordLeadActivity } = require('../utils/leadAssignment');

/**
 * Talking to a lead from the CRM: WhatsApp messages and click-to-call.
 * Every route here runs after requireLeadAccess, so only people who may open
 * the lead can message or call it.
 *
 *   GET  /api/leads/:id/whatsapp   the conversation, oldest first
 *   POST /api/leads/:id/whatsapp   { text } or { template, language?, params? }
 *   GET  /api/leads/:id/calls      calls placed to this lead
 *   POST /api/leads/:id/call       ring my phone, then connect the lead
 */

const logOnLead = (leadId, title, subtitle, actor) => prisma.leadLog.create({
  data: { leadId, title, subtitle: String(subtitle || '').slice(0, 500), actor: actor || null, date: new Date() },
}).catch((error) => console.error('Could not write the lead log:', error.message));

exports.whatsappThread = async (req, res) => {
  try {
    const messages = await prisma.whatsAppMessage.findMany({
      where: { leadId: req.params.id },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    res.status(200).json(messages);
  } catch (error) {
    sendError(res, error, 'Could not load the WhatsApp conversation', 500);
  }
};

exports.sendWhatsApp = async (req, res) => {
  try {
    const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    const to = toWaNumber(lead.mobile, lead.mobileCountryCode);
    if (!to) return res.status(400).json({ message: 'This lead has no mobile number.' });

    const { text, template, language, params } = req.body || {};
    let result;
    try {
      result = await sendWhatsApp({ to, text, template, language, params });
    } catch (error) {
      await prisma.whatsAppMessage.create({
        data: {
          leadId: lead.id, direction: 'out', phone: to, body: text || null, template: template || null,
          status: 'failed', error: error.message.slice(0, 500), sentBy: req.user.username,
        },
      }).catch(() => {});
      return res.status(error.status || 502).json({ message: error.message });
    }

    const message = await prisma.whatsAppMessage.create({
      data: {
        leadId: lead.id, direction: 'out', phone: to, body: text || null, template: template || null,
        waMessageId: result.waMessageId, status: 'sent', sentBy: req.user.username,
      },
    });
    await logOnLead(lead.id, 'WhatsApp sent', template ? `Template: ${template}` : text, req.user.username);
    // Reaching out counts as acting on the lead: the follow-up clock stops.
    recordLeadActivity(lead.id, { actorId: req.user.id, actorName: req.user.username, kind: 'whatsapp' }).catch(() => {});
    res.status(201).json(message);
  } catch (error) {
    sendError(res, error, 'Could not send the WhatsApp message', 500);
  }
};

exports.callHistory = async (req, res) => {
  try {
    const calls = await prisma.callLog.findMany({
      where: { leadId: req.params.id },
      orderBy: { startedAt: 'desc' },
      take: 200,
    });
    res.status(200).json(calls);
  } catch (error) {
    sendError(res, error, 'Could not load the call history', 500);
  }
};

exports.placeCall = async (req, res) => {
  try {
    const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    const agent = toExotelNumber(req.user.phone, req.user.phoneCountryCode);
    if (!agent) {
      return res.status(400).json({ message: 'Add your own mobile number to your profile first — Exotel rings you, then connects the lead.' });
    }
    const customer = toExotelNumber(lead.mobile, lead.mobileCountryCode);
    if (!customer) return res.status(400).json({ message: 'This lead has no mobile number.' });

    const call = await prisma.callLog.create({
      data: { leadId: lead.id, userId: req.user.id, direction: 'outbound', fromNumber: agent, toNumber: customer, status: 'initiated' },
    });
    const sig = callbackSignature(call.id);
    const base = String(process.env.APP_URL || '').replace(/\/+$/, '');
    const statusCallback = sig && base ? `${base}/api/webhooks/exotel/${call.id}?sig=${sig}` : null;

    try {
      const result = await connectCall({ agentNumber: agent, customerNumber: customer, statusCallback });
      const updated = await prisma.callLog.update({
        where: { id: call.id },
        data: { callSid: result.callSid, status: result.status || 'queued' },
      });
      await logOnLead(lead.id, 'Call placed', `Click-to-call by ${req.user.username}`, req.user.username);
      recordLeadActivity(lead.id, { actorId: req.user.id, actorName: req.user.username, kind: 'call' }).catch(() => {});
      return res.status(201).json({ ...updated, message: 'Your phone will ring now. Answer it to be connected to the lead.' });
    } catch (error) {
      await prisma.callLog.update({ where: { id: call.id }, data: { status: 'failed', notes: error.message.slice(0, 500) } }).catch(() => {});
      return res.status(error.status || 502).json({ message: error.message });
    }
  } catch (error) {
    sendError(res, error, 'Could not place the call', 500);
  }
};
