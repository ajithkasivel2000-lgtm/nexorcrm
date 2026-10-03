import api from './api';

/**
 * Talking to the assistant (`/api/assistant`).
 *
 * The mobile app authenticates with the same JWT the rest of the CRM uses —
 * `api` already attaches `Authorization: Bearer <token>`, which the backend
 * resolves to the signed-in user.
 */

const unwrap = (res) => res.data;

export const assistantService = {
  getSuggestions: async () => unwrap(await api.get('/assistant/suggestions')),
  listConversations: async () => unwrap(await api.get('/assistant/conversations')),
  getConversation: async (id) => unwrap(await api.get(`/assistant/conversations/${id}`)),
  deleteConversation: async (id) => unwrap(await api.delete(`/assistant/conversations/${id}`)),
  ask: async (question, conversationId) =>
    unwrap(await api.post('/assistant/ask', { question, conversationId })),
};
