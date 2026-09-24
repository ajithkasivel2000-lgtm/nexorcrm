import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { applyPageMeta, resolvePageMeta } from '../utils/pageMeta';

/**
 * Keeps the document head in step with the route.
 *
 * Mounted once inside the router; every navigation rewrites the title,
 * description, keywords, canonical and the social tags. Nothing else has to
 * think about it.
 *
 * A screen that knows the name of the record it is showing can add it with
 * useRecordTitle() below, so the tab reads "Hemanth · Lead Profile" rather than
 * the same "Lead Profile" for every lead.
 */
export default function usePageMeta() {
  const { pathname } = useLocation();

  useEffect(() => {
    applyPageMeta(resolvePageMeta(pathname));
  }, [pathname]);
}

/**
 * Puts a record's own name in front of the page title.
 *
 * Call it with whatever names the thing on screen — a lead's name, a project's
 * name. Passing nothing (while it is still loading) leaves the plain page
 * title in place rather than flashing an empty prefix.
 *
 *   useRecordTitle(lead?.name);
 */
export function useRecordTitle(detail) {
  const { pathname } = useLocation();

  useEffect(() => {
    applyPageMeta(resolvePageMeta(pathname), { detail: detail || undefined });
  }, [pathname, detail]);
}
