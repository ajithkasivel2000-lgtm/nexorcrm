/**
 * Talking to the team-chat API.
 *
 * Identity travels as the session token, which the fetch wrapper
 * (utils/apiAuth.js) attaches to every same-origin /api/ call — the backend
 * resolves the user from it, never from a header the caller could choose.
 */
const base = '/api/team-chat';

async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
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
