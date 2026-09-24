const prisma = require('../prismaClient');
const { sendError } = require('../utils/apiError');
const { publicSession, idsForHandles } = require('../utils/sessionHandle');

exports.getSessions = async (req, res) => {
  try {
    const sessions = await prisma.session.findMany({ orderBy: { lastActive: 'desc' } });
    res.status(200).json(sessions.map((s) => publicSession(s, req.sessionId)));
  } catch (error) {
    sendError(res, error, 'Error fetching sessions', 500);
  }
};

exports.clearAllSessions = async (req, res) => {
  try {
    await prisma.session.deleteMany({});
    res.status(200).json({ message: 'All sessions cleared' });
  } catch (error) {
    sendError(res, error, 'Error clearing sessions', 500);
  }
};

exports.getSessionsByUser = async (req, res) => {
  try {
    const { username } = req.params;
    const sessions = await prisma.session.findMany({
      where: { username },
      orderBy: { lastActive: 'desc' }
    });
    res.status(200).json(sessions.map((s) => publicSession(s, req.sessionId)));
  } catch (error) {
    sendError(res, error, 'Error fetching user sessions', 500);
  }
};

exports.deleteBulkSessions = async (req, res) => {
  try {
    const { sessionIds } = req.body;
    if (!sessionIds || !Array.isArray(sessionIds)) {
      return res.status(400).json({ message: 'sessionIds array is required' });
    }
    // The list hands out handles, so that is what comes back to name a session.
    const ids = await idsForHandles(sessionIds);
    await prisma.session.deleteMany({
      where: { id: { in: ids } }
    });
    res.status(200).json({ message: 'Selected sessions deleted' });
  } catch (error) {
    sendError(res, error, 'Error deleting sessions', 500);
  }
};