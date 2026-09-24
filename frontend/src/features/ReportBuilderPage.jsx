import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, FileDown, Play, Plus, Save, Trash2, X } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  Button, Checkbox, DataTable, Field, FormGrid, Input, Modal, Page, Select, Switch, toast,
} from '../ui';
import loadPdfTools from '../utils/loadPdfTools';
import { api, fmtDate } from './api';
import './features.css';

/**
 * Report builder (Managers and above): choose what to report on, the columns,
 * filters and date range; optionally group and count / add up. Save it, export
 * it (CSV / PDF) or have it emailed on a schedule.
 */

const OPS = {
  string: [['eq', 'is'], ['neq', 'is not'], ['contains', 'contains'], ['in', 'is one of (comma-separated)'], ['empty', 'is empty'], ['notEmpty', 'is not empty']],
  number: [['eq', '='], ['gte', '≥'], ['lte', '≤'], ['empty', 'is empty'], ['notEmpty', 'is not empty']],
  date: [['gte', 'on or after'], ['lte', 'on or before'], ['empty', 'is empty'], ['notEmpty', 'is not empty']],
};
const NO_VALUE = ['empty', 'notEmpty'];

const blank = (entity) => ({
  entity: entity?.key || 'leads',
  columns: entity ? entity.fields.slice(0, 6).map((f) => f.key) : [],
  filters: [],
  dateField: entity?.defaultDate || '',
  dateFrom: '',
  dateTo: '',
  groupBy: '',
  metric: { op: 'count', field: '' },
});

const fmtCell = (col, v) => {
  if (v == null || v === '') return '—';
  if (col.type === 'number') return Number(v).toLocaleString('en-IN');
  if (col.type === 'date' || /^\d{4}-\d{2}-\d{2}T/.test(String(v))) return fmtDate(v);
  return String(v);
};

export default function ReportBuilderPage() {
  const [schema, setSchema] = useState([]);
  const [config, setConfig] = useState(blank(null));
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [saved, setSaved] = useState([]);
  const [current, setCurrent] = useState(null); // the saved report being edited
  const [saving, setSaving] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  const loadSaved = useCallback(() => api('/api/report-builder/saved').then(setSaved).catch(() => {}), []);
  useEffect(() => {
    api('/api/report-builder/schema').then((s) => { setSchema(s); setConfig(blank(s[0])); }).catch((e) => toast.error(e.message));
    loadSaved();
  }, [loadSaved]);

  const entity = useMemo(() => schema.find((e) => e.key === config.entity), [schema, config.entity]);
  const fields = entity?.fields || [];
  const fieldOf = (k) => fields.find((f) => f.key === k);
  const set = (patch) => setConfig((c) => ({ ...c, ...patch }));

  const run = async (cfg = config) => {
    setRunning(true);
    try { setResult(await api('/api/report-builder/run', { method: 'POST', body: { config: cfg } })); } catch (e) { toast.error(e.message); } finally { setRunning(false); }
  };

  const open = (report) => { setCurrent(report); setConfig({ ...blank(schema.find((e) => e.key === report.config.entity)), ...report.config }); run(report.config); };

  const exportCsv = () => {
    const cols = result.columns;
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [cols.map((c) => esc(c.label)).join(','), ...result.rows.map((r) => cols.map((c) => esc(fmtCell(c, r[c.key]))).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `${current?.name || 'report'}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };

  const exportPdf = async () => {
    try {
      const { jsPDF, autoTable } = await loadPdfTools();
      const doc = new jsPDF({ orientation: result.columns.length > 5 ? 'landscape' : 'portrait' });
      doc.setFontSize(14); doc.text(current?.name || `${entity?.label} report`, 14, 16);
      doc.setFontSize(9); doc.text(`Generated ${new Date().toLocaleString('en-GB')} · ${result.rows.length} rows`, 14, 22);
      autoTable(doc, {
        startY: 27,
        head: [result.columns.map((c) => c.label)],
        body: result.rows.map((r) => result.columns.map((c) => fmtCell(c, r[c.key]))),
        styles: { fontSize: 8 },
      });
      doc.save(`${current?.name || 'report'}.pdf`);
    } catch (e) { toast.error(e.message); }
  };

  const tableColumns = useMemo(() => (result ? result.columns.map((c) => ({
    key: c.key, label: c.label, align: c.type === 'number' ? 'right' : undefined,
    render: (r) => fmtCell(c, r[c.key]),
    sortValue: (r) => (c.type === 'number' ? Number(r[c.key] || 0) : String(r[c.key] ?? '')),
    exportValue: (r) => fmtCell(c, r[c.key]),
  })) : []), [result]);

  return (
    <Page
      title="Report Builder"
      subtitle="Build your own reports on leads, opportunities, bookings, payments, site visits and calls."
      actions={<Button icon={Plus} onClick={() => { setCurrent(null); setConfig(blank(entity || schema[0])); setResult(null); }}>New report</Button>}
    >
      <div className="nx-scope">
        {saved.length > 0 && (
          <div className="fx-row" style={{ marginBottom: 'var(--nx-space-4)' }}>
            <span className="fx-muted">Saved:</span>
            {saved.map((r) => (
              <Button key={r.id} size="sm" variant={current?.id === r.id ? 'primary' : 'secondary'} onClick={() => open(r)}>{r.name}</Button>
            ))}
          </div>
        )}

        <div className="fx-card">
          <FormGrid columns={3}>
            <Field label="Report on">
              <Select value={config.entity} advanceOnPick={false} options={schema.map((e) => ({ value: e.key, label: e.label }))}
                onChange={(e) => { const next = schema.find((s) => s.key === e.target.value); setConfig(blank(next)); setResult(null); }} />
            </Field>
            <Field label="Date field">
              <Select value={config.dateField} advanceOnPick={false} options={fields.filter((f) => f.type === 'date').map((f) => ({ value: f.key, label: f.label }))} onChange={(e) => set({ dateField: e.target.value })} />
            </Field>
            <div className="fx-row">
              <Field label="From"><Input type="date" value={config.dateFrom} onChange={(e) => set({ dateFrom: e.target.value })} /></Field>
              <Field label="To"><Input type="date" value={config.dateTo} onChange={(e) => set({ dateTo: e.target.value })} /></Field>
            </div>
          </FormGrid>

          <h3 className="fx-card__title" style={{ marginTop: 'var(--nx-space-4)' }}>Filters</h3>
          {config.filters.map((flt, i) => {
            const field = fieldOf(flt.field) || fields[0];
            return (
              // eslint-disable-next-line react/no-array-index-key
              <div key={i} className="fx-row" style={{ marginBottom: 'var(--nx-space-2)' }}>
                <Select value={flt.field} advanceOnPick={false} aria-label="Field" options={fields.map((f) => ({ value: f.key, label: f.label }))}
                  onChange={(e) => set({ filters: config.filters.map((x, j) => (j === i ? { ...x, field: e.target.value, op: OPS[fieldOf(e.target.value)?.type || 'string'][0][0], value: '' } : x)) })} />
                <Select value={flt.op} advanceOnPick={false} aria-label="Condition" options={(OPS[field?.type] || OPS.string).map(([v, l]) => ({ value: v, label: l }))}
                  onChange={(e) => set({ filters: config.filters.map((x, j) => (j === i ? { ...x, op: e.target.value } : x)) })} />
                {!NO_VALUE.includes(flt.op) && (
                  <Input type={field?.type === 'date' ? 'date' : field?.type === 'number' ? 'number' : 'text'} value={flt.value} aria-label="Value"
                    onChange={(e) => set({ filters: config.filters.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} />
                )}
                <Button variant="ghost" size="sm" icon={X} aria-label="Remove filter" onClick={() => set({ filters: config.filters.filter((_, j) => j !== i) })} />
              </div>
            );
          })}
          <Button size="sm" icon={Plus} onClick={() => fields[0] && set({ filters: [...config.filters, { field: fields[0].key, op: OPS[fields[0].type][0][0], value: '' }] })}>Add filter</Button>

          <FormGrid columns={3}>
            <Field label="Group by">
              <Select value={config.groupBy} advanceOnPick={false}
                options={[{ value: '', label: 'No grouping (list rows)' }, ...fields.filter((f) => f.groupable).map((f) => ({ value: f.key, label: f.label }))]}
                onChange={(e) => set({ groupBy: e.target.value })} />
            </Field>
            {config.groupBy && (
              <Field label="Add up">
                <Select value={config.metric?.field || ''} advanceOnPick={false}
                  options={[{ value: '', label: 'Count only' }, ...fields.filter((f) => f.summable).map((f) => ({ value: f.key, label: f.label }))]}
                  onChange={(e) => set({ metric: { op: e.target.value ? 'sum' : 'count', field: e.target.value } })} />
              </Field>
            )}
          </FormGrid>

          {!config.groupBy && (
            <>
              <h3 className="fx-card__title" style={{ marginTop: 'var(--nx-space-4)' }}>Columns</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 'var(--nx-space-1)' }}>
                {fields.map((f) => (
                  <Checkbox key={f.key} label={f.label} checked={config.columns.includes(f.key)}
                    onChange={(e) => set({ columns: e.target.checked ? [...config.columns, f.key] : config.columns.filter((k) => k !== f.key) })} />
                ))}
              </div>
            </>
          )}

          <div className="fx-card__actions">
            <Button variant="primary" icon={Play} loading={running} onClick={() => run()}>Run report</Button>
            <Button icon={Save} onClick={() => setSaving(true)}>{current ? 'Save changes' : 'Save report'}</Button>
            {current && (
              <>
                <Button icon={CalendarClock} onClick={() => setScheduling(true)}>Email on a schedule</Button>
                <Button variant="danger" icon={Trash2} onClick={async () => {
                  if (!await window.appConfirm(`Delete "${current.name}"? Its email schedules stop too.`)) return;
                  try { await api(`/api/report-builder/saved/${current.id}`, { method: 'DELETE' }); setCurrent(null); loadSaved(); toast.success('Deleted.'); } catch (e) { toast.error(e.message); }
                }}>Delete</Button>
              </>
            )}
          </div>
        </div>

        {result && (
          <>
            <div className="fx-row" style={{ margin: 'var(--nx-space-2) 0' }}>
              <span className="fx-muted fx-grow">{result.rows.length} {result.grouped ? 'groups' : 'rows'}</span>
              <Button size="sm" icon={FileDown} onClick={exportCsv}>CSV</Button>
              <Button size="sm" icon={FileDown} onClick={exportPdf}>PDF</Button>
            </div>
            {result.grouped && result.rows.length > 0 && (
              <div className="fx-card" style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={result.rows.slice(0, 20)} margin={{ top: 8, right: 16, bottom: 40, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--nx-border)" />
                    <XAxis dataKey="group" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={Boolean(config.metric?.field)} />
                    <Tooltip />
                    <Bar dataKey={config.metric?.field ? 'sum' : 'count'} fill="var(--nx-accent)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            <DataTable
              columns={tableColumns}
              rows={result.rows.map((r, i) => ({ id: i, ...r }))}
              selectable={false}
              timestamps={false}
              searchable
              emptyMessage="Nothing matches this report."
            />
          </>
        )}
      </div>

      {saving && (
        <SaveModal
          current={current}
          onClose={() => setSaving(false)}
          onSave={async ({ name, shared }) => {
            try {
              const body = { name, shared, config };
              const r = current
                ? await api(`/api/report-builder/saved/${current.id}`, { method: 'PUT', body })
                : await api('/api/report-builder/saved', { method: 'POST', body });
              setCurrent(r); setSaving(false); loadSaved(); toast.success('Report saved.');
            } catch (e) { toast.error(e.message); }
          }}
        />
      )}
      {scheduling && current && <ScheduleModal report={current} onClose={() => setScheduling(false)} />}
    </Page>
  );
}

function SaveModal({ current, onClose, onSave }) {
  const [name, setName] = useState(current?.name || '');
  const [shared, setShared] = useState(current ? current.shared : true);
  return (
    <Modal open onClose={onClose} title={current ? 'Save changes' : 'Save report'}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="save-report">Save</Button></>}>
      <form id="save-report" onSubmit={(e) => { e.preventDefault(); onSave({ name, shared }); }}>
        <Field label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} data-autofocus /></Field>
        <Switch label="Visible to other managers" checked={shared} onChange={(e) => setShared(e.target.checked)} />
      </form>
    </Modal>
  );
}

function ScheduleModal({ report, onClose }) {
  const [frequency, setFrequency] = useState('weekly');
  const [recipients, setRecipients] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title={`Email "${report.name}"`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="schedule-report" loading={busy}>Schedule</Button></>}>
      <form id="schedule-report" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true);
        try {
          await api('/api/integrations/reports', { method: 'POST', body: { name: report.name, type: 'custom', savedReportId: report.id, frequency, recipients } });
          toast.success('Scheduled. Manage it under Settings → Integrations → Scheduled reports.'); onClose();
        } catch (err) { toast.error(err.message); } finally { setBusy(false); }
      }}>
        <Field label="Every"><Select value={frequency} onChange={(e) => setFrequency(e.target.value)} advanceOnPick={false} options={[{ value: 'daily', label: 'Day' }, { value: 'weekly', label: 'Week' }, { value: 'monthly', label: 'Month' }]} /></Field>
        <Field label="Send to" required hint="Email addresses, separated by commas."><Input value={recipients} onChange={(e) => setRecipients(e.target.value)} data-autofocus /></Field>
        <p className="fx-muted">Each email covers the period since the last one, on the report's date field. Scheduling needs an administrator.</p>
      </form>
    </Modal>
  );
}
