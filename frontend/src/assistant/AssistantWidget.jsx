import { useEffect, useState } from 'react';
import { MessageCircle, Plus, Sparkles, Trash2, X } from 'lucide-react';
import useAssistant from './useAssistant';
import AssistantThread from './AssistantThread';
import './assistant.css';

/**
 * The assistant as a floating panel, reachable from anywhere.
 *
 * The same conversation as the Assistant page — same hook, same thread view —
 * so an answer read here is on the page too, and vice versa. This is the
 * quick-question surface; the page is for reading back through a long one.
 */
export default function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const assistant = useAssistant({ active: open });

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) {
    return (
      <button
        type="button"
        className="nx-chat__fab"
        onClick={() => setOpen(true)}
        aria-label="Ask the CRM assistant"
        title="Ask the CRM assistant"
      >
        <MessageCircle size={22} />
      </button>
    );
  }

  return (
    <div className="nx-chat" role="dialog" aria-label="CRM assistant">
      <header className="nx-chat__head">
        <span className="nx-chat__avatar"><Sparkles size={16} /></span>
        <div className="nx-chat__who">
          <p className="nx-chat__name">NexorCRM Assistant</p>
          <p className="nx-chat__status">
            {assistant.thinking ? 'typing…' : 'Ask me how anything here works'}
          </p>
        </div>
        <button
          type="button"
          className="nx-chat__icon-btn"
          onClick={() => { setShowHistory((v) => !v); assistant.refreshConversations(); }}
          aria-label="Past conversations"
          title="Past conversations"
        >
          <MessageCircle size={16} />
        </button>
        <button
          type="button"
          className="nx-chat__icon-btn"
          onClick={() => { assistant.startNew(); setShowHistory(false); }}
          aria-label="New chat"
          title="New chat"
        >
          <Plus size={16} />
        </button>
        <button
          type="button"
          className="nx-chat__icon-btn"
          onClick={() => setOpen(false)}
          aria-label="Close"
          title="Close"
        >
          <X size={16} />
        </button>
      </header>

      {showHistory && (
        <div className="nx-chat__history">
          {assistant.conversations.length === 0 && (
            <p className="nx-chat__history-empty">No past conversations yet.</p>
          )}
          {assistant.conversations.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`nx-chat__history-item${c.id === assistant.conversationId ? ' is-active' : ''}`}
              onClick={() => { assistant.openConversation(c.id); setShowHistory(false); }}
            >
              <span className="nx-chat__history-text">
                <span className="nx-chat__history-title">{c.title}</span>
                <span className="nx-chat__history-preview">{c.preview}</span>
              </span>
              <span
                role="button"
                tabIndex={0}
                className="nx-chat__history-del"
                onClick={(e) => { e.stopPropagation(); assistant.removeConversation(c.id); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.stopPropagation(); assistant.removeConversation(c.id); }
                }}
                aria-label={`Delete ${c.title}`}
              >
                <Trash2 size={13} />
              </span>
            </button>
          ))}
        </div>
      )}

      <AssistantThread assistant={assistant} onNavigate={() => setOpen(false)} />
    </div>
  );
}
