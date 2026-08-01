const prisma = require('../prismaClient');

exports.getSessions = async (req, res) => {
  try {
    const sessions = await prisma.session.findMany({ orderBy: { lastActive: 'desc' } });
    res.status(200).json(sessions);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching sessions', error: error.message });
  }
};

exports.clearAllSessions = async (req, res) => {
  try {
    await prisma.session.deleteMany({});
    res.status(200).json({ message: 'All sessions cleared' });
  } catch (error) {
    res.status(500).json({ message: 'Error clearing sessions', error: error.message });
  }
};