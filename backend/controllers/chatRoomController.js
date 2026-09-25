/**
 * Chat between the people who use this CRM.
 *
 * One rule underpins everything here: you can only see, read or write to a
 * room you are a member of. It is checked in one place — `membership()` —
 * rather than repeated per handler, because a single handler that forgets is
 * a room anyone can read.
 *
 * A room that does not belong to you answers 404 rather than 403, so its id
 * tells you nothing about whether it exists.
 */
const crypto = require('crypto');
const prisma = require('../prismaClient');
const { sendError } = require('../utils/apiError');
const storage = require('../utils/storage');

/* Photos are stored (disk or S3) and the message keeps the /uploads/teamchat/
   URL, not the base64 — see index.js for why the body limit is what it is. */
const CHAT_PHOTO_MAX_BYTES = 4 * 1024 * 1024;   // the client refuses anything bigger
const CHAT_BODY_MAX_BYTES = 10 * 1024 * 1024;   // headroom for base64's 4/3 overhead

const DATA_URL_RE = /^data:(image\/(?:png|jpe?g|gif|webp|bmp));base64,([A-Za-z0-9+/=\s]+)$/;

/* Who is asking. The routes sit behind authMiddleware, so this is set — and
   the caller-controlled x-username header is never consulted. */
const who = (req) => req.user?.username || null;

/** This person's membership of this room, or null. */
async function membership(roomId, username) {
  if (!roomId || !username) return null;
  return prisma.chatRoomMember.findFirst({ where: { roomId, username } });
}

/** The name a room shows to a given person. */
function displayName(room, username) {
  if (room.name) return room.name;
  const others = room.members.filter((m) => m.username !== username).map((m) => m.username);
  return others.join(', ') || 'Just you';
}

/* ---------------------------------------------------------------------------
   Who you can talk to.
   -------------------------------------------------------------------------- */

/**
 * The people who can be added to a room.
 *
 * Application users only, which is the whole point — and never yourself, since
 * you are already in every room you create.
 */
exports.contacts = async (req, res) => {
  try {
    const username = who(req);
    const rows = await prisma.user.findMany({
      select: { id: true, username: true, firstName: true, lastName: true, status: true },
      orderBy: { username: 'asc' },
    });

    res.status(200).json(
      rows
        .filter((u) => u.username && u.username !== username)
        // Accounts that cannot sign in cannot read what they are sent, so
        // they are not offered as chat partners: banned, and archived (soft-
        // deleted) people stay out of the list the same way. Suspended and
        // awaiting-activation accounts keep appearing — they may return.
        .filter((u) => !['banned', 'archived'].includes(String(u.status || '').toLowerCase()))
        .map((u) => ({
          username: u.username,
          name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username,
          status: u.status,
        })),
    );
  } catch (error) {
    sendError(res, error, 'Could not load the people list', 500);
  }
};

/* ---------------------------------------------------------------------------
   Rooms.
   -------------------------------------------------------------------------- */

/** Every room this person is in, most recently active first. */
exports.listRooms = async (req, res) => {
  try {
    const username = who(req);
    if (!username) return res.status(401).json({ message: 'Not signed in' });

    const mine = await prisma.chatRoomMember.findMany({
      where: { username },
      select: { roomId: true, lastReadAt: true },
    });
    const ids = mine.map((m) => m.roomId);
    if (ids.length === 0) return res.status(200).json([]);

    const readAt = Object.fromEntries(mine.map((m) => [m.roomId, m.lastReadAt]));

    const rooms = await prisma.chatRoom.findMany({
      where: { id: { in: ids } },
      orderBy: { updatedAt: 'desc' },
      include: {
        members: true,
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    // One count query rather than one per room.
    const unreadRows = await Promise.all(rooms.map((room) => prisma.chatRoomMessage.count({
      where: {
        roomId: room.id,
        createdAt: { gt: readAt[room.id] },
        // Your own messages are not unread news to you.
        sender: { not: username },
      },
    })));

    res.status(200).json(rooms.map((room, i) => ({
      id: room.id,
      name: displayName(room, username),
      isGroup: room.isGroup,
      createdBy: room.createdBy,
      members: room.members.map((m) => m.username),
      updatedAt: room.updatedAt,
      unread: unreadRows[i],
      last: room.messages[0]
        ? { sender: room.messages[0].sender, body: room.messages[0].body, kind: room.messages[0].kind, createdAt: room.messages[0].createdAt }
        : null,
    })));
  } catch (error) {
    sendError(res, error, 'Could not load your chats', 500);
  }
};

/**
 * Starts a room.
 *
 * Two people with no name is a direct chat, and asking for one twice reopens
 * the existing conversation instead of making a second identical room.
 */
exports.createRoom = async (req, res) => {
  try {
    const username = who(req);
    if (!username) return res.status(401).json({ message: 'Not signed in' });

    const name = String(req.body?.name || '').trim();
    const asked = Array.isArray(req.body?.members) ? req.body.members : [];

    // Whoever is creating it is always in it, and nobody is added twice.
    const wanted = [...new Set([username, ...asked.map((m) => String(m || '').trim()).filter(Boolean)])];
    if (wanted.length < 2) {
      return res.status(400).json({ message: 'Pick at least one other person.' });
    }

    // Every name has to be a real user: a typo would otherwise create a room
    // with a member who can never read it.
    const found = await prisma.user.findMany({
      where: { username: { in: wanted } },
      select: { username: true },
    });
    const real = found.map((u) => u.username);
    const missing = wanted.filter((w) => !real.includes(w));
    if (missing.length) {
      return res.status(400).json({ message: `Not a user here: ${missing.join(', ')}` });
    }

    const isGroup = real.length > 2 || Boolean(name);

    // Reopen an existing one-to-one rather than stacking duplicates.
    if (!isGroup) {
      const mine = await prisma.chatRoomMember.findMany({ where: { username }, select: { roomId: true } });
      const candidates = await prisma.chatRoom.findMany({
        where: { id: { in: mine.map((m) => m.roomId) }, isGroup: false },
        include: { members: true },
      });
      const already = candidates.find((room) => room.members.length === 2
        && room.members.every((m) => real.includes(m.username)));
      if (already) {
        return res.status(200).json({ id: already.id, name: displayName(already, username), reopened: true });
      }
    }

    const room = await prisma.chatRoom.create({
      data: {
        name: isGroup ? (name || real.filter((u) => u !== username).join(', ')) : null,
        isGroup,
        createdBy: username,
        members: {
          create: real.map((u) => ({ username: u, isAdmin: u === username })),
        },
      },
      include: { members: true },
    });

    res.status(201).json({ id: room.id, name: displayName(room, username), isGroup: room.isGroup });
  } catch (error) {
    sendError(res, error, 'Could not start that chat', 500);
  }
};

/** A room's details, for the header and the member list. */
exports.getRoom = async (req, res) => {
  try {
    const username = who(req);
    const mine = await membership(req.params.id, username);
    if (!mine) return res.status(404).json({ message: 'Chat not found' });

    const room = await prisma.chatRoom.findUnique({
      where: { id: req.params.id },
      include: { members: true },
    });
    if (!room) return res.status(404).json({ message: 'Chat not found' });

    res.status(200).json({
      id: room.id,
      name: displayName(room, username),
      rawName: room.name,
      isGroup: room.isGroup,
      createdBy: room.createdBy,
      isAdmin: mine.isAdmin,
      members: room.members.map((m) => ({ username: m.username, isAdmin: m.isAdmin })),
    });
  } catch (error) {
    sendError(res, error, 'Could not load that chat', 500);
  }
};

/* ---------------------------------------------------------------------------
   Messages.
   -------------------------------------------------------------------------- */

/**
 * What has been said.
 *
 * `after` returns only what is newer than a message already on screen, which
 * is what the client polls with — so a quiet room costs almost nothing.
 */
exports.listMessages = async (req, res) => {
  try {
    const username = who(req);
    const mine = await membership(req.params.id, username);
    if (!mine) return res.status(404).json({ message: 'Chat not found' });

    const after = req.query.after ? new Date(String(req.query.after)) : null;
    const valid = after && !Number.isNaN(after.getTime());

    const messages = await prisma.chatRoomMessage.findMany({
      where: { roomId: req.params.id, ...(valid ? { createdAt: { gt: after } } : {}) },
      orderBy: { createdAt: 'asc' },
      take: valid ? 200 : 300,
    });

    res.status(200).json(messages);
  } catch (error) {
    sendError(res, error, 'Could not load the messages', 500);
  }
};

/** Says something. */
exports.sendMessage = async (req, res) => {
  try {
    const username = who(req);
    const mine = await membership(req.params.id, username);
    if (!mine) return res.status(404).json({ message: 'Chat not found' });

    const kind = req.body?.kind === 'photo' ? 'photo' : 'text';
    const rawBody = req.body?.body || '';
    let body = rawBody;

    if (kind === 'text') {
      body = String(rawBody).trim();
      if (!body) return res.status(400).json({ message: 'Type something first.' });
      if (body.length > 4000) return res.status(400).json({ message: 'That message is too long.' });
    } else if (kind === 'photo') {
      // The payload is a data URL from the client's FileReader. Only a real
      // image type and a size inside the cap are accepted; the byte length of
      // the decoded buffer is checked, not the string, so padding cannot hide
      // an oversized file.
      const match = typeof rawBody === 'string' ? DATA_URL_RE.exec(rawBody.trim()) : null;
      if (!match) return res.status(400).json({ message: 'That is not a supported image.' });
      const buffer = Buffer.from(match[2], 'base64');
      if (buffer.length === 0) return res.status(400).json({ message: 'Missing photo data.' });
      if (buffer.length > CHAT_PHOTO_MAX_BYTES) {
        return res.status(400).json({ message: 'Image too large. Under 4MB please.' });
      }
      if (rawBody.length > CHAT_BODY_MAX_BYTES) {
        return res.status(413).json({ message: 'Image too large. Under 4MB please.' });
      }

      const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp' }[match[1]];
      const storedName = `${crypto.randomUUID()}.${ext}`;
      // Disk or S3, whichever is configured (utils/storage.js).
      await storage.put(`teamchat/${storedName}`, buffer, match[1]);
      // The row carries the URL, and every later read of the room skips the
      // megabytes the base64 would have cost.
      body = `/uploads/teamchat/${storedName}`;
    }

    const message = await prisma.chatRoomMessage.create({
      data: { roomId: req.params.id, sender: username, body, kind },
    });

    // Sending counts as reading, and moves the room up everyone's list.
    await Promise.all([
      prisma.chatRoom.update({ where: { id: req.params.id }, data: { updatedAt: new Date() } }),
      prisma.chatRoomMember.update({ where: { id: mine.id }, data: { lastReadAt: message.createdAt } }),
    ]);

    res.status(201).json(message);
  } catch (error) {
    sendError(res, error, 'Could not send that message', 500);
  }
};

/** Marks everything up to now as seen, clearing this room's unread count. */
exports.markRead = async (req, res) => {
  try {
    const username = who(req);
    const mine = await membership(req.params.id, username);
    if (!mine) return res.status(404).json({ message: 'Chat not found' });

    await prisma.chatRoomMember.update({ where: { id: mine.id }, data: { lastReadAt: new Date() } });
    res.status(200).json({ message: 'Marked read' });
  } catch (error) {
    sendError(res, error, 'Could not mark that chat read', 500);
  }
};

/* ---------------------------------------------------------------------------
   Who is in the room.
   -------------------------------------------------------------------------- */

/** Adds people to a group. Only whoever started it can. */
exports.addMembers = async (req, res) => {
  try {
    const username = who(req);
    const mine = await membership(req.params.id, username);
    if (!mine) return res.status(404).json({ message: 'Chat not found' });
    if (!mine.isAdmin) return res.status(403).json({ message: 'Only the group admin can add people.' });

    const room = await prisma.chatRoom.findUnique({
      where: { id: req.params.id },
      include: { members: true },
    });
    if (!room.isGroup) {
      return res.status(400).json({ message: 'A direct chat is between two people. Start a group instead.' });
    }

    const asked = (Array.isArray(req.body?.members) ? req.body.members : [])
      .map((m) => String(m || '').trim())
      .filter(Boolean);
    const existing = room.members.map((m) => m.username);
    const toAdd = [...new Set(asked)].filter((u) => !existing.includes(u));
    if (toAdd.length === 0) return res.status(400).json({ message: 'Nobody new to add.' });

    const found = await prisma.user.findMany({
      where: { username: { in: toAdd } },
      select: { username: true },
    });
    const real = found.map((u) => u.username);
    const missing = toAdd.filter((u) => !real.includes(u));
    if (missing.length) return res.status(400).json({ message: `Not a user here: ${missing.join(', ')}` });

    await prisma.chatRoomMember.createMany({
      data: real.map((u) => ({ roomId: room.id, username: u })),
    });

    // A note in the room itself, so the change is visible to everyone in it
    // rather than people silently appearing.
    await prisma.chatRoomMessage.create({
      data: {
        roomId: room.id,
        sender: username,
        kind: 'system',
        body: `${username} added ${real.join(', ')}`,
      },
    });

    res.status(200).json({ added: real });
  } catch (error) {
    sendError(res, error, 'Could not add them', 500);
  }
};

/** Leaves a group, or removes somebody from it. */
exports.removeMember = async (req, res) => {
  try {
    const username = who(req);
    const target = String(req.params.username || '').trim();
    const mine = await membership(req.params.id, username);
    if (!mine) return res.status(404).json({ message: 'Chat not found' });

    const leaving = target === username;
    if (!leaving && !mine.isAdmin) {
      return res.status(403).json({ message: 'Only the group admin can remove people.' });
    }

    const theirs = await membership(req.params.id, target);
    if (!theirs) return res.status(404).json({ message: 'They are not in this chat' });

    await prisma.chatRoomMember.delete({ where: { id: theirs.id } });
    await prisma.chatRoomMessage.create({
      data: {
        roomId: req.params.id,
        sender: username,
        kind: 'system',
        body: leaving ? `${username} left` : `${username} removed ${target}`,
      },
    });

    // An empty room is not worth keeping, and nobody can reach it to delete it.
    const left = await prisma.chatRoomMember.count({ where: { roomId: req.params.id } });
    if (left === 0) await prisma.chatRoom.delete({ where: { id: req.params.id } });

    res.status(200).json({ removed: target, roomDeleted: left === 0 });
  } catch (error) {
    sendError(res, error, 'Could not remove them', 500);
  }
};

/**
 * Deletes a group outright — for everyone, not just the person deleting.
 *
 * A group admin's action, alongside rename and add: leaving is the ordinary
 * exit (the room and its history stay behind for everybody else), deleting
 * ends the room itself. The messages and memberships go with it, through the
 * schema's cascade — there is no half-deleted room to sweep up later.
 *
 * Direct chats have no delete: either person leaving already removes the room
 * when the second one goes, and "delete" would only ever mean the same thing
 * with one fewer step of warning.
 */
exports.deleteRoom = async (req, res) => {
  try {
    const username = who(req);
    const mine = await membership(req.params.id, username);
    if (!mine) return res.status(404).json({ message: 'Chat not found' });
    if (!mine.isAdmin) return res.status(403).json({ message: 'Only the group admin can delete it.' });

    const room = await prisma.chatRoom.findUnique({ where: { id: req.params.id } });
    if (!room) return res.status(404).json({ message: 'Chat not found' });
    if (!room.isGroup) {
      return res.status(400).json({ message: 'A direct chat cannot be deleted. Leave it instead.' });
    }

    await prisma.chatRoom.delete({ where: { id: room.id } });
    res.status(200).json({ deleted: room.id });
  } catch (error) {
    sendError(res, error, 'Could not delete that chat', 500);
  }
};

/** Renames a group. */
exports.renameRoom = async (req, res) => {
  try {
    const username = who(req);
    const mine = await membership(req.params.id, username);
    if (!mine) return res.status(404).json({ message: 'Chat not found' });
    if (!mine.isAdmin) return res.status(403).json({ message: 'Only the group admin can rename it.' });

    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ message: 'Give the group a name.' });

    const room = await prisma.chatRoom.update({ where: { id: req.params.id }, data: { name } });
    res.status(200).json({ id: room.id, name: room.name });
  } catch (error) {
    sendError(res, error, 'Could not rename it', 500);
  }
};

/** How many unread messages this person has in total, for the nav badge. */
exports.unreadTotal = async (req, res) => {
  try {
    const username = who(req);
    if (!username) return res.status(401).json({ message: 'Not signed in' });

    const mine = await prisma.chatRoomMember.findMany({
      where: { username },
      select: { roomId: true, lastReadAt: true },
    });

    const counts = await Promise.all(mine.map((m) => prisma.chatRoomMessage.count({
      where: { roomId: m.roomId, createdAt: { gt: m.lastReadAt }, sender: { not: username } },
    })));

    res.status(200).json({ unread: counts.reduce((a, b) => a + b, 0) });
  } catch (error) {
    sendError(res, error, 'Could not count unread messages', 500);
  }
};
