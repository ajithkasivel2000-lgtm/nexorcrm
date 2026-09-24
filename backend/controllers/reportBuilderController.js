const prisma = require('../prismaClient');
const { sendError } = require('../utils/apiError');
const { schema, runReport } = require('../utils/reportBuilder');

/**
 * /api/report-builder — Managers and above with the Report page.
 *
 *   GET    /schema        what can be reported on
 *   POST   /run           { config } → { columns, rows }
 *   GET    /saved         saved reports (own + shared)
 *   POST   /saved         { name, config, shared? }
 *   PUT    /saved/:id
 *   DELETE /saved/:id
 */

exports.schema = (_req, res) => res.status(200).json(schema());

exports.run = async (req, res) => {
  try {
    res.status(200).json(await runReport(req.body?.config || req.body, req.user));
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    sendError(res, error, 'Could not run the report', 400);
  }
};

exports.listSaved = async (req, res) => {
  try {
    const rows = await prisma.savedReport.findMany({
      where: { OR: [{ shared: true }, { createdBy: req.user.username }] },
      orderBy: { updatedAt: 'desc' },
    });
    res.status(200).json(rows);
  } catch (error) {
    sendError(res, error, 'Could not load saved reports', 500);
  }
};

exports.save = async (req, res) => {
  try {
    const { name, config, shared } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ message: 'Name the report.' });
    await runReport(config, req.user); // refuse a report that does not run
    const row = await prisma.savedReport.create({
      data: { name: String(name).trim(), config, shared: shared !== false, createdBy: req.user.username },
    });
    res.status(201).json(row);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    sendError(res, error, 'Could not save the report', 400);
  }
};

exports.update = async (req, res) => {
  try {
    const existing = await prisma.savedReport.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Report not found' });
    const data = {};
    if (req.body?.name) data.name = String(req.body.name).trim();
    if (req.body?.config) { await runReport(req.body.config, req.user); data.config = req.body.config; }
    if (req.body?.shared !== undefined) data.shared = Boolean(req.body.shared);
    res.status(200).json(await prisma.savedReport.update({ where: { id: existing.id }, data }));
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    sendError(res, error, 'Could not update the report', 400);
  }
};

exports.remove = async (req, res) => {
  try {
    await prisma.scheduledReport.deleteMany({ where: { savedReportId: req.params.id } });
    const out = await prisma.savedReport.deleteMany({ where: { id: req.params.id } });
    if (!out.count) return res.status(404).json({ message: 'Report not found' });
    res.status(200).json({ message: 'Report deleted.' });
  } catch (error) {
    sendError(res, error, 'Could not delete the report', 400);
  }
};
