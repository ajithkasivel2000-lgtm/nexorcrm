const { Server } = require('socket.io');
const { verifySession, extractToken } = require('../middleware/authMiddleware');
const tenant = require('./tenant');

/**
 * Live updates over Socket.IO.
 *
 * A signed-in browser (or the mobile app) connects with its session token and
 * joins two rooms: its user and its company. The server then pushes:
 *
 *   data:changed  { resource }   something in this company was saved — the
 *                                 screens showing that resource refetch
 *                                 (the frontend's dataBus already knows how)
 *   notification  { title, ... }  a new bell entry for this user
 *
 * Nothing about the data itself travels over the socket, only "go and look":
 * the REST API stays the one place that decides what anyone may see.
 *
 * Polling still runs as a fallback, so a blocked websocket costs freshness,
 * never correctness.
 */

let io = null;

function initRealtime(httpServer) {
  io = new Server(httpServer, {
    path: '/socket.io',
    cors: { origin: true, credentials: false },
    serveClient: false,
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token
      || extractToken({ headers: socket.handshake.headers || {} });
    if (!token) return next(new Error('unauthorised'));
    tenant.runResolving(() => verifySession(token))
      .then((result) => {
        if (result.error) return next(new Error('unauthorised'));
        socket.data.userId = result.user.id;
        socket.data.companyId = result.companyId;
        socket.data.partner = String(result.user.status) === 'Partner';
        return next();
      })
      .catch(() => next(new Error('unauthorised')));
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.data.userId}`);
    // Partners hear about their own notifications, not the company's activity.
    if (!socket.data.partner) socket.join(`company:${socket.data.companyId}`);
  });

  return io;
}

/** Tell one user something. */
function emitToUser(userId, event, payload = {}) {
  if (io && userId) io.to(`user:${userId}`).emit(event, payload);
}

/** Tell everyone in a company something. */
function emitToCompany(companyId, event, payload = {}) {
  if (io && companyId) io.to(`company:${companyId}`).emit(event, payload);
}

/** The resource name the frontend's dataBus uses for an API path. */
function resourceFromPath(path) {
  const parts = String(path || '').split('?')[0].split('/').filter(Boolean);
  if (parts[0] !== 'api' || !parts[1]) return null;
  // Same granularity as the frontend's dataBus: the first segment only.
  return parts[1].toLowerCase();
}

/**
 * Express middleware: after any successful write under /api/, tell the rest
 * of the company which resource changed. Runs on 'finish', so it never delays
 * or alters the response.
 */
function broadcastChanges(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  res.on('finish', () => {
    if (res.statusCode >= 400 || !req.companyId) return;
    const resource = resourceFromPath(req.originalUrl);
    if (!resource || ['auth', 'webhooks', 'public'].includes(resource)) return;
    emitToCompany(req.companyId, 'data:changed', { resource, by: req.user?.id || null });
  });
  return next();
}

module.exports = { initRealtime, emitToUser, emitToCompany, broadcastChanges, resourceFromPath };
