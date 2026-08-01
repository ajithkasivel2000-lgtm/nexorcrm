const prisma = require('../prismaClient');

exports.getLogs = async (req, res) => {
  try {
    const logs = await prisma.systemLog.findMany({
      orderBy: {
        createdAt: 'desc'
      }
    });
    res.status(200).json(logs);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching logs', error: error.message });
  }
};

exports.deleteAllLogs = async (req, res) => {
  try {
    await prisma.systemLog.deleteMany({});
    res.status(200).json({ message: 'All logs deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting all logs', error: error.message });
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
    res.status(500).json({ message: 'Error deleting old logs', error: error.message });
  }
};

exports.getLogsByUser = async (req, res) => {
  try {
    const { username } = req.params;
    const logs = await prisma.systemLog.findMany({
      where: { username },
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json(logs);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching user logs', error: error.message });
  }
};
