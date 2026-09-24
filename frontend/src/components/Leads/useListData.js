import { useCallback, useEffect, useRef, useState } from 'react';
import { ANY, subscribeDataChanged } from '../../utils/dataBus';

/**
 * Loads a list from the API and keeps it fresh without a page refresh.
 *
 * - fetches on mount
 * - refetches when anything is written to the API, so a create or an edit on
 *   another screen appears here without a page reload
 * - refetches when the tab/window regains focus, so changes made elsewhere
 *   (another tab, a colleague) show up on return
 * - exposes refresh() to call after create / edit / delete
 *
 * The initial load shows the table's loading state; background refreshes are
 * silent so the table doesn't flash while you are reading it.
 *
 * @param {Function} fetcher async () => rows
 * @param {object}   options { enabled, refetchOnFocus, resource }
 *   resource — which kind of row this list holds ('users', 'leads', …), so it
 *   refetches only when that kind changes. Omitted, it listens for every
 *   change: an unnecessary silent refetch of a short list costs little, and a
 *   MISSED one is the bug this exists to fix.
 */
export default function useListData(fetcher, { enabled = true, refetchOnFocus = true, resource } = {}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Keep the latest fetcher without making load() change identity every render.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const mountedRef = useRef(true);
  const loadedOnceRef = useRef(false);

  /* StrictMode mounts, unmounts and remounts in development. The flag has to
     be set on every mount, or the remounted instance thinks it is unmounted
     and drops every result — leaving the table stuck on "Loading...". */
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!enabled) return;
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await fetcherRef.current();
      if (!mountedRef.current) return;
      setRows(Array.isArray(data) ? data : []);
      setError(null);
      loadedOnceRef.current = true;
    } catch (err) {
      if (!mountedRef.current) return;
      console.error('Failed to load list data', err);
      setError(err);
    } finally {
      /* Guard with a plain conditional: a `return` inside finally would
         override the returns above and is easy to misread. */
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [enabled]);

  useEffect(() => { load(); }, [load]);

  /* Somebody wrote to the API — here, or on any other screen in this tab.
     Silent, so a table being read does not flash while it updates. */
  useEffect(() => {
    if (!enabled) return undefined;
    return subscribeDataChanged(resource || ANY, () => {
      if (!loadedOnceRef.current) return;
      load({ silent: true });
    });
  }, [load, enabled, resource]);

  useEffect(() => {
    if (!refetchOnFocus || !enabled) return undefined;

    const refreshIfVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (!loadedOnceRef.current) return;
      load({ silent: true });
    };

    window.addEventListener('focus', refreshIfVisible);
    document.addEventListener('visibilitychange', refreshIfVisible);
    return () => {
      window.removeEventListener('focus', refreshIfVisible);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [load, refetchOnFocus, enabled]);

  /* Call after a mutation. Silent so the rows stay put while they update. */
  const refresh = useCallback(() => load({ silent: true }), [load]);

  return { rows, setRows, loading, refreshing, error, refresh, reload: load };
}
