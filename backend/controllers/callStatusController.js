const prisma = require('../prismaClient');
const { sendError } = require('../utils/apiError');

/**
 * The call status master list.
 *
 * Read by the Attempted dialog and the lead profile's Attempted tab, so the
 * options can be changed without a code release.
 */
exports.getAll = async (req, res) => {
  try {
    const rows = await prisma.callStatus.findMany({ orderBy: { statusName: 'asc' } });
    res.status(200).json(rows);
  } catch (error) {
    sendError(res, error, 'Error fetching call statuss', 500);
  }
};

exports.create = async (req, res) => {
  try {
    const name = String(req.body.statusName || '').trim();
    if (!name) return res.status(400).json({ message: 'A call status name is required' });

    // Case-insensitive, so "Not reachable" cannot be added beside "Not Reachable".
    const clash = await prisma.callStatus.findFirst({
      where: { statusName: { equals: name, mode: 'insensitive' } },
    });
    if (clash) return res.status(409).json({ message: `"${name}" is already on the list` });

    const row = await prisma.callStatus.create({ data: { statusName: name } });
    res.status(201).json(row);
  } catch (error) {
    sendError(res, error, 'Error creating call status', 400);
  }
};

exports.update = async (req, res) => {
  try {
    const row = await prisma.callStatus.update({ where: { id: req.params.id }, data: req.body });
    res.status(200).json(row);
  } catch (error) {
    sendError(res, error, 'Error updating call status', 400);
  }
};

exports.remove = async (req, res) => {
  try {
    await prisma.callStatus.delete({ where: { id: req.params.id } });
    res.status(200).json({ message: 'Deleted successfully' });
  } catch (error) {
    sendError(res, error, 'Error deleting call status', 500);
  }
};
