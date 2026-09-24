const prisma = require('../prismaClient');
const { sendError } = require('../utils/apiError');

/**
 * The open reason master list.
 *
 * Read by the Attempted dialog and the lead profile's Attempted tab, so the
 * options can be changed without a code release.
 */
exports.getAll = async (req, res) => {
  try {
    const rows = await prisma.openReason.findMany({ orderBy: { reasonName: 'asc' } });
    res.status(200).json(rows);
  } catch (error) {
    sendError(res, error, 'Error fetching open reasons', 500);
  }
};

exports.create = async (req, res) => {
  try {
    const name = String(req.body.reasonName || '').trim();
    if (!name) return res.status(400).json({ message: 'A open reason name is required' });

    // Case-insensitive, so "Not reachable" cannot be added beside "Not Reachable".
    const clash = await prisma.openReason.findFirst({
      where: { reasonName: { equals: name, mode: 'insensitive' } },
    });
    if (clash) return res.status(409).json({ message: `"${name}" is already on the list` });

    const row = await prisma.openReason.create({ data: { reasonName: name } });
    res.status(201).json(row);
  } catch (error) {
    sendError(res, error, 'Error creating open reason', 400);
  }
};

exports.update = async (req, res) => {
  try {
    const row = await prisma.openReason.update({ where: { id: req.params.id }, data: req.body });
    res.status(200).json(row);
  } catch (error) {
    sendError(res, error, 'Error updating open reason', 400);
  }
};

exports.remove = async (req, res) => {
  try {
    await prisma.openReason.delete({ where: { id: req.params.id } });
    res.status(200).json({ message: 'Deleted successfully' });
  } catch (error) {
    sendError(res, error, 'Error deleting open reason', 500);
  }
};
