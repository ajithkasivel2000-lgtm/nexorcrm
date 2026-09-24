const crypto = require('crypto');
const prisma = require('../prismaClient');

/**
 * Session rows as the outside world may see them.
 *
 * A session's id IS its bearer token (`sess_<id>`), so listing sessions with
 * their ids handed every viewer a working login as every listed user. Lists
 * now carry a handle instead: a one-way hash of the id, stable enough to name
 * a session in a revoke request, useless as a credential.
 */
const handleOf = (id) => `sh_${crypto.createHash('sha256').update(String(id)).digest('hex').slice(0, 32)}`;

/** The row without its token; `current` marks the caller's own session. */
function publicSession(session, currentSessionId = null) {
  const { id, ...rest } = session;
  return { ...rest, id: handleOf(id), current: Boolean(currentSessionId) && id === currentSessionId };
}

/**
 * Real ids for the given handles, among the sessions `where` selects.
 * Raw ids are not accepted: nothing outside the server should hold one
 * except the browser that owns it.
 */
async function idsForHandles(handles, where = {}) {
  const wanted = new Set((handles || []).map(String));
  if (!wanted.size) return [];
  const rows = await prisma.session.findMany({ where, select: { id: true } });
  return rows.filter((r) => wanted.has(handleOf(r.id))).map((r) => r.id);
}

module.exports = { handleOf, publicSession, idsForHandles };
