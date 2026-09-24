import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BellOff, BellRing, Check } from 'lucide-react';
import { disablePush, enablePush, isPushSupported, isSubscribed, permissionState } from '../utils/push';
import { toast, Button } from '../ui';
import './NotificationMenu.css';

/**
 * The header bell: what has happened, newest first, plus the switch that
 * decides whether this browser is also told when the app is closed.
 *
 * The list is the record and the push is the announcement — a notification
 * missed while signed out is still here afterwards, which is why the two are
 * stored separately.
 */

/** "just now", "5 min ago", "3 days ago" — enough to place it. */
function relativeTime(value) {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function NotificationMenu({ username, items, onRefresh, onClose }) {
  const navigate = useNavigate();
  const [pushState, setPushState] = useState('checking');
  const [busy, setBusy] = useState(false);

  const refreshPush = useCallback(async () => {
    if (!isPushSupported()) return setPushState('unsupported');
    if (permissionState() === 'denied') return setPushState('blocked');
    setPushState(await isSubscribed(username) ? 'on' : 'off');
  }, [username]);

  useEffect(() => { refreshPush(); }, [refreshPush]);

  /** Marks one read. It leaves the list, because the list is what is unread. */
  const markOneRead = async (item) => {
    await fetch(`/api/notifications/${item.id}/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    }).catch(() => { });
    onRefresh();
  };

  /** Opening one counts as having seen it, so it is cleared on the way out. */
  const open = async (item) => {
    if (!item.readAt) await markOneRead(item);
    if (item.url) navigate(item.url);
    onClose();
  };

  const markAllRead = async () => {
    await fetch('/api/notifications/read-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    }).catch(() => { });
    onRefresh();
  };

  const handleEnable = async () => {
    setBusy(true);
    const result = await enablePush(username);
    setBusy(false);
    if (result.ok) toast.success('Notifications are on for this browser.');
    else toast.error(result.reason);
    refreshPush();
  };

  const handleDisable = async () => {
    setBusy(true);
    const result = await disablePush();
    setBusy(false);
    if (result.ok) toast.info('Notifications are off for this browser.');
    else toast.error(result.reason);
    refreshPush();
  };

  return (
    <div className="nx-notif">
      <div className="nx-notif__head">
        <span className="nx-notif__title">Notifications</span>
        {/* Offered whenever there is anything to clear. Keyed off the list
            rather than the unread count, because the list only ever holds
            unread ones now. */}
        {items.length > 0 && (
          <button type="button" className="nx-notif__markall" onClick={markAllRead}>
            <Check size={13} /> Mark all read
          </button>
        )}
      </div>

      <div className="nx-notif__list">
        {items.length === 0 ? (
          <p className="nx-notif__empty">You are all caught up! No new notifications.</p>
        ) : items.map((item) => (
          /* A row, not a button: it carries two actions — open it, or clear it
             without going anywhere — and a button inside a button is not
             valid markup. */
          <div
            key={item.id}
            className={`nx-notif__item${item.readAt ? '' : ' is-unread'}`}
          >
            <button type="button" className="nx-notif__open" onClick={() => open(item)}>
              <span className="nx-notif__dot" aria-hidden="true" />
              <span className="nx-notif__text">
                <span className="nx-notif__item-title">{item.title}</span>
                {item.body && <span className="nx-notif__item-body">{item.body}</span>}
                <span className="nx-notif__time">{relativeTime(item.createdAt)}</span>
              </span>
            </button>
            <button
              type="button"
              className="nx-notif__mark"
              onClick={() => markOneRead(item)}
              title="Mark as read"
              aria-label={`Mark "${item.title}" as read`}
            >
              <Check size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* The switch lives under the list: the list is what people open the
          bell for, and this is set once and then left alone. */}
      <div className="nx-notif__foot">
        {pushState === 'unsupported' && (
          <p className="nx-notif__note">
            This browser cannot show desktop notifications. On iPhone, add
            NexorCRM to the Home Screen first.
          </p>
        )}
        {pushState === 'blocked' && (
          <p className="nx-notif__note">
            Desktop notifications are blocked for this site. Allow them in your
            browser&apos;s site settings.
          </p>
        )}
        {pushState === 'on' && (
          <div className="nx-notif__push">
            <span className="nx-notif__push-state is-on">
              <BellRing size={14} /> Desktop alerts on for {username}
            </span>
            <div className="nx-notif__push-actions">
              <Button variant="secondary" size="sm" onClick={handleDisable} disabled={busy}>
                Turn off
              </Button>
            </div>
          </div>
        )}
        {pushState === 'off' && (
          <div className="nx-notif__push">
            <span className="nx-notif__push-state">
              <BellOff size={16} /> Desktop alerts off
            </span>
            <Button
              variant="primary"
              size="sm"
              icon={BellRing}
              onClick={handleEnable}
              loading={busy}
            >
              Turn on
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
