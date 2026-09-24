import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './Popover.css';

/**
 * A menu anchored to a trigger, rendered through a portal.
 *
 * Anchored menus keep getting clipped: a `position: absolute` panel is cut off
 * by the nearest scrolling or `overflow: hidden` ancestor — the table card, a
 * modal body, a scrolled page. Portalling onto <body> and positioning with
 * `fixed` means nothing can clip it.
 *
 * Renders its own trigger so the anchor ref, outside-click and Escape handling
 * stay in one place.
 *
 * @param {Function} trigger  ({ open, toggle, ref }) => ReactNode
 * @param {string}   align    'start' | 'end' — which edge to line up with
 */
export default function Popover({ trigger, children, align = 'end', width, onOpenChange }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const anchorRef = useRef(null);
  const panelRef = useRef(null);

  const setOpenState = useCallback((next) => {
    setOpen(next);
    onOpenChange?.(next);
  }, [onOpenChange]);

  const position = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const panelH = panelRef.current?.offsetHeight || 280;
    const panelW = panelRef.current?.offsetWidth || width || 220;
    const below = window.innerHeight - r.bottom;
    const dropUp = below < panelH + 8 && r.top > below;

    // Keep the panel on screen horizontally whichever edge it aligns to.
    let left = align === 'end' ? r.right - panelW : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - panelW - 8));

    setPos({
      left,
      top: dropUp ? undefined : r.bottom + 6,
      bottom: dropUp ? window.innerHeight - r.top + 6 : undefined,
      maxHeight: Math.max(160, (dropUp ? r.top : below) - 16),
      minWidth: width || r.width,
    });
  }, [align, width]);

  useLayoutEffect(() => {
    if (!open) { setPos(null); return undefined; }
    position();
    // Capture phase catches scrolling in any ancestor, not just the window.
    window.addEventListener('scroll', position, true);
    window.addEventListener('resize', position);
    return () => {
      window.removeEventListener('scroll', position, true);
      window.removeEventListener('resize', position);
    };
  }, [open, position]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      // The panel is outside the anchor's DOM subtree now, so check both.
      if (!anchorRef.current?.contains(e.target) && !panelRef.current?.contains(e.target)) {
        setOpenState(false);
      }
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpenState(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, setOpenState]);

  return (
    <>
      {trigger({ open, toggle: () => setOpenState(!open), ref: anchorRef })}
      {open && createPortal(
        <div
          ref={panelRef}
          className="nx-popover"
          role="menu"
          style={{
            left: pos?.left,
            top: pos?.top,
            bottom: pos?.bottom,
            maxHeight: pos?.maxHeight,
            minWidth: pos?.minWidth,
            // Hidden until measured, so it never flashes at 0,0.
            visibility: pos ? 'visible' : 'hidden',
          }}
        >
          {typeof children === 'function' ? children({ close: () => setOpenState(false) }) : children}
        </div>,
        document.body
      )}
    </>
  );
}
