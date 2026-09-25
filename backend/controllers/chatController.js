/**
 * The assistant's conversations.
 *
 * Messages are stored so a conversation survives a refresh, a different
 * device, and signing out — the expectation anyone brings from a messaging
 * app. Each conversation belongs to one user and is only ever read back by
 * that user.
 */
const prisma = require('../prismaClient');
const { sendError } = require('../utils/apiError');
const { answerQuestion } = require('../utils/assistantAnswer');
const { SUGGESTIONS } = require('../utils/assistantKnowledge');

/** Who is asking. The routes are behind authMiddleware, so this is set. */
/* The routes sit behind authMiddleware, so req.user is always set here. The
   old x-username fallback is gone: that header is caller-controlled, and
   trusting it let a request choose whose name it acted as. */
const who = (req) => req.user?.username || null;

/** A conversation's name, taken from the first thing asked in it. */
function titleFrom(question) {
  const clean = String(question || '').trim().replace(/\s+/g, ' ');
  if (!clean) return 'New chat';
  return clean.length > 48 ? `${clean.slice(0, 45)}…` : clean;
}

/** The opening prompts, so an empty chat is not a blank box. */
exports.suggestions = async (req, res) => {
  res.status(200).json({ suggestions: SUGGESTIONS });
};

/** Every conversation this user has, newest activity first. */
exports.listConversations = async (req, res) => {
  try {
    const username = who(req);
    if (!username) return res.status(401).json({ message: 'Not signed in' });

    const rows = await prisma.chatConversation.findMany({
      where: { username },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      include: {
        // Enough for the preview line in the list.
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        _count: { select: { messages: true } },
      },
    });

    res.status(200).json(rows.map((c) => ({
      id: c.id,
      title: c.title,
      updatedAt: c.updatedAt,
      messageCount: c._count.messages,
      preview: c.messages[0]?.content || '',
    })));
  } catch (error) {
    sendError(res, error, 'Could not load your conversations', 500);
  }
};

/** One conversation, with everything said in it. */
exports.getConversation = async (req, res) => {
  try {
    const username = who(req);
    const row = await prisma.chatConversation.findUnique({
      where: { id: req.params.id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });

    if (!row) return res.status(404).json({ message: 'Conversation not found' });
    // Somebody else's conversation does not exist as far as this user is
    // concerned — the same answer either way, so the id tells them nothing.
    if (row.username !== username) return res.status(404).json({ message: 'Conversation not found' });

    res.status(200).json(row);
  } catch (error) {
    sendError(res, error, 'Could not load that conversation', 500);
  }
};

/**
 * Asks a question and stores both sides of the exchange.
 *
 * Creates the conversation on the first message rather than up front, so
 * opening the chat and closing it again leaves nothing behind.
 */
exports.ask = async (req, res) => {
  try {
    const username = who(req);
    if (!username) return res.status(401).json({ message: 'Not signed in' });

    const question = String(req.body?.question || '').trim();
    if (!question) return res.status(400).json({ message: 'Ask me something about the CRM.' });
    if (question.length > 2000) {
      return res.status(400).json({ message: 'That is too long — try asking it in a sentence or two.' });
    }

    let conversationId = req.body?.conversationId || null;
    if (conversationId) {
      const existing = await prisma.chatConversation.findUnique({ where: { id: conversationId } });
      // A conversation that is gone, or was never theirs, starts a new one
      // rather than failing the question.
      if (!existing || existing.username !== username) conversationId = null;
    }

    if (!conversationId) {
      const created = await prisma.chatConversation.create({
        data: { username, title: titleFrom(question) },
      });
      conversationId = created.id;
    }

    const userMessage = await prisma.chatMessage.create({
      data: { conversationId, role: 'user', content: question },
    });

    const reply = await answerQuestion(question);

    const assistantMessage = await prisma.chatMessage.create({
      data: {
        conversationId,
        role: 'assistant',
        // The prose is what gets stored; the structure is rebuilt for display.
        content: reply.answer,
        topic: reply.topic || null,
      },
    });

    // Bumps updatedAt so the conversation list orders by real activity.
    await prisma.chatConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    res.status(200).json({
      conversationId,
      question: { id: userMessage.id, role: 'user', content: question, createdAt: userMessage.createdAt },
      reply: {
        id: assistantMessage.id,
        role: 'assistant',
        createdAt: assistantMessage.createdAt,
        ...reply,
      },
    });
  } catch (error) {
    sendError(res, error, 'The assistant could not answer', 500);
  }
};

/** Deletes a conversation and everything in it. */
exports.remove = async (req, res) => {
  try {
    const username = who(req);
    const row = await prisma.chatConversation.findUnique({ where: { id: req.params.id } });
    if (!row || row.username !== username) {
      return res.status(404).json({ message: 'Conversation not found' });
    }
    // The messages go with it: the relation is onDelete Cascade.
    await prisma.chatConversation.delete({ where: { id: req.params.id } });
    res.status(200).json({ message: 'Deleted' });
  } catch (error) {
    sendError(res, error, 'Could not delete that conversation', 500);
  }
};
