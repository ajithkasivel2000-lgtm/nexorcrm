import { useState } from 'react';
import { MessageSquarePlus, Search, Sparkles, Trash2 } from 'lucide-react';
import useAssistant from './useAssistant';
import AssistantThread from './AssistantThread';
import './assistant.css';

/**
 * The assistant as a screen of its own.
 *
 * The floating widget is for a quick question without leaving what you are
 * doing. This is for reading back: every past conversation down the side,
 * searchable, with room for long answers.
 *
 * Both are the same conversation — same hook, same thread view — so nothing
 * is stranded on one surface.
 */
export default function AssistantPage() {
  const assistant = useAssistant({ active: true });
  const [filter, setFilter] = useState('');

  const visible = assistant.conversations.filter((c) => {
    const q = filter.trim().toLowerCase();
    return !q || c.title.toLowerCase().includes(q) || (c.preview || '').toLowerCase().includes(q);
  });

  const when = (value) => {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const sameDay = d.toDateString() === new Date().toDateString();
    return sameDay
      ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true })
      : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  return (
    <div className="nx-chatpage">
      {/* ---- past conversations ---- */}
      <aside className="nx-chatpage__side">
        <header className="nx-chatpage__side-head">
          <h1 className="nx-chatpage__heading">Assistant</h1>
          <button
            type="button"
            className="nx-chatpage__new"
            onClick={assistant.startNew}
            title="Start a new conversation"
          >
            <MessageSquarePlus size={16} /> New
          </button>
        </header>

        <div className="nx-chatpage__search">
          <Search size={14} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search conversations"
            aria-label="Search conversations"
          />
        </div>

        <div className="nx-chatpage__list">
          {visible.length === 0 && (
            <p className="nx-chatpage__empty">
              {assistant.conversations.length === 0
                ? 'Nothing yet. Ask a question to start.'
                : 'Nothing matches that.'}
            </p>
          )}
          {visible.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`nx-chatpage__item${c.id === assistant.conversationId ? ' is-active' : ''}`}
              onClick={() => assistant.openConversation(c.id)}
            >
              <span className="nx-chatpage__item-text">
                <span className="nx-chatpage__item-top">
                  <span className="nx-chatpage__item-title">{c.title}</span>
                  <span className="nx-chatpage__item-when">{when(c.updatedAt)}</span>
                </span>
                <span className="nx-chatpage__item-preview">{c.preview}</span>
              </span>
              <span
                role="button"
                tabIndex={0}
                className="nx-chatpage__del"
                onClick={(e) => { e.stopPropagation(); assistant.removeConversation(c.id); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.stopPropagation(); assistant.removeConversation(c.id); }
                }}
                aria-label={`Delete ${c.title}`}
              >
                <Trash2 size={14} />
              </span>
            </button>
          ))}
        </div>
      </aside>

      {/* ---- the conversation ---- */}
      <section className="nx-chatpage__main">
        <header className="nx-chatpage__main-head">
          <span className="nx-chat__avatar"><Sparkles size={16} /></span>
          <div>
            <p className="nx-chat__name">NexorCRM Assistant</p>
            <p className="nx-chat__status">
              {assistant.thinking ? 'typing…' : 'Answers questions about this application only'}
            </p>
          </div>
        </header>

        <AssistantThread assistant={assistant} />
      </section>
    </div>
  );
}
