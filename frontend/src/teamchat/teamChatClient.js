/**
 * Talking to the team-chat API.
 *
 * Every call carries the signed-in username in X-Username, which is how this
 * CRM authenticates — see backend/middleware/authMiddleware.js.
 */
const base = '/api/team-chat';

export function currentUser() {
  try {
    return localStorage.getItem('loggedInUser') || null;
  } catch {
    return null;
  }
}

async function call(path, { method = 'GET', body } = {}) {
  const username = currentUser();
  const res = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(username ? { 'X-Username': username } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let payload = null;
  try { payload = await res.json(); } catch { /* no body */ }

  if (!res.ok) {
    const error = new Error(payload?.message || `Request failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return payload;
}

export const getContacts = () => call('/contacts');
export const getUnreadTotal = () => call('/unread');
export const listRooms = () => call('/rooms');
export const getRoom = (id) => call(`/rooms/${id}`);
export const createRoom = (name, members) => call('/rooms', { method: 'POST', body: { name, members } });
export const renameRoom = (id, name) => call(`/rooms/${id}`, { method: 'PATCH', body: { name } });
export const deleteRoom = (id) => call(`/rooms/${id}`, { method: 'DELETE' });

/** `after` fetches only what is newer than a message already on screen. */
export const listMessages = (id, after) =>
  call(`/rooms/${id}/messages${after ? `?after=${encodeURIComponent(after)}` : ''}`);

export const sendMessage = (id, body, kind = 'text') => call(`/rooms/${id}/messages`, { method: 'POST', body: { body, kind } });
export const markRead = (id) => call(`/rooms/${id}/read`, { method: 'POST' });
export const addMembers = (id, members) => call(`/rooms/${id}/members`, { method: 'POST', body: { members } });
export const removeMember = (id, username) =>
  call(`/rooms/${id}/members/${encodeURIComponent(username)}`, { method: 'DELETE' });
