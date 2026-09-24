import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Bot, Sparkles, Square, X } from 'lucide-react';
import { getAiStatus, streamAsk } from './aiClient';
import './AiAssistant.css';

const SUGGESTIONS = [
  'How is my pipeline looking this month?',
  'Which lead sources bring the most leads?',
  'How many leads are still unworked?',
  'What should I focus on today?',
];

/**
 * Floating assistant. Renders nothing at all when the server has no API key,
 * so an unconfigured install shows no dead buttons.
 */
export default function AiAssistant() {
  const [configured, setConfigured] = useState(false);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    let alive = true;
    getAiStatus().then((s) => { if (alive) setConfigured(!!s.configured); });
    return () => { alive = false; };
  }, []);

  // Keep the newest text in view as it streams in.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streaming]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Abandoning the panel mid-answer should stop the request.
  useEffect(() => () => abortRef.current?.abort(), []);

  const send = async (text) => {
    const question = (text ?? input).trim();
    if (!question || streaming) return;

    const history = messages.map(({ role, content }) => ({ role, content }));
    setMessages((prev) => [...prev, { role: 'user', content: question }, { role: 'assistant', content: '' }]);
    setInput('');
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    // Append each delta to the last message, which is the empty assistant turn
    // we just pushed.
    const appendToLast = (updater) =>
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        next[next.length - 1] = { ...last, ...updater(last) };
        return next;
      });

    await streamAsk(question, history, {
      onDelta: (chunk) => appendToLast((last) => ({ content: last.content + chunk })),
      onError: (message) => appendToLast(() => ({ content: '', error: message })),
    }, controller.signal);

    setStreaming(false);
    abortRef.current = null;
  };

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  };

  if (!configured) return null;

  return (
    <div className="nx-scope">
      {!open && (
        <button
          type="button"
          className="nx-ai-fab"
          onClick={() => setOpen(true)}
          aria-label="Open AI assistant"
        >
          <Sparkles size={19} aria-hidden="true" />
        </button>
      )}

      {open && (
        <aside className="nx-ai-panel" role="complementary" aria-label="AI assistant">
          <header className="nx-ai-panel__header">
            <div className="nx-ai-panel__brand">
              <span className="nx-ai-panel__avatar"><Sparkles size={14} /></span>
              <div>
                <p className="nx-ai-panel__title">Assistant</p>
                <p className="nx-ai-panel__subtitle">Answers from your live pipeline</p>
              </div>
            </div>
            <button
              type="button"
              className="nx-ai-panel__close"
              onClick={() => { stop(); setOpen(false); }}
              aria-label="Close assistant"
            >
              <X size={16} />
            </button>
          </header>

          <div className="nx-ai-panel__body" ref={scrollRef}>
            {messages.length === 0 ? (
              <div className="nx-ai-empty">
                <Bot size={26} aria-hidden="true" />
                <p className="nx-ai-empty__title">Ask about your leads</p>
                <div className="nx-ai-empty__suggestions">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" onClick={() => send(s)}>{s}</button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => (
                <div key={i} className={`nx-ai-msg nx-ai-msg--${m.role}`}>
                  {m.error ? (
                    <p className="nx-ai-msg__error">{m.error}</p>
                  ) : (
                    <div className="nx-ai-msg__bubble">
                      {m.content}
                      {/* Caret only on the turn still being written. */}
                      {streaming && i === messages.length - 1 && m.role === 'assistant' && (
                        <span className="nx-ai-caret" aria-hidden="true" />
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <form
            className="nx-ai-panel__composer"
            onSubmit={(e) => { e.preventDefault(); send(); }}
          >
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              placeholder="Ask a question..."
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends; Shift+Enter adds a newline.
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              aria-label="Ask the assistant"
            />
            {streaming ? (
              <button type="button" onClick={stop} className="nx-ai-send" aria-label="Stop generating">
                <Square size={14} fill="currentColor" />
              </button>
            ) : (
              <button
                type="submit"
                className="nx-ai-send"
                disabled={!input.trim()}
                aria-label="Send question"
              >
                <ArrowUp size={16} />
              </button>
            )}
          </form>
        </aside>
      )}
    </div>
  );
}
