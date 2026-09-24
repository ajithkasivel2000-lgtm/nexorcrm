import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import Button from './Button';
import './Modal.css';

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

/* Scroll-lock is refcounted: two stacked modals must not have the first one to
   close hand the page its scrollbar back while the second is still open. */
let lockCount = 0;
function lockScroll() {
  if (lockCount === 0) {
    const width = window.innerWidth - document.documentElement.clientWidth;
    document.body.dataset.nxScrollY = String(window.scrollY);
    document.body.style.overflow = 'hidden';
    if (width > 0) document.body.style.paddingRight = `${width}px`;
  }
  lockCount += 1;
}
function unlockScroll() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
    delete document.body.dataset.nxScrollY;
  }
}

/**
 * Accessible dialog.
 *
 * - ESC closes (unless closeOnEsc={false})
 * - clicking the backdrop does NOT close, so a part-filled form can't be
 *   lost to a stray click; pass closeOnBackdrop to opt back in
 * - focus moves in on open, is trapped while open, and returns to whatever was
 *   focused before on close
 * - background scroll is locked, refcounted for stacked modals
 *
 * size: sm | md | lg | xl | full
 */
export default function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeOnEsc = true,
  closeOnBackdrop = false,
  showClose = true,
  /* Opt-in Enter-to-save, for an edit dialog whose body is not a <form> and
     so gets no submit of its own. Deliberately opt-in: a confirm dialog must
     not commit because somebody still had a finger on the key, and a delete
     dialog least of all. Textareas and buttons keep Enter for themselves. */
  onSubmit,
  /* Which stacking layer the dialog sits on. 'confirm' raises it above the
     field menus, which render in their own portal above the normal modal layer
     so they can open inside a modal — without this, a confirm opened from
     inside such a menu appears behind it. */
  layer = 'default',
}) {
  const panelRef = useRef(null);
  const previouslyFocused = useRef(null);
  const titleId = useRef(`nx-modal-title-${Math.random().toString(36).slice(2, 9)}`);
  const descId = useRef(`nx-modal-desc-${Math.random().toString(36).slice(2, 9)}`);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape' && closeOnEsc) {
      e.stopPropagation();
      onClose?.();
      return;
    }

    if (e.key === 'Enter' && onSubmit) {
      const el = e.target;
      const tag = el?.tagName?.toLowerCase();
      /* A textarea needs Enter for its newlines, a button and a link need it
         for their own click, and a select needs it to choose. Anything else —
         a text input, or the panel itself — means "I am done here". */
      if (tag === 'textarea' || tag === 'button' || tag === 'a' || tag === 'select') return;
      if (el?.isContentEditable) return;
      e.preventDefault();
      onSubmit(e);
      return;
    }

    if (e.key !== 'Tab') return;

    const nodes = panelRef.current?.querySelectorAll(FOCUSABLE);
    if (!nodes || nodes.length === 0) {
      e.preventDefault();
      return;
    }
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    // Wrap focus at both ends so Tab can never escape the dialog.
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }, [closeOnEsc, onClose, onSubmit]);

  useEffect(() => {
    if (!open) return undefined;

    previouslyFocused.current = document.activeElement;
    lockScroll();

    // Focus the first meaningful control, falling back to the panel itself.
    const raf = requestAnimationFrame(() => {
      const target = panelRef.current?.querySelector('[data-autofocus]')
        || panelRef.current?.querySelector(FOCUSABLE)
        || panelRef.current;
      target?.focus?.();
    });

    return () => {
      cancelAnimationFrame(raf);
      unlockScroll();
      // Returning focus is what keeps keyboard users from being dumped at the
      // top of the document every time a dialog closes.
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className={`nx-modal-overlay nx-scope${layer === 'confirm' ? ' nx-modal-overlay--confirm' : ''}`}
      onMouseDown={(e) => {
        // mousedown, not click: a drag that starts inside and ends on the
        // backdrop should not close the dialog.
        if (closeOnBackdrop && e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={panelRef}
        className={`nx-modal nx-modal--${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId.current : undefined}
        aria-describedby={description ? descId.current : undefined}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        {/* Always rendered: a dialog without a title bar leaves no reliable
            place to close from once the body scrolls. */}
        <header className="nx-modal__header">
          <div className="nx-modal__heading">
            {title && <h2 className="nx-modal__title" id={titleId.current}>{title}</h2>}
            {description && (
              <p className="nx-modal__description" id={descId.current}>{description}</p>
            )}
          </div>
          {showClose && (
            <Button
              variant="ghost"
              size="sm"
              icon={X}
              onClick={onClose}
              aria-label="Close dialog"
              className="nx-modal__close"
            />
          )}
        </header>

        <div className="nx-modal__body">{children}</div>

        {footer && <footer className="nx-modal__footer">{footer}</footer>}
      </div>
    </div>,
    document.body
  );
}
