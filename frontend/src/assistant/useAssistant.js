import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ask, currentUser, deleteConversation, getConversation, getSuggestions, listConversations,
} from './assistantClient';

/**
 * Everything the assistant does, without deciding how it looks.
 *
 * The floating widget and the full page are the same conversation in two
 * shapes, so the logic lives here once. A copy in each would drift: a fix to
 * how a failed question is shown would land in one and not the other.
 */

/** A stable id for a message that exists only on screen so far. */
let localId = 0;
const nextLocalId = () => `local-${(localId += 1)}`;

export default function useAssistant({ active = true } = {}) {
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState('');

  const signedIn = Boolean(currentUser());
  // Guards the one-time restore below, so reopening the widget does not
  // re-load the conversation over one already on screen.
  const restored = useRef(false);

  const refreshConversations = useCallback(async () => {
    try {
      const rows = await listConversations();
      setConversations(rows || []);
      return rows || [];
    } catch {
      // Signed out, or the server is down. The chat still opens and says so
      // when a question fails, rather than refusing to open at all.
      return [];
    }
  }, []);

  /* ---- opening: the prompts, and where the last conversation left off ---- */
  useEffect(() => {
    if (!active) return undefined;
    let alive = true;

    getSuggestions()
      .then((r) => { if (alive) setSuggestions(r?.suggestions || []); })
      .catch(() => { /* it works without prompts */ });

    if (!restored.current) {
      restored.current = true;
      refreshConversations().then(async (rows) => {
        if (!alive || rows.length === 0) return;
        try {
          const latest = await getConversation(rows[0].id);
          if (!alive || !latest?.messages?.length) return;
          setConversationId(latest.id);
          setMessages(latest.messages.map((m) => ({
            id: m.id, role: m.role, content: m.content, createdAt: m.createdAt, sent: true,
          })));
        } catch { /* start fresh */ }
      });
    }

    return () => { alive = false; };
  }, [active, refreshConversations]);

  /* ---- asking ------------------------------------------------------------ */
  const send = useCallback(async (text) => {
    const question = String(text ?? '').trim();
    if (!question || thinking) return;

    setError('');
    setInput('');

    const pending = {
      id: nextLocalId(), role: 'user', content: question,
      createdAt: new Date().toISOString(), sent: false,
    };
    setMessages((prev) => [...prev, pending]);
    setThinking(true);

    try {
      const result = await ask(question, conversationId);
      setConversationId(result.conversationId);
      setMessages((prev) => [
        // The question is confirmed stored, so its tick turns.
        ...prev.map((m) => (m.id === pending.id
          ? { ...m, id: result.question.id, sent: true, createdAt: result.question.createdAt }
          : m)),
        {
          id: result.reply.id,
          role: 'assistant',
          content: result.reply.answer,
          createdAt: result.reply.createdAt,
          title: result.reply.title,
          steps: result.reply.steps,
          screen: result.reply.screen,
          related: result.reply.related,
          suggestions: result.reply.suggestions,
          sent: true,
        },
      ]);
      refreshConversations();
    } catch (err) {
      // The question stays on screen with its tick unturned, so it is obvious
      // which one did not get through.
      setError(err.status === 401
        ? 'Sign in again to use the assistant.'
        : err.message || 'The assistant could not be reached.');
    } finally {
      setThinking(false);
    }
  }, [conversationId, thinking, refreshConversations]);

  const startNew = useCallback(() => {
    setConversationId(null);
    setMessages([]);
    setError('');
  }, []);

  const openConversation = useCallback(async (id) => {
    try {
      const row = await getConversation(id);
      setConversationId(row.id);
      setMessages((row.messages || []).map((m) => ({
        id: m.id, role: m.role, content: m.content, createdAt: m.createdAt, sent: true,
      })));
    } catch (err) {
      setError(err.message || 'Could not open that conversation.');
    }
  }, []);

  const removeConversation = useCallback(async (id) => {
    const ok = await window.appConfirm(
      'Delete this conversation? The messages in it are removed for good.',
      'Delete conversation',
    );
    if (!ok) return;
    try {
      await deleteConversation(id);
      if (id === conversationId) startNew();
      refreshConversations();
    } catch (err) {
      setError(err.message || 'Could not delete that conversation.');
    }
  }, [conversationId, startNew, refreshConversations]);

  return {
    messages,
    conversationId,
    conversations,
    suggestions,
    input,
    setInput,
    thinking,
    error,
    setError,
    signedIn,
    send,
    startNew,
    openConversation,
    removeConversation,
    refreshConversations,
  };
}
