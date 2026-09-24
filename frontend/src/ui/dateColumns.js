/**
 * Shared Created / Updated columns, so every table formats timestamps the same
 * way instead of each screen inventing its own.
 *
 * Created shows the date alone — the day something arrived is what people scan
 * for. Updated shows date *and* time, because "was this touched before or after
 * that call an hour ago" is the question it usually has to answer.
 */

export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${date}, ${time}`;
}

/* Sorting needs no sortValue: the raw ISO string is what the table sorts on,
   and DataTable's comparator parses dates chronologically. */

export const createdColumn = {
  key: 'createdAt',
  label: 'Created',
  width: '150px',
  render: (row) => formatDate(row.createdAt),
  exportValue: (row) => formatDate(row.createdAt),
};

export const updatedColumn = {
  key: 'updatedAt',
  label: 'Updated',
  width: '175px',
  render: (row) => formatDateTime(row.updatedAt),
  exportValue: (row) => formatDateTime(row.updatedAt),
};
