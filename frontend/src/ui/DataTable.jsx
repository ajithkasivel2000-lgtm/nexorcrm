import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronsUpDown, Columns3, Download, Inbox, Maximize2, Minimize2, RotateCcw, SlidersHorizontal, Trash2 } from 'lucide-react';
import Button from './Button';
import Popover from './Popover';
import SearchInput from './SearchInput';
import { createdColumn, updatedColumn } from './dateColumns';
import loadPdfTools from '../utils/loadPdfTools';
import './DataTable.css';
import Select from './Select';
import { canDelete } from '../utils/currentUser';

/* Sort values of mixed type sensibly: numbers numerically, dates
   chronologically, everything else as case-insensitive text. Blanks always sink
   to the bottom regardless of direction, so empty cells never crowd the top. */
function compareValues(a, b) {
  const aEmpty = a === null || a === undefined || a === '';
  const bEmpty = b === null || b === undefined || b === '';
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  if (typeof a === 'number' && typeof b === 'number') return a - b;

  const aDate = Date.parse(a);
  const bDate = Date.parse(b);
  if (!Number.isNaN(aDate) && !Number.isNaN(bDate) && typeof a === 'string' && typeof b === 'string') {
    return aDate - bDate;
  }

  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

const ALL_TAB = '__all__';
/* Beyond this many distinct values a tab strip stops being scannable; the
   Filter dropdown covers those cases instead. */
const MAX_AUTO_TABS = 8;

/* Column visibility is a per-user preference. localStorage can throw in
   private-browsing modes, so every access is guarded. */
function loadHidden(persistKey) {
  if (!persistKey) return new Set();
  try {
    const raw = localStorage.getItem(`nx-table:${persistKey}:hidden`);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

/**
 * The application's one data table.
 *
 * columns: [{ key, label, sortable?, width?, align?, render?(row),
 *             sortValue?(row), exportValue?(row), searchable?, hideable? }]
 *
 * Search, filters, sorting and paging happen in-memory. Pass `serverSide` and
 * drive `rows` yourself for server-side paging.
 */
export default function DataTable({
  columns,
  rows = [],
  getRowId = (row, i) => row.id ?? i,
  loading = false,

  // Toolbar features
  searchable = true,
  searchPlaceholder = 'Search...',
  filters,                 // [{ key, label, placeholder, options: [] }]
  onFiltersChange,         // called with the filter values; for server-side filtering
  exportName,              // enables the export menu; also the filename stem
  persistKey,              // localStorage key for column visibility
  fullscreenable = true,
  timestamps = true,       // append Created / Updated columns automatically
  toolbar,
  title,

  // Tabs
  tabs,                    // [{ id, label, count? }] — controlled
  tabsFrom,                // column key: build the tab strip from its values
  activeTab,
  onTabChange,

  // Rows
  selectable = true,
  rowNumbers = true,
  actions,
  bulkActions,
  onDeleteSelected,        // renders the standard "Delete Selected" action
  onRowClick,

  // Paging
  pageSize: initialPageSize = 25,
  pageSizeOptions = [10, 25, 50, 100],
  serverSide = false,

  emptyMessage = 'No records found',
  emptyHint,
  stickyHeader = true,
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState({ key: null, dir: 'asc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [selected, setSelected] = useState(() => new Set());
  const [hidden, setHidden] = useState(() => loadHidden(persistKey));
  const [filterValues, setFilterValues] = useState({});
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [autoTab, setAutoTab] = useState(ALL_TAB);

  /* ---- persistence ------------------------------------------------------ */
  useEffect(() => {
    if (!persistKey) return;
    try {
      localStorage.setItem(`nx-table:${persistKey}:hidden`, JSON.stringify([...hidden]));
    } catch {
      // A browser refusing storage shouldn't break the table.
    }
  }, [hidden, persistKey]);

  useEffect(() => {
    onFiltersChange?.(filterValues);
    // Callers pass an inline object; depending on the identity would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterValues]);

  /* Every table ends with Created and Updated. Added here rather than in each
     screen so the formatting can't drift, skipped when the screen already
     defines its own, and skipped when the data has no such field — SystemLog,
     for one, has createdAt but no updatedAt. */
  const allColumns = useMemo(() => {
    if (!timestamps) return columns;
    const sample = rows[0];
    if (!sample) return columns;
    const defines = (key) => columns.some((c) => c.key === key);
    const extra = [];
    if (!defines('createdAt') && 'createdAt' in sample) extra.push(createdColumn);
    if (!defines('updatedAt') && 'updatedAt' in sample) extra.push(updatedColumn);
    return extra.length ? [...columns, ...extra] : columns;
  }, [columns, rows, timestamps]);

  const visibleColumns = useMemo(
    () => allColumns.filter((c) => !hidden.has(c.key)),
    [allColumns, hidden]
  );

  /* ---- filters ----------------------------------------------------------
     `filters` takes either a column key ('status') or a full definition
     ({ key, label, placeholder, options, getValue }). A bare key derives its
     label from the matching column and its options from the rows on screen,
     so a screen usually only has to name the columns worth filtering on. */
  const filterFields = useMemo(() => {
    if (!filters?.length) return [];
    return filters.map((entry) => {
      const field = typeof entry === 'string' ? { key: entry } : { ...entry };
      const col = allColumns.find((c) => c.key === field.key);
      // Use the column's export accessor so a filter matches what the cell
      // shows, not a raw id hiding behind a rendered pill.
      if (!field.getValue) field.getValue = col?.exportValue || ((row) => row[field.key]);
      if (!field.label) field.label = col?.label || field.key;
      if (!field.placeholder) field.placeholder = `All ${field.label}`;
      if (!field.options) {
        field.options = [...new Set(
          rows.map((row) => field.getValue(row)).filter((v) => v !== null && v !== undefined && v !== '')
        )].map(String).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      }
      return field;
    });
  }, [filters, allColumns, rows]);

  /* ---- tabs -------------------------------------------------------------
     `tabsFrom="status"` builds the tab strip from one column: an All tab plus
     one per distinct value, each with a live count.

     Skipped past MAX_AUTO_TABS distinct values — twenty owner tabs would be
     unusable, and the Filter dropdown already handles a long list well. */
  const autoTabs = useMemo(() => {
    if (!tabsFrom || serverSide) return null;
    const col = allColumns.find((c) => c.key === tabsFrom);
    const read = col?.exportValue || ((row) => row[tabsFrom]);
    const counts = new Map();
    for (const row of rows) {
      const v = read(row);
      if (v === null || v === undefined || v === '') continue;
      const key = String(v);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    if (counts.size === 0 || counts.size > MAX_AUTO_TABS) return null;
    return [
      { id: ALL_TAB, label: 'All', count: rows.length },
      ...[...counts.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
        .map(([label, count]) => ({ id: label, label, count })),
    ];
  }, [tabsFrom, rows, allColumns, serverSide]);

  // Controlled tabs (Leads) win; otherwise the table drives its own.
  const effectiveTabs = tabs ?? autoTabs;
  const effectiveActiveTab = tabs ? activeTab : autoTab;
  const handleTabSelect = tabs ? onTabChange : setAutoTab;

  /* An auto tab narrows the rows before anything else, so filters, search and
     the counts in the footer all describe the tab you are looking at. */
  const tabScoped = useMemo(() => {
    if (tabs || !autoTabs || autoTab === ALL_TAB) return rows;
    const col = allColumns.find((c) => c.key === tabsFrom);
    const read = col?.exportValue || ((row) => row[tabsFrom]);
    return rows.filter((row) => String(read(row) ?? '') === String(autoTab));
  }, [rows, tabs, autoTabs, autoTab, tabsFrom, allColumns]);

  const activeFilterCount = useMemo(
    () => Object.values(filterValues).filter(Boolean).length,
    [filterValues]
  );

  const filtered = useMemo(() => {
    if (serverSide || activeFilterCount === 0) return tabScoped;
    return tabScoped.filter((row) =>
      Object.entries(filterValues).every(([key, value]) => {
        if (!value) return true;
        const field = filterFields.find((f) => f.key === key);
        const actual = field?.getValue ? field.getValue(row) : row[key];
        return String(actual ?? '') === String(value);
      })
    );
  }, [tabScoped, filterValues, activeFilterCount, filterFields, serverSide]);

  /* Search covers the whole record, not just the columns on screen: the
     column-derived text (so a formatted phone or a status pill is findable by
     what it displays) plus every scalar field on the row (so an email or a
     secondary source that has no column of its own is still findable).

     Indexed once per data change rather than per keystroke — filtering a few
     thousand rows on every character otherwise gets sluggish. */
  const searchIndex = useMemo(() => {
    if (serverSide) return null;
    const cols = allColumns.filter((c) => c.searchable !== false);
    const index = new Map();
    for (const row of rows) {
      const parts = [];
      for (const c of cols) {
        const v = c.exportValue ? c.exportValue(row) : row[c.key];
        if (v !== null && v !== undefined) parts.push(String(v));
      }
      for (const v of Object.values(row)) {
        // Skip nested objects and arrays (logs, relations) — they add noise
        // rather than anything a person would type into a search box.
        if (v === null || v === undefined || typeof v === 'object') continue;
        parts.push(String(v));
      }
      index.set(row, parts.join(' ').toLowerCase());
    }
    return index;
  }, [rows, allColumns, serverSide]);

  const searched = useMemo(() => {
    if (serverSide || !query.trim()) return filtered;
    // Every whitespace-separated term must match, so "ravi site" narrows
    // rather than widening the way a single blob match would.
    const terms = query.trim().toLowerCase().split(/\s+/);
    return filtered.filter((row) => {
      const text = searchIndex?.get(row) ?? '';
      return terms.every((t) => text.includes(t));
    });
  }, [filtered, query, searchIndex, serverSide]);

  /* ---- sort ------------------------------------------------------------- */
  const sorted = useMemo(() => {
    if (serverSide || !sort.key) return searched;
    const col = allColumns.find((c) => c.key === sort.key);
    const accessor = col?.sortValue || ((row) => row[sort.key]);
    // Copy first: sorting the prop array in place would mutate the caller's state.
    return [...searched].sort((a, b) => {
      const result = compareValues(accessor(a), accessor(b));
      return sort.dir === 'asc' ? result : -result;
    });
  }, [searched, sort, allColumns, serverSide]);

  /* ---- paginate --------------------------------------------------------- */
  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pageCount);
  const paged = useMemo(() => {
    if (serverSide) return sorted;
    const start = (currentPage - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, currentPage, pageSize, serverSide]);

  // A shrinking result set must not strand the viewer on a page that no
  // longer exists.
  useEffect(() => { setPage(1); }, [query, pageSize, filterValues, activeTab, autoTab]);

  // Leaving fullscreen with Escape is what people expect.
  useEffect(() => {
    if (!isFullscreen) return undefined;
    const onEsc = (e) => { if (e.key === 'Escape') setIsFullscreen(false); };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [isFullscreen]);

  /* ---- selection -------------------------------------------------------- */
  const pageIds = paged.map(getRowId);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someOnPageSelected = pageIds.some((id) => selected.has(id));

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const toggleRow = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const handleSort = (col) => {
    if (col.sortable === false) return;
    setSort((prev) =>
      prev.key === col.key
        ? { key: col.key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key: col.key, dir: 'asc' }
    );
  };

  /* ---- export ----------------------------------------------------------- */
  /* Export what the viewer is looking at: current tab, filters, search and
     sort, visible columns only. When rows are selected, export just those —
     otherwise "export" after selecting rows would quietly ignore the selection. */
  const exportRows = useMemo(() => (
    selected.size > 0 ? sorted.filter((r) => selected.has(getRowId(r))) : sorted
  ), [sorted, selected, getRowId]);

  const cellText = (col, row) => {
    const raw = col.exportValue ? col.exportValue(row) : row[col.key];
    return raw === null || raw === undefined ? '' : String(raw);
  };

  const exportCsv = () => {
    // Quote every field and double embedded quotes: the safe CSV escape.
    const esc = (text) => `"${text.replace(/"/g, '""')}"`;
    const header = [
      ...(rowNumbers ? [esc('SL.NO')] : []),
      ...visibleColumns.map((c) => esc(c.label)),
    ].join(',');
    const body = exportRows
      .map((row, i) => [
        ...(rowNumbers ? [esc(String(i + 1))] : []),
        ...visibleColumns.map((c) => esc(cellText(c, row))),
      ].join(','))
      .join('\n');
    // The BOM makes Excel read UTF-8 correctly instead of mangling accents.
    const blob = new Blob(['﻿' + header + '\n' + body], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${exportName || 'export'}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  /* jsPDF is loaded on demand so it stays out of the main bundle — most
     sessions never export. */
  const exportPdf = async () => {
    const { jsPDF, autoTable } = await loadPdfTools();
    const doc = new jsPDF({ orientation: visibleColumns.length > 5 ? 'landscape' : 'portrait' });
    doc.text(title || exportName || 'Export', 14, 15);
    autoTable(doc, {
      head: [[
        ...(rowNumbers ? ['SL.NO'] : []),
        ...visibleColumns.map((c) => c.label),
      ]],
      body: exportRows.map((row, i) => [
        ...(rowNumbers ? [String(i + 1)] : []),
        ...visibleColumns.map((c) => cellText(c, row)),
      ]),
      startY: 20,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [79, 70, 229] },
    });
    doc.save(`${exportName || 'export'}-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const colSpan = visibleColumns.length
    + (selectable ? 1 : 0)
    + (rowNumbers ? 1 : 0)
    + (actions ? 1 : 0);

  const hasSelection = selectable && selected.size > 0;
  const hideableColumns = allColumns.filter((c) => c.hideable !== false);
  const showToolbar = title || searchable || toolbar || exportName
    || filterFields.length > 0 || hideableColumns.length > 0 || fullscreenable
    || hasSelection;

  return (
    <section className={`nx-table-card nx-scope ${isFullscreen ? 'is-fullscreen' : ''}`}>
      {/* ---- Tabs -------------------------------------------------------- */}
      {effectiveTabs?.length > 0 && (
        <div className="nx-table__tabs" role="tablist">
          {effectiveTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={effectiveActiveTab === tab.id}
              className={`nx-table__tab ${effectiveActiveTab === tab.id ? 'is-active' : ''}`}
              onClick={() => handleTabSelect?.(tab.id)}
            >
              {tab.label}
              {typeof tab.count === 'number' && (
                <span className="nx-table__tab-count">{tab.count}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ---- Toolbar -------------------------------------------------------
           While rows are selected the left half swaps to the selection
           actions; Filter / Export / Columns / fullscreen stay put on the
           right so the controls never jump around under the cursor. */}
      {showToolbar && (
        <header className={`nx-table__toolbar ${hasSelection ? 'is-selecting' : ''}`}>
          {hasSelection ? (
            <div className="nx-table__selection">
              <span className="nx-table__selection-count">
                {selected.size} item{selected.size === 1 ? '' : 's'} selected
              </span>

              {/* Only the superadmin can delete. Gated here so no screen can
                  forget it; the API refuses it too, since a hidden button is
                  not a permission. */}
              {onDeleteSelected && canDelete() && (
                <Button
                  variant="danger-outline"
                  size="sm"
                  icon={Trash2}
                  onClick={() => onDeleteSelected([...selected], clearSelection)}
                >
                  Delete Selected
                </Button>
              )}

              {exportName && (
                <Button
                  variant="primary-outline"
                  size="sm"
                  icon={Download}
                  onClick={exportCsv}
                >
                  Export Selected
                </Button>
              )}

              {bulkActions?.([...selected], clearSelection)}

              <Button variant="ghost" size="sm" onClick={clearSelection}>Cancel</Button>
            </div>
          ) : (
            <div className="nx-table__toolbar-left">
              {title && <h2 className="nx-table__title">{title}</h2>}
              {searchable && (
                <SearchInput
                  className="nx-table__search"
                  placeholder={searchPlaceholder}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              )}
            </div>
          )}

          <div className="nx-table__toolbar-actions">

            {toolbar}

            {filterFields.length > 0 && (
              <Popover
                width={280}
                trigger={({ open, toggle, ref }) => (
                  <span ref={ref}>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={SlidersHorizontal}
                      onClick={toggle}
                      aria-expanded={open}
                    >
                      Filter
                      {activeFilterCount > 0 && (
                        <span className="nx-table__badge">{activeFilterCount}</span>
                      )}
                    </Button>
                  </span>
                )}
              >
                {({ close }) => (
                  <div className="nx-table__filter-panel">
                    {filterFields.map((field) => (
                      <label key={field.key} className="nx-table__filter-field">
                        <span>{field.label}</span>
                        <Select
                          // A filter, not a form field: picking one must not
                          // throw focus off to some unrelated input.
                          advanceOnPick={false}
                          value={filterValues[field.key] || ''}
                          onChange={(e) => setFilterValues((prev) => ({
                            ...prev, [field.key]: e.target.value,
                          }))}
                        >
                          <option value="">{field.placeholder || `All ${field.label}`}</option>
                          {field.options.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </Select>
                      </label>
                    ))}
                    <div className="nx-table__filter-actions">
                      <Button size="sm" onClick={() => setFilterValues({})}>Clear</Button>
                      <Button size="sm" variant="primary" onClick={close}>Apply</Button>
                    </div>
                  </div>
                )}
              </Popover>
            )}

            {exportName && (
              <Popover
                trigger={({ open, toggle, ref }) => (
                  <span ref={ref}>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={Download}
                      onClick={toggle}
                      disabled={exportRows.length === 0}
                      aria-expanded={open}
                    >
                      Export
                    </Button>
                  </span>
                )}
              >
                {({ close }) => (
                  <>
                    {selected.size > 0 && (
                      <p className="nx-popover__note">
                        Exporting {selected.size} selected row{selected.size === 1 ? '' : 's'}
                      </p>
                    )}
                    <button
                      type="button"
                      className="nx-popover__item"
                      onClick={() => { close(); exportCsv(); }}
                    >
                      Export as CSV
                    </button>
                    <button
                      type="button"
                      className="nx-popover__item"
                      onClick={() => { close(); exportPdf(); }}
                    >
                      Export as PDF
                    </button>
                  </>
                )}
              </Popover>
            )}

            {hideableColumns.length > 0 && (
              <Popover
                trigger={({ open, toggle, ref }) => (
                  <span ref={ref}>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={Columns3}
                      onClick={toggle}
                      aria-expanded={open}
                    >
                      Columns
                    </Button>
                  </span>
                )}
              >
                <>
                  {hideableColumns.map((c) => (
                    <label key={c.key} className="nx-popover__check">
                      <input
                        type="checkbox"
                        checked={!hidden.has(c.key)}
                        onChange={() => setHidden((prev) => {
                          const next = new Set(prev);
                          if (next.has(c.key)) next.delete(c.key); else next.add(c.key);
                          return next;
                        })}
                      />
                      <span>{c.label}</span>
                    </label>
                  ))}
                  <button
                    type="button"
                    className="nx-popover__item nx-popover__divider"
                    onClick={() => setHidden(new Set())}
                  >
                    <RotateCcw size={13} /> Show all columns
                  </button>
                </>
              </Popover>
            )}

            {fullscreenable && (
              <Button
                variant="secondary"
                size="sm"
                icon={isFullscreen ? Minimize2 : Maximize2}
                onClick={() => setIsFullscreen((f) => !f)}
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Expand table to fullscreen'}
              />
            )}
          </div>
        </header>
      )}

      {/* ---- Table ------------------------------------------------------- */}
      <div className="nx-table__scroll">
        <table className={`nx-table ${stickyHeader ? 'nx-table--sticky' : ''}`}>
          <thead>
            <tr>
              {selectable && (
                <th className="nx-table__cell--check" scope="col">
                  <input
                    type="checkbox"
                    aria-label="Select all rows on this page"
                    checked={allOnPageSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = !allOnPageSelected && someOnPageSelected;
                    }}
                    onChange={toggleAll}
                  />
                </th>
              )}
              {rowNumbers && <th className="nx-table__cell--num" scope="col">SL.NO</th>}
              {visibleColumns.map((col) => {
                const isSorted = sort.key === col.key;
                const sortable = col.sortable !== false;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    style={{ width: col.width, textAlign: col.align || 'left' }}
                    aria-sort={isSorted ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                    /* `description` explains a column whose values cannot
                       explain themselves — a bare countdown, a code, a score.
                       Optional, so every existing column is unchanged. */
                    title={col.description || undefined}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        className={`nx-table__sort ${isSorted ? 'is-active' : ''}`}
                        onClick={() => handleSort(col)}
                      >
                        <span>{col.label}</span>
                        {isSorted
                          ? (sort.dir === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />)
                          : <ChevronsUpDown size={13} className="nx-table__sort-idle" />}
                      </button>
                    ) : col.label}
                  </th>
                );
              })}
              {actions && <th scope="col" className="nx-table__cell--actions">Actions</th>}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              /* Skeleton rows keep the table's height stable while loading, so
                 the page doesn't jump when data arrives. */
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={`sk-${i}`} className="nx-table__row--skeleton">
                  {Array.from({ length: colSpan }).map((__, j) => (
                    <td key={j}><span className="nx-skeleton" /></td>
                  ))}
                </tr>
              ))
            ) : paged.length === 0 ? (
              <tr>
                <td colSpan={colSpan}>
                  <div className="nx-table__empty">
                    <Inbox size={30} aria-hidden="true" />
                    <p className="nx-table__empty-title">
                      {query ? `No results for "${query}"` : emptyMessage}
                    </p>
                    {(query || activeFilterCount > 0 || emptyHint) && (
                      <p className="nx-table__empty-hint">
                        {query || activeFilterCount > 0
                          ? 'Try a different search term or clear the filters.'
                          : emptyHint}
                      </p>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              paged.map((row, i) => {
                const id = getRowId(row, i);
                const isSelected = selected.has(id);
                return (
                  <tr
                    key={id}
                    className={[
                      'nx-table__row',
                      isSelected ? 'is-selected' : '',
                      onRowClick ? 'is-clickable' : '',
                    ].filter(Boolean).join(' ')}
                    /* Its place in the run, for the entrance stagger. Capped
                       so page 1 of 500 rows does not end with a row waiting
                       four seconds to appear — after the first dozen the
                       delay stops growing and they arrive together. */
                    style={{ '--nx-row': Math.min(i, 12) }}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {selectable && (
                      <td className="nx-table__cell--check" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRow(id)}
                          aria-label={`Select row ${i + 1}`}
                        />
                      </td>
                    )}
                    {rowNumbers && (
                      <td className="nx-table__cell--num">
                        {(currentPage - 1) * pageSize + i + 1}
                      </td>
                    )}
                    {visibleColumns.map((col) => (
                      <td key={col.key} style={{ textAlign: col.align || 'left' }}>
                        {col.render ? col.render(row) : (row[col.key] ?? '—')}
                      </td>
                    ))}
                    {actions && (
                      <td className="nx-table__cell--actions" onClick={(e) => e.stopPropagation()}>
                        {actions(row)}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ---- Pagination -------------------------------------------------- */}
      {!loading && total > 0 && (
        <footer className="nx-table__footer">
          <div className="nx-table__page-size">
            <span>Rows</span>
            <Select
              advanceOnPick={false}
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              aria-label="Rows per page"
            >
              {pageSizeOptions.map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>
          </div>

          <span className="nx-table__range">
            {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, total)} of {total}
          </span>

          <div className="nx-table__pager">
            <Button variant="ghost" size="sm" icon={ChevronsLeft} aria-label="First page"
              disabled={currentPage === 1} onClick={() => setPage(1)} />
            <Button variant="ghost" size="sm" icon={ChevronLeft} aria-label="Previous page"
              disabled={currentPage === 1} onClick={() => setPage((p) => Math.max(1, p - 1))} />
            <span className="nx-table__page-label">{currentPage} / {pageCount}</span>
            <Button variant="ghost" size="sm" icon={ChevronRight} aria-label="Next page"
              disabled={currentPage === pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))} />
            <Button variant="ghost" size="sm" icon={ChevronsRight} aria-label="Last page"
              disabled={currentPage === pageCount} onClick={() => setPage(pageCount)} />
          </div>
        </footer>
      )}
    </section>
  );
}
