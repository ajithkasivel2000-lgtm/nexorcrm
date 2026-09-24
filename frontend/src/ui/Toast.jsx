import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info, X } from 'lucide-react';
import './Toast.css';

/**
 * Toasts, stacked top-right.
 *
 * Every page that needed one was carrying its own copy — its own state, its
 * own timeout, its own markup — which is why the same "saved" message looked
 * and behaved differently depending on where you were. One host, mounted once,
 * driven by a plain function any file can import:
 *
 *   toast.success('Lead created successfully.');
 *   toast.error('Could not reach the server.');
 *
 * Several at once stack rather than replace each other, so a second result
 * does not erase the first before it has been read.
 */

import { ICONS, pending, setPublish } from './toastUtils';

export function ToastHost() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    setPublish((item) => setItems((prev) => [...prev, item]));
    // Anything raised before this mounted still gets shown.
    if (pending.length) {
      setItems((prev) => [...prev, ...pending.splice(0, pending.length)]);
    }
    return () => { setPublish(null); };
  }, []);

  const dismiss = (id) => setItems((prev) => prev.filter((t) => t.id !== id));

  if (items.length === 0) return null;

  return createPortal(
    <div className="nx-toasts" role="region" aria-label="Notifications">
      {items.map((item) => (
        <ToastItem key={item.id} item={item} onDismiss={() => dismiss(item.id)} />
      ))}
    </div>,
    document.body,
  );
}

function ToastItem({ item, onDismiss }) {
  const Icon = ICONS[item.type] || Info;
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    // Play the exit animation, then remove. Without the pause the toast simply
    // vanishes, which reads as a glitch rather than as dismissal.
    const hide = setTimeout(() => setLeaving(true), item.duration);
    const remove = setTimeout(onDismiss, item.duration + 200);
    return () => { clearTimeout(hide); clearTimeout(remove); };
  }, [item.duration, onDismiss]);

  return (
    <div
      className={`nx-toast nx-toast--${item.type}${leaving ? ' is-leaving' : ''}`}
      // An error interrupts a screen reader; a confirmation waits its turn.
      role={item.type === 'error' ? 'alert' : 'status'}
    >
      <Icon size={16} className="nx-toast__icon" aria-hidden="true" />
      <span className="nx-toast__message">{item.message}</span>
      <button type="button" className="nx-toast__close" onClick={onDismiss} aria-label="Dismiss">
        <X size={14} />
      </button>
    </div>
  );
}

export default ToastHost;
