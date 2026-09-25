/**
 * Talking to the assistant.
 *
 * Identity travels as the session token, which the fetch wrapper
 * (utils/apiAuth.js) attaches to every same-origin /api/ call — the backend
 * resolves the user from it, never from a header the caller could choose.
 */

const base = '/api/assistant';

async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let payload = null;
  try { payload = await res.json(); } catch { /* no body, or not JSON */ }

  if (!res.ok) {
    const message = payload?.message || `Request failed (${res.status})`;
    const error = new Error(message);
    error.status = res.status;
    throw error;
  }
  return payload;
}

export const getSuggestions = () => call('/suggestions');
export const listConversations = () => call('/conversations');
export const getConversation = (id) => call(`/conversations/${id}`);
export const deleteConversation = (id) => call(`/conversations/${id}`, { method: 'DELETE' });
export const ask = (question, conversationId) =>
  call('/ask', { method: 'POST', body: { question, conversationId } });
