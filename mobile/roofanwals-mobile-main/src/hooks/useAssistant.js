import { useCallback, useEffect, useRef, useState } from 'react';
import { assistantService } from '../services/assistant';
import { useAuth } from '../context/AuthContext';
import { Alert } from 'react-native';

let localId = 0;
const nextLocalId = () => `local-${(localId += 1)}`;

export default function useAssistant({ active = true } = {}) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState('');

  const signedIn = Boolean(user);
  const restored = useRef(false);

  const refreshConversations = useCallback(async () => {
    try {
      const rows = await assistantService.listConversations();
      setConversations(rows || []);
      return rows || [];
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    if (!active || !signedIn) return;
    let alive = true;

    assistantService.getSuggestions()
      .then((r) => { if (alive) setSuggestions(r?.suggestions || []); })
      .catch(() => {});

    if (!restored.current) {
      restored.current = true;
      refreshConversations().then(async (rows) => {
        if (!alive || rows.length === 0) return;
        try {
          const latest = await assistantService.getConversation(rows[0].id);
          if (!alive || !latest?.messages?.length) return;
          setConversationId(latest.id);
          setMessages(latest.messages.map((m) => ({
            id: m.id, role: m.role, content: m.content, createdAt: m.createdAt, sent: true,
          })));
        } catch { /* start fresh */ }
      });
    }

    return () => { alive = false; };
  }, [active, signedIn, refreshConversations]);

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
      const result = await assistantService.ask(question, conversationId);
      setConversationId(result.conversationId);
      setMessages((prev) => [
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
      setError(err.status === 401
        ? 'Sign in again to use the assistant.'
        : err.response?.data?.message || err.message || 'The assistant could not be reached.');
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
      const row = await assistantService.getConversation(id);
      setConversationId(row.id);
      setMessages((row.messages || []).map((m) => ({
        id: m.id, role: m.role, content: m.content, createdAt: m.createdAt, sent: true,
      })));
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Could not open that conversation.');
    }
  }, []);

  const removeConversation = useCallback(async (id) => {
    Alert.alert(
      'Delete conversation',
      'Delete this conversation? The messages in it are removed for good.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            try {
              await assistantService.deleteConversation(id);
              if (id === conversationId) startNew();
              refreshConversations();
            } catch (err) {
              setError(err.response?.data?.message || err.message || 'Could not delete that conversation.');
            }
          }
        }
      ]
    );
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
