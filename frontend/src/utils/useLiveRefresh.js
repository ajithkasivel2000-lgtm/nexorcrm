import { useEffect, useRef } from 'react';
import { subscribeDataChanged } from './dataBus';

/**
 * Keep a screen's data live.
 *
 * Screens each fetch their own rows on mount and then never look again, so a
 * record created or edited anywhere else — another tab, another screen, a role
 * change — left every open view showing what it had loaded until someone
 * reloaded the page by hand. dataBus already announces those writes (apiAuth
 * publishes after any successful POST/PUT/PATCH/DELETE); this is the listening
 * half, in the one shape every screen needs.
 *
 *   useLiveRefresh(['leads', 'projects'], fetchLeads);
 *
 * Two details that stop it being a footgun:
 *
 *   - `refetch` is held in a ref, so callers can pass a plain inline function
 *     without wrapping it in useCallback. A screen that re-renders does not
 *     resubscribe.
 *   - the resource list is keyed by its joined string, so the array literal
 *     above does not count as a new value on every render.
 *
 * Do NOT use this on a form that holds unsaved input. Refetching under someone
 * who is mid-edit throws their work away; either leave the form alone or gate
 * it with `enabled` on a dirty check, the way UserPermissions does.
 */
export default function useLiveRefresh(resources, refetch, { enabled = true } = {}) {
  const cb = useRef(refetch);
  cb.current = refetch;

  const key = (Array.isArray(resources) ? resources : [resources]).filter(Boolean).join(',');

  useEffect(() => {
    if (!enabled || !key) return undefined;
    return subscribeDataChanged(key.split(','), () => { cb.current?.(); });
  }, [key, enabled]);
}
