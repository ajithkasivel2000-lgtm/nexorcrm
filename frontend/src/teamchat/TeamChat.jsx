import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeDataChanged } from '../utils/dataBus';
import { currentUsername } from '../utils/currentUser';
import {
  ArrowLeft, Check, CheckCheck, LogOut, MessageSquarePlus, Search, Send, Trash2, Users, UserPlus, X, Image as ImageIcon
} from 'lucide-react';
import {
  addMembers, createRoom, deleteRoom, getContacts, getRoom, listMessages, listRooms,
  markRead, removeMember, sendMessage,
} from './teamChatClient';
import './TeamChat.css';

/**
 * Chat between the people who use this CRM.
 *
 * A group is a room with a name and any number of members; a direct chat is
 * the same thing with two members and no name. New messages arrive by polling
 * for anything newer than the last one on screen, which keeps a quiet room
 * close to free and needs no socket server to run.
 */

/** How often to look for new messages while a room is open. */
const POLL_MS = 4000;

const initials = (name) => String(name || '?').trim().slice(0, 2).toUpperCase();

const timeLabel = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true });
};

function dayLabel(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const midnight = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((midnight(new Date()) - midnight(d)) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Relative time for the room list — "now", "14:02", "Yesterday", a date. */
function whenLabel(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  if (Date.now() - d.getTime() < 60000) return 'now';
  const day = dayLabel(value);
  return day === 'Today' ? timeLabel(value) : day;
}

export default function TeamChat() {
  const me = currentUsername();

  const [rooms, setRooms] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [room, setRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');

  const [composing, setComposing] = useState(false);   // the "new chat" panel
  const [contacts, setContacts] = useState([]);
  const [picked, setPicked] = useState([]);
  const [groupName, setGroupName] = useState('');
  const [showMembers, setShowMembers] = useState(false);
  const [mentionQuery, setMentionQuery] = useState(null);

  const threadRef = useRef(null);
  const inputRef = useRef(null);
  // The newest message already on screen; the poll asks for anything after it.
  const lastAtRef = useRef(null);

  /* ---- the room list ----------------------------------------------------- */
  const refreshRooms = useCallback(async () => {
    try {
      setRooms(await listRooms());
    } catch (err) {
      if (err.status === 401) setError('Sign in again to use chat.');
    }
  }, []);

  useEffect(() => {
    refreshRooms();
    getContacts().then(setContacts).catch(() => { });
  }, [refreshRooms]);

  /* ---- opening a room ---------------------------------------------------- */
  useEffect(() => {
    if (!activeId) { setRoom(null); setMessages([]); lastAtRef.current = null; return undefined; }
    let alive = true;

    (async () => {
      try {
        const [detail, thread] = await Promise.all([getRoom(activeId), listMessages(activeId)]);
        if (!alive) return;
        setRoom(detail);
        setMessages(thread);
        lastAtRef.current = thread.length ? thread[thread.length - 1].createdAt : null;
        await markRead(activeId);
        refreshRooms();
      } catch (err) {
        if (alive) setError(err.message || 'Could not open that chat.');
      }
    })();

    return () => { alive = false; };
  }, [activeId, refreshRooms]);

  /* ---- new messages ------------------------------------------------------ */
  useEffect(() => {
    if (!activeId) return undefined;

    const tick = async () => {
      try {
        const fresh = await listMessages(activeId, lastAtRef.current || undefined);
        if (fresh.length === 0) return;
        lastAtRef.current = fresh[fresh.length - 1].createdAt;
        // Anything that arrived while this room was open has been seen.
        setMessages((prev) => {
          const known = new Set(prev.map((m) => m.id));
          return [...prev, ...fresh.filter((m) => !known.has(m.id))];
        });
        markRead(activeId).catch(() => { });
        refreshRooms();
      } catch { /* a dropped poll is not worth reporting; the next one retries */ }
    };

    const id = setInterval(tick, POLL_MS);
    // A message sent by anyone is announced over the live connection: fetch now.
    const unsubscribe = subscribeDataChanged('team-chat', tick);
    return () => { clearInterval(id); unsubscribe(); };
  }, [activeId, refreshRooms]);

  /* ---- keep the newest message in view ----------------------------------- */
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, activeId]);

  /* ---- sending ----------------------------------------------------------- */
  const send = async (e) => {
    e?.preventDefault();
    const body = draft.trim();
    if (!body || !activeId) return;

    setDraft('');
    setError('');
    const pending = {
      id: `local-${Date.now()}`, sender: me, body, kind: 'text', createdAt: new Date().toISOString(), pending: true,
    };
    setMessages((prev) => [...prev, pending]);

    try {
      const saved = await sendMessage(activeId, body, 'text');
      lastAtRef.current = saved.createdAt;
      setMessages((prev) => prev.map((m) => (m.id === pending.id ? saved : m)));
      refreshRooms();
    } catch (err) {
      setError(err.message || 'That message did not send.');
      setMessages((prev) => prev.map((m) => (m.id === pending.id ? { ...m, failed: true } : m)));
    } finally {
      inputRef.current?.focus();
    }
  };

  const uploadPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activeId) return;
    if (!file.type.startsWith('image/')) { setError('Must be an image.'); return; }
    if (file.size > 4 * 1024 * 1024) { setError('Image too large. Under 4MB please.'); return; }

    const reader = new FileReader();
    reader.onload = async () => {
      const body = reader.result;
      const pending = { id: `local-${Date.now()}`, sender: me, body, kind: 'photo', createdAt: new Date().toISOString(), pending: true };
      setMessages((prev) => [...prev, pending]);
      try {
        const saved = await sendMessage(activeId, body, 'photo');
        lastAtRef.current = saved.createdAt;
        setMessages((prev) => prev.map((m) => (m.id === pending.id ? saved : m)));
        refreshRooms();
      } catch (err) {
        setError(err.message || 'Photo did not send.');
        setMessages((prev) => prev.map((m) => (m.id === pending.id ? { ...m, failed: true } : m)));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDraftChange = (e) => {
    const val = e.target.value;
    setDraft(val);
    const match = val.match(/@([a-zA-Z0-9_]*)$/);
    if (match) {
      setMentionQuery(match[1].toLowerCase());
    } else {
      setMentionQuery(null);
    }
  };

  const insertMention = (username) => {
    setDraft((prev) => prev.replace(/@([a-zA-Z0-9_]*)$/, `@${username} `));
    setMentionQuery(null);
    inputRef.current?.focus();
  };

  /* ---- starting a chat --------------------------------------------------- */
  const openComposer = async () => {
    setComposing(true);
    setPicked([]);
    setGroupName('');
    try {
      setContacts(await getContacts());
    } catch (err) {
      setError(err.message || 'Could not load the people list.');
    }
  };

  const togglePicked = (username) => {
    setPicked((prev) => (prev.includes(username)
      ? prev.filter((u) => u !== username)
      : [...prev, username]));
  };

  const startChat = async () => {
    if (picked.length === 0) return;
    try {
      const created = await createRoom(picked.length > 1 ? groupName.trim() : '', picked);
      setComposing(false);
      await refreshRooms();
      setActiveId(created.id);
    } catch (err) {
      setError(err.message || 'Could not start that chat.');
    }
  };

  /* ---- membership -------------------------------------------------------- */
  const invite = async () => {
    const notIn = contacts.filter((c) => !room.members.some((m) => m.username === c.username));
    if (notIn.length === 0) { setError('Everyone is already in this group.'); return; }
    const name = window.prompt(`Add who? One of: ${notIn.map((c) => c.username).join(', ')}`);
    if (!name) return;
    try {
      await addMembers(activeId, [name.trim()]);
      setRoom(await getRoom(activeId));
      const fresh = await listMessages(activeId, lastAtRef.current || undefined);
      if (fresh.length) {
        lastAtRef.current = fresh[fresh.length - 1].createdAt;
        setMessages((prev) => [...prev, ...fresh]);
      }
    } catch (err) {
      setError(err.message || 'Could not add them.');
    }
  };

  const leave = async () => {
    const ok = await window.appConfirm(
      `Leave ${room.name}? You will stop receiving its messages.`,
      'Leave chat',
    );
    if (!ok) return;
    try {
      await removeMember(activeId, me);
      setActiveId(null);
      refreshRooms();
    } catch (err) {
      setError(err.message || 'Could not leave.');
    }
  };

  /* Deletes the whole group — messages and membership gone for everyone. The
     confirmation spells that out, because unlike leaving there is no undo. */
  const removeGroup = async () => {
    const ok = await window.appConfirm(
      `Delete "${room.name}" for everyone? All messages will be lost. This cannot be undone.`,
      'Delete group',
    );
    if (!ok) return;
    try {
      await deleteRoom(activeId);
      setActiveId(null);
      refreshRooms();
    } catch (err) {
      setError(err.message || 'Could not delete the group.');
    }
  };

  /* ---- rendering --------------------------------------------------------- */
  const visibleRooms = rooms.filter((r) => {
    const q = filter.trim().toLowerCase();
    return !q || r.name.toLowerCase().includes(q) || (r.last?.body || '').toLowerCase().includes(q);
  });

  if (!me) {
    return <div className="nx-tc__signin">Sign in to use team chat.</div>;
  }

  return (
    <div className={`nx-tc${activeId ? ' has-open-room' : ''}`}>
      {/* ---- rooms ------------------------------------------------------- */}
      <aside className="nx-tc__list">
        <header className="nx-tc__list-head">
          <h1 className="nx-tc__heading">Team Chat</h1>
          <button type="button" className="nx-tc__new" onClick={openComposer} title="Start a chat">
            <MessageSquarePlus size={16} /> New
          </button>
        </header>

        <div className="nx-tc__search">
          <Search size={14} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
          />
        </div>

        <div className="nx-tc__rooms">
          {visibleRooms.length === 0 && (
            <p className="nx-tc__empty">
              {rooms.length === 0 ? 'No chats yet. Start one with New.' : 'Nothing matches that.'}
            </p>
          )}
          {visibleRooms.map((r) => (
            <button
              key={r.id}
              type="button"
              className={`nx-tc__room${r.id === activeId ? ' is-active' : ''}`}
              onClick={() => setActiveId(r.id)}
            >
              <span className={`nx-tc__avatar${r.isGroup ? ' is-group' : ''}`}>
                {r.isGroup ? <Users size={15} /> : initials(r.name)}
              </span>
              <span className="nx-tc__room-text">
                <span className="nx-tc__room-top">
                  <span className="nx-tc__room-name">{r.name}</span>
                  <span className="nx-tc__room-when">{whenLabel(r.last?.createdAt || r.updatedAt)}</span>
                </span>
                <span className="nx-tc__room-bottom">
                  <span className="nx-tc__room-last">
                    {r.last
                      ? `${r.last.sender === me ? 'You: ' : r.isGroup ? `${r.last.sender}: ` : ''}${r.last.kind === 'photo' ? '📷 Photo' : r.last.body}`
                      : 'No messages yet'}
                  </span>
                  {r.unread > 0 && <span className="nx-tc__badge">{r.unread}</span>}
                </span>
              </span>
            </button>
          ))}
        </div>
      </aside>

      {/* ---- the conversation -------------------------------------------- */}
      <section className="nx-tc__thread-wrap">
        {!activeId && (
          <div className="nx-tc__placeholder">
            <Users size={34} />
            <p className="nx-tc__placeholder-title">Pick a chat, or start one</p>
            <p className="nx-tc__placeholder-text">
              Messages here stay inside the CRM and are only visible to the people in the chat.
            </p>
          </div>
        )}

        {activeId && room && (
          <>
            <header className="nx-tc__thread-head">
              <button
                type="button"
                className="nx-tc__back"
                onClick={() => setActiveId(null)}
                aria-label="Back to chats"
              >
                <ArrowLeft size={16} />
              </button>
              <span className={`nx-tc__avatar${room.isGroup ? ' is-group' : ''}`}>
                {room.isGroup ? <Users size={15} /> : initials(room.name)}
              </span>
              <button
                type="button"
                className="nx-tc__thread-who"
                onClick={() => setShowMembers((v) => !v)}
                title="Who is in this chat"
              >
                <span className="nx-tc__thread-name">{room.name}</span>
                <span className="nx-tc__thread-sub">
                  {room.members.map((m) => (m.username === me ? 'You' : m.username)).join(', ')}
                </span>
              </button>
              {room.isGroup && room.isAdmin && (
                <button type="button" className="nx-tc__icon" onClick={invite} title="Add someone">
                  <UserPlus size={16} />
                </button>
              )}
              {room.isGroup && room.isAdmin && (
                <button
                  type="button"
                  className="nx-tc__icon nx-tc__icon--danger"
                  onClick={removeGroup}
                  title="Delete this group for everyone"
                >
                  <Trash2 size={16} />
                </button>
              )}
              <button type="button" className="nx-tc__icon" onClick={leave} title="Leave this chat">
                <LogOut size={16} />
              </button>
            </header>

            {showMembers && (
              <div className="nx-tc__members">
                {room.members.map((m) => (
                  <span key={m.username} className="nx-tc__member">
                    {m.username === me ? `${m.username} (you)` : m.username}
                    {m.isAdmin && <em> · admin</em>}
                  </span>
                ))}
              </div>
            )}

            <div className="nx-tc__thread" ref={threadRef}>
              {messages.map((m, i) => {
                const mine = m.sender === me;
                const system = m.kind === 'system';
                const previous = messages[i - 1];
                const newDay = !previous || dayLabel(previous.createdAt) !== dayLabel(m.createdAt);
                // In a group, only label a message when the speaker changes.
                const showSender = room.isGroup && !mine && !system
                  && (!previous || previous.sender !== m.sender || newDay);

                return (
                  <div key={m.id}>
                    {newDay && <div className="nx-tc__day"><span>{dayLabel(m.createdAt)}</span></div>}
                    {system ? (
                      <div className="nx-tc__system">{m.body}</div>
                    ) : (
                      <div className={`nx-tc__row${mine ? ' is-mine' : ''}`}>
                        <div className={`nx-tc__bubble${mine ? ' is-mine' : ''}${m.failed ? ' is-failed' : ''}`}>
                          {showSender && <p className="nx-tc__sender">{m.sender}</p>}
                          {m.kind === 'photo' ? (
                            <div className="nx-tc__photo"><img src={m.body} alt="Uploaded" style={{ maxWidth: '100%', borderRadius: 8, display: 'block' }} loading="lazy" /></div>
                          ) : (
                            <p className="nx-tc__text">
                              {m.body.split(/(@[a-zA-Z0-9_]+)/g).map((part, index) =>
                                part.startsWith('@') ? <strong key={index} style={{ color: 'var(--nx-accent)', fontWeight: 600 }}>{part}</strong> : part
                              )}
                            </p>
                          )}
                          <span className="nx-tc__meta">
                            {timeLabel(m.createdAt)}
                            {mine && (m.failed
                              ? <X size={12} className="nx-tc__tick is-failed" aria-label="Not sent" />
                              : m.pending
                                ? <Check size={12} className="nx-tc__tick" aria-label="Sending" />
                                : <CheckCheck size={12} className="nx-tc__tick is-sent" aria-label="Sent" />)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ position: 'relative' }}>
              {mentionQuery !== null && contacts.filter(c => c.username.toLowerCase().startsWith(mentionQuery)).length > 0 && (
                <div className="nx-tc__mentions" style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, background: 'var(--nx-bg-card)', border: '1px solid var(--nx-border-strong)', borderRadius: 8, marginBottom: 4, maxHeight: 150, overflowY: 'auto', zIndex: 10 }}>
                  {contacts.filter(c => c.username.toLowerCase().startsWith(mentionQuery)).map(c => (
                    <button key={c.username} type="button" onClick={() => insertMention(c.username)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>
                      <strong>{c.username}</strong> {c.name !== c.username && <span style={{ opacity: 0.6, fontSize: '0.9em' }}>{c.name}</span>}
                    </button>
                  ))}
                </div>
              )}
              <form className="nx-tc__composer" onSubmit={send}>
                <label className="nx-tc__attach" title="Attach Photo">
                  <input type="file" accept="image/*" onChange={uploadPhoto} style={{ display: 'none' }} />
                  <ImageIcon size={18} style={{ cursor: 'pointer', color: 'var(--nx-text-secondary)', marginRight: '8px' }} />
                </label>
                <input
                  ref={inputRef}
                  className="nx-tc__input"
                  value={draft}
                  onChange={handleDraftChange}
                  placeholder={`Message ${room.name}`}
                  aria-label="Your message"
                />
                <button type="submit" className="nx-tc__send" disabled={!draft.trim()} aria-label="Send">
                  <Send size={16} />
                </button>
              </form>
            </div>
          </>
        )}
      </section>

      {/* ---- start a chat ------------------------------------------------- */}
      {composing && (
        <div className="nx-tc__modal" role="dialog" aria-label="Start a chat">
          <div className="nx-tc__modal-box">
            <header className="nx-tc__modal-head">
              <h2>Start a chat</h2>
              <button type="button" className="nx-tc__icon" onClick={() => setComposing(false)} aria-label="Close">
                <X size={16} />
              </button>
            </header>

            <p className="nx-tc__modal-hint">
              Pick one person for a direct chat, or several for a group. Only people
              with an account here can be added.
            </p>

            <div className="nx-tc__picklist">
              {contacts.length === 0 && <p className="nx-tc__empty">Nobody else has an account yet.</p>}
              {contacts.map((c) => (
                <label key={c.username} className="nx-tc__pick">
                  <input
                    type="checkbox"
                    checked={picked.includes(c.username)}
                    onChange={() => togglePicked(c.username)}
                  />
                  <span className="nx-tc__avatar">{initials(c.username)}</span>
                  <span className="nx-tc__pick-text">
                    <span className="nx-tc__pick-name">{c.username}</span>
                    {c.name !== c.username && <span className="nx-tc__pick-sub">{c.name}</span>}
                  </span>
                </label>
              ))}
            </div>

            {picked.length > 1 && (
              <input
                className="nx-tc__groupname"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Group name (optional)"
                aria-label="Group name"
              />
            )}

            <footer className="nx-tc__modal-foot">
              <span className="nx-tc__picked">
                {picked.length === 0 ? 'Nobody picked'
                  : picked.length === 1 ? `Direct chat with ${picked[0]}`
                    : `Group of ${picked.length + 1}, including you`}
              </span>
              <button type="button" className="nx-tc__start" onClick={startChat} disabled={picked.length === 0}>
                Start
              </button>
            </footer>
          </div>
        </div>
      )}

      {error && (
        <p className="nx-tc__error" role="alert">
          {error}
          <button type="button" onClick={() => setError('')} aria-label="Dismiss"><X size={13} /></button>
        </p>
      )}
    </div>
  );
}
