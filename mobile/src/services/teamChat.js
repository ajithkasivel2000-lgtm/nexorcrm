import api from './api';

/**
 * Talking to the team-chat API (`/api/team-chat`).
 *
 * The mobile app authenticates with the same JWT the rest of the CRM uses —
 * `api` already attaches `Authorization: Bearer <token>` to every call, and
 * the backend's `who()` reads `req.user.username` from it.
 */

const unwrap = (res) => res.data;

export const teamChatService = {
  getContacts: async () => unwrap(await api.get('/team-chat/contacts')),
  getUnreadTotal: async () => unwrap(await api.get('/team-chat/unread')),

  listRooms: async () => unwrap(await api.get('/team-chat/rooms')),
  getRoom: async (id) => unwrap(await api.get(`/team-chat/rooms/${id}`)),
  createRoom: async (name, members) => unwrap(await api.post('/team-chat/rooms', { name, members })),
  renameRoom: async (id, name) => unwrap(await api.patch(`/team-chat/rooms/${id}`, { name })),
  deleteRoom: async (id) => unwrap(await api.delete(`/team-chat/rooms/${id}`)),

  /** `after` fetches only what is newer than a message already on screen. */
  listMessages: async (id, after) =>
    unwrap(await api.get(`/team-chat/rooms/${id}/messages`, after ? { params: { after } } : undefined)),

  sendMessage: async (id, body, kind = 'text') =>
    unwrap(await api.post(`/team-chat/rooms/${id}/messages`, { body, kind })),

  markRead: async (id) => unwrap(await api.post(`/team-chat/rooms/${id}/read`)),
  addMembers: async (id, members) => unwrap(await api.post(`/team-chat/rooms/${id}/members`, { members })),
  removeMember: async (id, username) =>
    unwrap(await api.delete(`/team-chat/rooms/${id}/members/${encodeURIComponent(username)}`)),
};
