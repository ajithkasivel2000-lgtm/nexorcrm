const prisma = require('../prismaClient');
const { sendError } = require('../utils/apiError');

exports.getLogs = async (req, res) => {
  try {
    const logs = await prisma.systemLog.findMany({
      orderBy: {
        createdAt: 'desc'
      }
    });
    res.status(200).json(logs);
  } catch (error) {
    sendError(res, error, 'Error fetching logs', 500);
  }
};

exports.deleteAllLogs = async (req, res) => {
  try {
    await prisma.systemLog.deleteMany({});
    res.status(200).json({ message: 'All logs deleted successfully' });
  } catch (error) {
    sendError(res, error, 'Error deleting all logs', 500);
  }
};

exports.deleteOldLogs = async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    await prisma.systemLog.deleteMany({
      where: {
        createdAt: {
          lt: thirtyDaysAgo
        }
      }
    });
    res.status(200).json({ message: 'Logs older than 30 days deleted successfully' });
  } catch (error) {
    sendError(res, error, 'Error deleting old logs', 500);
  }
};

/**
 * A user's login history, paged and optionally filtered by event.
 *
 * The User 360 activity tab reads this; ?page & ?limit keep the payload small
 * instead of shipping every login the account has ever had, and ?event=LOGIN
 * style filters are applied in the query so the pager stays honest.
 */
exports.getLogsByUser = async (req, res) => {
  try {
    const { username } = req.params;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, parseInt(req.query.limit, 10) || 50);
    const where = { username };
    if (req.query.event) where.event = req.query.event;

    const [items, total] = await Promise.all([
      prisma.systemLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.systemLog.count({ where }),
    ]);

    // Plain array when no paging was asked for, so the existing Active
    // Sessions / Logs screens keep working unchanged.
    if (!req.query.page && !req.query.limit) {
      return res.status(200).json(items);
    }
    res.status(200).json({ items, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    sendError(res, error, 'Error fetching user logs', 500);
  }
};
