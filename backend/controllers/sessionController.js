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

exports.getSessionsByUser = async (req, res) => {
  try {
    const { username } = req.params;
    const sessions = await prisma.session.findMany({
      where: { username },
      orderBy: { lastActive: 'desc' }
    });
    res.status(200).json(sessions);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching user sessions', error: error.message });
  }
};

exports.deleteBulkSessions = async (req, res) => {
  try {
    const { sessionIds } = req.body;
    if (!sessionIds || !Array.isArray(sessionIds)) {
      return res.status(400).json({ message: 'sessionIds array is required' });
    }
    await prisma.session.deleteMany({
      where: { id: { in: sessionIds } }
    });
    res.status(200).json({ message: 'Selected sessions deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting sessions', error: error.message });
  }
};