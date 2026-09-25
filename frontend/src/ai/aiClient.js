/**
 * Client for the /api/ai endpoints.
 *
 * Streaming uses fetch + ReadableStream rather than EventSource, because
 * EventSource cannot send the Authorization header that every AI route
 * requires; the fetch wrapper attaches it from the session.
 */

/** Has the server been given an ANTHROPIC_API_KEY? */
export async function getAiStatus() {
  try {
    const res = await fetch('/api/ai/status');
    if (!res.ok) return { configured: false };
    return await res.json();
  } catch {
    return { configured: false };
  }
}

/**
 * Consumes an SSE response body, invoking handlers per event.
 *
 * @param {Response} response  fetch response with an event-stream body
 * @param {object} handlers    { onDelta(text), onDone(payload), onError(msg) }
 * @param {AbortSignal} signal
 */
async function consumeSSE(response, { onDelta, onDone, onError }, signal) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (signal?.aborted) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line. Keep the trailing partial
      // frame in the buffer until its terminator arrives.
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';

      for (const frame of frames) {
        let event = 'message';
        const dataLines = [];
        for (const line of frame.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
        }
        if (dataLines.length === 0) continue;

        let payload;
        try {
          payload = JSON.parse(dataLines.join('\n'));
        } catch {
          continue; // ignore a frame we can't parse rather than killing the stream
        }

        if (event === 'delta') onDelta?.(payload.text || '');
        else if (event === 'done') onDone?.(payload);
        else if (event === 'error') onError?.(payload.message || 'AI request failed.');
      }
    }
  } finally {
    reader.releaseLock?.();
  }
}

/** Shared setup for the two streaming endpoints. */
async function openStream(url, options, handlers, signal) {
  try {
    const response = await fetch(url, { ...options, signal });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      handlers.onError?.(data.message || `Request failed (${response.status})`);
      return;
    }
    if (!response.body) {
      handlers.onError?.('Streaming is not supported in this browser.');
      return;
    }

    await consumeSSE(response, handlers, signal);
  } catch (err) {
    // An abort is a deliberate cancel, not a failure worth surfacing.
    if (err.name !== 'AbortError') handlers.onError?.(err.message || 'AI request failed.');
  }
}

/** Streams a plain-language summary of one lead. */
export function streamLeadSummary(leadId, handlers, signal) {
  return openStream(
    `/api/ai/leads/${encodeURIComponent(leadId)}/summary`,
    { method: 'GET' },
    handlers,
    signal
  );
}

/** Streams an assistant answer. `history` is prior [{role, content}] turns. */
export function streamAsk(question, history, handlers, signal) {
  return openStream(
    '/api/ai/ask',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, history }),
    },
    handlers,
    signal
  );
}

/** Natural-language lead search. Returns { leads, count, interpretation }. */
export async function aiSearchLeads(query, signal) {
  const response = await fetch('/api/ai/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
    signal,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `Search failed (${response.status})`);
  return data;
}
