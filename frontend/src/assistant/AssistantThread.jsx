import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, CheckCheck, Send, Sparkles } from 'lucide-react';

/**
 * The conversation itself — messages and the box you type in.
 *
 * Shared by the floating widget and the full page, so both show an answer the
 * same way. Everything it needs comes from useAssistant; it holds no state of
 * its own beyond keeping the newest message in view.
 */

/** Today, yesterday, or the date — the separator between days of messages. */
function dayLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((midnight(new Date()) - midnight(date)) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const timeLabel = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true });
};

export default function AssistantThread({ assistant, onNavigate }) {
  const navigate = useNavigate();
  const listRef = useRef(null);
  const inputRef = useRef(null);

  const {
    messages, suggestions, input, setInput, thinking, error, signedIn, send,
  } = assistant;

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, thinking]);

  const goTo = (path) => {
    onNavigate?.();
    navigate(path);
  };

  const submit = (e) => {
    e.preventDefault();
    send(input);
    inputRef.current?.focus();
  };

  const renderMessage = (message, index) => {
    const mine = message.role === 'user';
    const previous = messages[index - 1];
    const newDay = !previous || dayLabel(previous.createdAt) !== dayLabel(message.createdAt);

    return (
      <div key={message.id}>
        {newDay && <div className="nx-chat__day"><span>{dayLabel(message.createdAt)}</span></div>}
        <div className={`nx-chat__row${mine ? ' is-mine' : ''}`}>
          <div className={`nx-chat__bubble${mine ? ' is-mine' : ''}`}>
            {message.title && <p className="nx-chat__title">{message.title}</p>}
            <p className="nx-chat__text">{message.content}</p>

            {message.steps?.length > 0 && (
              <ol className="nx-chat__steps">
                {message.steps.map((step, i) => <li key={i}>{step}</li>)}
              </ol>
            )}

            {message.screen?.path && (
              <button type="button" className="nx-chat__link" onClick={() => goTo(message.screen.path)}>
                Open {message.screen.label} <ArrowRight size={13} />
              </button>
            )}

            {message.related?.length > 0 && (
              <div className="nx-chat__chips">
                <span className="nx-chat__chips-label">Also about this:</span>
                {message.related.map((r) => (
                  <button key={r.id} type="button" className="nx-chat__chip" onClick={() => send(r.title)}>
                    {r.title}
                  </button>
                ))}
              </div>
            )}

            {message.suggestions?.length > 0 && (
              <div className="nx-chat__chips">
                {message.suggestions.map((s) => (
                  <button key={s} type="button" className="nx-chat__chip" onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}

            <span className="nx-chat__meta">
              {timeLabel(message.createdAt)}
              {mine && (message.sent
                ? <CheckCheck size={13} className="nx-chat__tick is-sent" aria-label="Sent" />
                : <Check size={13} className="nx-chat__tick" aria-label="Sending" />)}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="nx-chat__list" ref={listRef}>
        {messages.length === 0 && (
          <div className="nx-chat__welcome">
            <span className="nx-chat__welcome-icon"><Sparkles size={22} /></span>
            <p className="nx-chat__welcome-title">Ask me about NexorCRM</p>
            <p className="nx-chat__welcome-text">
              I know how this CRM works — creating leads, duplicates, statuses,
              site visits, notifications, users and the rest. I only answer
              questions about this application.
            </p>
            <div className="nx-chat__chips">
              {suggestions.map((s) => (
                <button key={s} type="button" className="nx-chat__chip" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(renderMessage)}

        {thinking && (
          <div className="nx-chat__row">
            <div className="nx-chat__bubble nx-chat__bubble--typing" aria-label="Typing">
              <span /><span /><span />
            </div>
          </div>
        )}
      </div>

      {error && <p className="nx-chat__error" role="alert">{error}</p>}

      <form className="nx-chat__composer" onSubmit={submit}>
        <input
          ref={inputRef}
          className="nx-chat__input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={signedIn ? 'Ask a question…' : 'Sign in to ask'}
          disabled={!signedIn}
          aria-label="Your question"
        />
        <button
          type="submit"
          className="nx-chat__send"
          disabled={!input.trim() || thinking || !signedIn}
          aria-label="Send"
        >
          <Send size={16} />
        </button>
      </form>
    </>
  );
}
