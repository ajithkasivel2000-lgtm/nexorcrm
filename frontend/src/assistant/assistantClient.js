/**
 * Talking to the assistant.
 *
 * Every call carries the signed-in username in X-Username, which is how this
 * CRM authenticates its API — see backend/middleware/authMiddleware.js.
 */

const base = '/api/assistant';

/** The signed-in user, or null when nobody is. */
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
