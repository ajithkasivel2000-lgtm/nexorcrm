import { useCallback, useEffect, useState } from 'react';
import { Copy, Plus, RefreshCw, Send, Trash2 } from 'lucide-react';
import {
  Button, DataTable, Field, FormGrid, Input, Modal, Page, Pill, Select, Switch, toast,
} from '../ui';
import { api, copyText, fmtDate, readAsDataUrl } from './api';
import './features.css';

/**
 * Settings → Integrations (administrators): the company's public key and lead
 * form URLs, WhatsApp, Exotel calling, Facebook/Google lead sources, scheduled
 * reports and the outgoing email log.
 */

const TABS = [
  ['company', 'Company & lead forms'],
  ['whatsapp', 'WhatsApp'],
  ['calling', 'Calling (Exotel)'],
  ['sources', 'Facebook & Google leads'],
  ['reports', 'Scheduled reports'],
  ['email', 'Email log'],
];

export default function IntegrationsPage() {
  const [tab, setTab] = useState('company');
  return (
    <Page title="Integrations" subtitle="Connect WhatsApp, calling, ad platforms and reports to this company's CRM.">
      <div className="nx-scope">
        <div className="fx-tabs" role="tablist">
          {TABS.map(([key, label]) => (
            <button key={key} type="button" role="tab" className="fx-tab" aria-selected={tab === key} onClick={() => setTab(key)}>{label}</button>
          ))}
        </div>
        {tab === 'company' && <CompanyTab />}
        {tab === 'whatsapp' && <WhatsAppTab />}
        {tab === 'calling' && <ExotelTab />}
        {tab === 'sources' && <SourcesTab />}
        {tab === 'reports' && <ReportsTab />}
        {tab === 'email' && <EmailLogTab />}
      </div>
    </Page>
  );
}

function CopyLine({ value }) {
  return (
    <div className="fx-copy">
      <code>{value}</code>
      <Button variant="ghost" size="sm" icon={Copy} aria-label="Copy" type="button"
        onClick={async () => (await copyText(value) ? toast.success('Copied.') : toast.error('Copy failed.'))} />
    </div>
  );
}

/* ------------------------------------------------------------- company --- */

function CompanyTab() {
  const [company, setCompany] = useState(null);
  const load = useCallback(() => api('/api/company').then(setCompany).catch((e) => toast.error(e.message)), []);
  useEffect(() => { load(); }, [load]);
  if (!company) return <p className="fx-muted">Loading…</p>;
  const e = company.endpoints;
  return (
    <>
      <div className="fx-card">
        <h3 className="fx-card__title">{company.name}</h3>
        <p className="fx-card__hint">Your company key identifies this CRM to website forms and ad tools. It is safe to put in a website; it only lets someone submit a lead.</p>
        <Field label="Company key"><CopyLine value={company.publicKey} /></Field>
        <div className="fx-card__actions">
          <Button icon={RefreshCw} onClick={async () => {
            if (!await window.appConfirm('Make a new key? Every website form using the old key stops working until it is updated.')) return;
            try { await api('/api/company/rotate-key', { method: 'POST' }); await load(); toast.success('New key issued.'); } catch (err) { toast.error(err.message); }
          }}>Issue a new key</Button>
        </div>
      </div>
      <BrandingCard slugLink={e.signup} />
      <div className="fx-card">
        <h3 className="fx-card__title">Website form</h3>
        <p className="fx-card__hint">POST JSON with <code>name</code>, <code>mobile</code> and optionally <code>email</code>, <code>project</code>, <code>message</code>, sending the key in the <code>X-Company-Key</code> header.</p>
        <CopyLine value={e.websiteLeads} />
        <h3 className="fx-card__title" style={{ marginTop: 'var(--nx-space-4)' }}>Campaign link (GET)</h3>
        <p className="fx-card__hint">For tools that can only call a URL. Fill in name, mobile and optionally email, project, source, campaign.</p>
        <CopyLine value={e.campaignLeads} />
        <h3 className="fx-card__title" style={{ marginTop: 'var(--nx-space-4)' }}>Staff sign-up link</h3>
        <p className="fx-card__hint">Registration settings decide whether sign-ups need approval.</p>
        <CopyLine value={e.signup} />
      </div>
    </>
  );
}

/* ------------------------------------------------------------ WhatsApp --- */

function useSettings(path) {
  const [data, setData] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { api(path).then(setData).catch((e) => toast.error(e.message)); }, [path]);
  const save = async (patch) => {
    setSaving(true);
    try { setData(await api(path, { method: 'PUT', body: patch })); toast.success('Saved.'); } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  };
  return [data, setData, save, saving];
}

function WhatsAppTab() {
  const [s, setS, save, saving] = useSettings('/api/integrations/whatsapp');
  const [company, setCompany] = useState(null);
  useEffect(() => { api('/api/company').then(setCompany).catch(() => {}); }, []);
  if (!s) return <p className="fx-muted">Loading…</p>;
  const set = (k) => (e) => setS((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  return (
    <form className="fx-card" onSubmit={(e) => { e.preventDefault(); save({ enabled: s.enabled, phoneNumberId: s.phoneNumberId, businessId: s.businessId, accessToken: s.accessToken, appSecret: s.appSecret }); }}>
      <h3 className="fx-card__title">WhatsApp Business (Meta Cloud API)</h3>
      <p className="fx-card__hint">
        From <strong>Meta for Developers → your app → WhatsApp → API Setup</strong>: the phone number ID and a permanent (system-user) access token.
        The app secret is under <strong>App settings → Basic</strong> and is used to check that webhooks really come from Meta.
      </p>
      <Switch label="WhatsApp enabled" checked={Boolean(s.enabled)} onChange={set('enabled')} />
      <FormGrid columns={2}>
        <Field label="Phone number ID" required><Input value={s.phoneNumberId} onChange={set('phoneNumberId')} /></Field>
        <Field label="WhatsApp Business account ID"><Input value={s.businessId} onChange={set('businessId')} /></Field>
        <Field label="Access token" hint={s.accessTokenSet ? 'Saved. Leave blank to keep it.' : undefined}><Input type="password" value={s.accessToken} onChange={set('accessToken')} autoComplete="off" /></Field>
        <Field label="App secret" hint={s.appSecretSet ? 'Saved. Leave blank to keep it.' : undefined}><Input type="password" value={s.appSecret} onChange={set('appSecret')} autoComplete="off" /></Field>
      </FormGrid>
      {company && (
        <>
          <h3 className="fx-card__title" style={{ marginTop: 'var(--nx-space-4)' }}>Webhook (Meta → WhatsApp → Configuration)</h3>
          <Field label="Callback URL"><CopyLine value={company.endpoints.metaWebhook} /></Field>
          <Field label="Verify token"><CopyLine value={s.verifyToken || 'Save once to generate'} /></Field>
          <p className="fx-card__hint">Subscribe to the <code>messages</code> field so replies from customers land on the lead.</p>
        </>
      )}
      <div className="fx-card__actions">
        <Button variant="primary" type="submit" loading={saving}>Save</Button>
        <Button type="button" onClick={async () => {
          try { const r = await api('/api/integrations/whatsapp/test', { method: 'POST' }); toast.success(r.message); } catch (e) { toast.error(e.message); }
        }}>Test connection</Button>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------- Exotel --- */

function ExotelTab() {
  const [s, setS, save, saving] = useSettings('/api/integrations/exotel');
  if (!s) return <p className="fx-muted">Loading…</p>;
  const set = (k) => (e) => setS((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  return (
    <form className="fx-card" onSubmit={(e) => { e.preventDefault(); save({ enabled: s.enabled, accountSid: s.accountSid, apiKey: s.apiKey, apiToken: s.apiToken, subdomain: s.subdomain, callerId: s.callerId }); }}>
      <h3 className="fx-card__title">Click-to-call with Exotel</h3>
      <p className="fx-card__hint">
        The Call button on a lead rings the salesperson's own mobile (from their profile), then connects the lead from your ExoPhone.
        Calls are recorded and logged on the lead. Find these under <strong>Exotel → Settings → API</strong>.
      </p>
      <Switch label="Calling enabled" checked={Boolean(s.enabled)} onChange={set('enabled')} />
      <FormGrid columns={2}>
        <Field label="Account SID" required><Input value={s.accountSid} onChange={set('accountSid')} /></Field>
        <Field label="API key" required><Input value={s.apiKey} onChange={set('apiKey')} /></Field>
        <Field label="API token" hint={s.apiTokenSet ? 'Saved. Leave blank to keep it.' : undefined}><Input type="password" value={s.apiToken} onChange={set('apiToken')} autoComplete="off" /></Field>
        <Field label="API subdomain" hint="api.exotel.com (Singapore) or api.in.exotel.com (Mumbai)"><Input value={s.subdomain} onChange={set('subdomain')} /></Field>
        <Field label="ExoPhone (caller ID)" required><Input value={s.callerId} onChange={set('callerId')} placeholder="080xxxxxxxx" /></Field>
      </FormGrid>
      <div className="fx-card__actions"><Button variant="primary" type="submit" loading={saving}>Save</Button></div>
    </form>
  );
}

/* ------------------------------------------------------- lead sources ---- */

function SourcesTab() {
  const [rows, setRows] = useState(null);
  const [company, setCompany] = useState(null);
  const [adding, setAdding] = useState(null);
  const load = useCallback(() => api('/api/integrations/lead-sources').then(setRows).catch((e) => toast.error(e.message)), []);
  useEffect(() => { load(); api('/api/company').then(setCompany).catch(() => {}); }, [load]);

  const columns = [
    { key: 'name', label: 'Name', render: (r) => <span className="nx-page__strong">{r.name}</span> },
    { key: 'provider', label: 'Source', render: (r) => (r.provider === 'facebook' ? 'Facebook / Instagram Lead Ads' : 'Google Ads lead form') },
    { key: 'enabled', label: 'State', render: (r) => (r.enabled ? <Pill tone="success" dot>On</Pill> : <Pill>Off</Pill>) },
    { key: 'leadsReceived', label: 'Leads', align: 'right' },
    { key: 'lastLeadAt', label: 'Last lead', render: (r) => fmtDate(r.lastLeadAt) },
    { key: 'lastError', label: 'Last error', render: (r) => (r.lastError ? <span className="fx-error">{r.lastError}</span> : '—') },
  ];

  return (
    <>
      <div className="fx-card">
        <h3 className="fx-card__title">Automatic lead capture</h3>
        <p className="fx-card__hint">
          Leads from these sources are created instantly, assigned by the project's rota, checked for duplicates and put on the follow-up clock,
          exactly like website leads.
        </p>
        <div className="fx-row">
          <Button variant="primary" icon={Plus} onClick={() => setAdding('facebook')}>Facebook / Instagram</Button>
          <Button icon={Plus} onClick={() => setAdding('google')}>Google Ads lead form</Button>
        </div>
      </div>
      <DataTable
        columns={columns}
        rows={rows || []}
        loading={!rows}
        selectable={false}
        timestamps={false}
        emptyMessage="No lead sources connected yet."
        actions={(r) => (
          <div className="nx-page__row-actions">
            <Button size="sm" variant="ghost" onClick={async () => {
              try { await api(`/api/integrations/lead-sources/${r.id}`, { method: 'PUT', body: { enabled: !r.enabled } }); load(); } catch (e) { toast.error(e.message); }
            }}>{r.enabled ? 'Turn off' : 'Turn on'}</Button>
            <Button size="sm" variant="ghost" icon={Trash2} aria-label="Remove" onClick={async () => {
              if (!await window.appConfirm(`Remove ${r.name}? Leads already captured stay.`)) return;
              try { await api(`/api/integrations/lead-sources/${r.id}`, { method: 'DELETE' }); load(); } catch (e) { toast.error(e.message); }
            }} />
          </div>
        )}
      />
      {rows?.filter((r) => r.provider === 'google').map((r) => (
        <div key={r.id} className="fx-card">
          <h3 className="fx-card__title">{r.name}: Google Ads webhook</h3>
          <p className="fx-card__hint">In Google Ads, open the lead form → <strong>Lead delivery → Webhook integration</strong>, paste this URL and this key.</p>
          <Field label="Webhook URL"><CopyLine value={company ? company.endpoints.googleLeadFormWebhook.replace('<integration key>', r.webhookKey) : ''} /></Field>
          <Field label="Key"><CopyLine value={r.webhookKey} /></Field>
        </div>
      ))}
      {company && rows?.some((r) => r.provider === 'facebook') && (
        <div className="fx-card">
          <h3 className="fx-card__title">Facebook webhook</h3>
          <p className="fx-card__hint">In your Meta app, subscribe the <strong>Page</strong> object's <code>leadgen</code> field to this callback URL, using the verify token from the WhatsApp tab (or the platform's META_VERIFY_TOKEN).</p>
          <CopyLine value={company.endpoints.metaWebhook} />
        </div>
      )}
      {adding && <NewSourceModal provider={adding} onClose={() => setAdding(null)} onSaved={() => { setAdding(null); load(); }} />}
    </>
  );
}

function NewSourceModal({ provider, onClose, onSaved }) {
  const [form, setForm] = useState({ name: provider === 'facebook' ? 'Facebook Lead Ads' : 'Google Ads', pageId: '', pageAccessToken: '', project: '', primarySource: 'Digital Marketing' });
  const [projects, setProjects] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { api('/api/projects').then(setProjects).catch(() => {}); }, []);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <Modal open onClose={onClose} title={provider === 'facebook' ? 'Connect a Facebook page' : 'Add a Google Ads lead form'}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="new-source" loading={saving}>Connect</Button></>}>
      <form id="new-source" onSubmit={async (e) => {
        e.preventDefault(); setSaving(true); setError('');
        try { await api('/api/integrations/lead-sources', { method: 'POST', body: { ...form, provider } }); toast.success('Connected.'); onSaved(); } catch (err) { setError(err.message); } finally { setSaving(false); }
      }}>
        <Field label="Name" required><Input value={form.name} onChange={set('name')} data-autofocus /></Field>
        {provider === 'facebook' && (
          <>
            <Field label="Facebook page ID" required><Input value={form.pageId} onChange={set('pageId')} /></Field>
            <Field label="Page access token" required hint="A long-lived page token with leads_retrieval permission."><Input type="password" value={form.pageAccessToken} onChange={set('pageAccessToken')} autoComplete="off" /></Field>
          </>
        )}
        <Field label="Project for these leads" hint="Decides which rota assigns them. Leave empty for General.">
          <Select value={form.project} onChange={set('project')} placeholder="General" options={[{ value: '', label: 'General' }, ...projects.map((p) => ({ value: p.projectName, label: p.projectName }))]} />
        </Field>
        <Field label="Primary source"><Input value={form.primarySource} onChange={set('primarySource')} /></Field>
        {error && <p className="fx-error" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}

/* -------------------------------------------------------------- reports --- */

function ReportsTab() {
  const [rows, setRows] = useState(null);
  const [editing, setEditing] = useState(null);
  const load = useCallback(() => api('/api/integrations/reports').then(setRows).catch((e) => toast.error(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const columns = [
    { key: 'name', label: 'Report', render: (r) => <span className="nx-page__strong">{r.name}</span> },
    { key: 'type', label: 'Type', render: (r) => ({ pipeline: 'Pipeline', collections: 'Collections', activity: 'Team activity', custom: 'Custom (Report Builder)' }[r.type] || r.type) },
    { key: 'frequency', label: 'Every', render: (r) => ({ daily: 'Day', weekly: 'Week', monthly: 'Month' }[r.frequency]) },
    { key: 'recipients', label: 'To', render: (r) => r.recipients.join(', ') },
    { key: 'nextRunAt', label: 'Next', render: (r) => (r.enabled ? fmtDate(r.nextRunAt) : 'Paused') },
    { key: 'lastSentAt', label: 'Last sent', render: (r) => fmtDate(r.lastSentAt) },
  ];
  return (
    <>
      <div className="fx-card">
        <h3 className="fx-card__title">Reports by email</h3>
        <p className="fx-card__hint">Sent at 7am on the chosen schedule through your Mail Settings: new leads, visits and bookings (pipeline), dues and receipts (collections), or who did what (activity).</p>
        <Button variant="primary" icon={Plus} onClick={() => setEditing({ name: 'Weekly pipeline', type: 'pipeline', frequency: 'weekly', recipients: '', enabled: true })}>New scheduled report</Button>
      </div>
      <DataTable
        columns={columns}
        rows={rows || []}
        loading={!rows}
        selectable={false}
        timestamps={false}
        emptyMessage="No scheduled reports."
        onRowClick={(r) => setEditing({ ...r, recipients: r.recipients.join(', ') })}
        actions={(r) => (
          <div className="nx-page__row-actions">
            <Button size="sm" variant="ghost" icon={Send} aria-label="Send now" onClick={async (e) => {
              e.stopPropagation();
              try { const x = await api(`/api/integrations/reports/${r.id}/send`, { method: 'POST' }); toast.success(x.message); } catch (err) { toast.error(err.message); }
            }} />
            <Button size="sm" variant="ghost" icon={Trash2} aria-label="Delete" onClick={async (e) => {
              e.stopPropagation();
              if (!await window.appConfirm(`Delete "${r.name}"?`)) return;
              try { await api(`/api/integrations/reports/${r.id}`, { method: 'DELETE' }); load(); } catch (err) { toast.error(err.message); }
            }} />
          </div>
        )}
      />
      {editing && (
        <ReportModal report={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </>
  );
}

function ReportModal({ report, onClose, onSaved }) {
  const [form, setForm] = useState(report);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  return (
    <Modal open onClose={onClose} title={report.id ? 'Edit report' : 'New scheduled report'}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="report-form" loading={saving}>Save</Button></>}>
      <form id="report-form" onSubmit={async (e) => {
        e.preventDefault(); setSaving(true); setError('');
        const body = { name: form.name, type: form.type, frequency: form.frequency, recipients: form.recipients, enabled: form.enabled };
        try {
          await api(report.id ? `/api/integrations/reports/${report.id}` : '/api/integrations/reports', { method: report.id ? 'PUT' : 'POST', body });
          onSaved();
        } catch (err) { setError(err.message); } finally { setSaving(false); }
      }}>
        <Field label="Name" required><Input value={form.name} onChange={set('name')} data-autofocus /></Field>
        <FormGrid columns={2}>
          <Field label="Report"><Select value={form.type} onChange={set('type')} advanceOnPick={false} options={[{ value: 'pipeline', label: 'Pipeline' }, { value: 'collections', label: 'Collections' }, { value: 'activity', label: 'Team activity' }, ...(form.type === 'custom' ? [{ value: 'custom', label: 'Custom (Report Builder)' }] : [])]} disabled={form.type === 'custom'} /></Field>
          <Field label="Every"><Select value={form.frequency} onChange={set('frequency')} advanceOnPick={false} options={[{ value: 'daily', label: 'Day' }, { value: 'weekly', label: 'Week' }, { value: 'monthly', label: 'Month' }]} /></Field>
        </FormGrid>
        <Field label="Send to" required hint="Email addresses, separated by commas."><Input value={form.recipients} onChange={set('recipients')} /></Field>
        <Switch label="Enabled" checked={Boolean(form.enabled)} onChange={set('enabled')} />
        {error && <p className="fx-error" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------ email log --- */

function EmailLogTab() {
  const [rows, setRows] = useState(null);
  useEffect(() => { api('/api/integrations/email-log').then(setRows).catch((e) => toast.error(e.message)); }, []);
  const tone = { sent: 'success', queued: 'warning', failed: 'danger' };
  return (
    <>
      <p className="fx-muted">The last 200 emails. Queued ones are retried automatically (after 1, 5 and 30 minutes, then 2 and 6 hours) if the mail server was unreachable.</p>
      <DataTable
        columns={[
          { key: 'createdAt', label: 'When', width: '170px', render: (r) => new Date(r.createdAt).toLocaleString('en-GB') },
          { key: 'to', label: 'To' },
          { key: 'subject', label: 'Subject' },
          { key: 'category', label: 'Kind' },
          { key: 'status', label: 'Status', render: (r) => <Pill tone={tone[r.status] || 'neutral'} dot>{r.status}</Pill> },
          { key: 'attempts', label: 'Tries', align: 'right' },
          { key: 'lastError', label: 'Error', render: (r) => (r.lastError ? <span className="fx-error">{r.lastError}</span> : '—') },
        ]}
        rows={rows || []}
        loading={!rows}
        selectable={false}
        timestamps={false}
        exportName="email-log"
        emptyMessage="No emails sent yet."
      />
    </>
  );
}

/* ------------------------------------------------------------ branding --- */

function BrandingCard({ slugLink }) {
  const [brand, setBrand] = useState(null);
  const [color, setColor] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api('/api/branding').then((b) => { setBrand(b); setColor(b?.brandColor || ''); }).catch(() => {});
  }, []);
  const save = async (body, message) => {
    setBusy(true);
    try {
      const b = await api('/api/company/branding', { method: 'PUT', body });
      setBrand(b);
      if (b.brandColor) {
        document.documentElement.style.setProperty('--nx-accent', b.brandColor);
        document.documentElement.style.setProperty('--nx-accent-hover', b.brandColor);
      }
      toast.success(message);
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  if (!brand) return null;
  return (
    <div className="fx-card">
      <h3 className="fx-card__title">Branding</h3>
      <p className="fx-card__hint">Your logo and colour in the app, on your sign-in page and in PDFs. Emails are sent in your company's name unless Mail Settings says otherwise.</p>
      <div className="fx-row">
        {brand.logoUrl
          ? <img src={brand.logoUrl} alt="Company logo" style={{ height: 48, maxWidth: 200, objectFit: 'contain', background: '#fff', borderRadius: 8, padding: 4, border: '1px solid var(--nx-border)' }} />
          : <span className="fx-muted">No logo yet.</span>}
        <label className="nx-btn nx-btn--secondary nx-btn--md" style={{ cursor: 'pointer' }}>
          Upload logo
          <input type="file" hidden accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 1024 * 1024) { toast.error('Keep the logo under 1MB.'); return; }
            save({ logoDataUrl: await readAsDataUrl(file) }, 'Logo saved.');
          }} />
        </label>
        {brand.logoUrl && <Button onClick={() => save({ removeLogo: true }, 'Logo removed.')} disabled={busy}>Remove</Button>}
      </div>
      <div className="fx-row" style={{ marginTop: 'var(--nx-space-4)' }}>
        <Field label="Brand colour">
          <div className="fx-row">
            <input type="color" value={color || '#4F46E5'} onChange={(e) => setColor(e.target.value)} aria-label="Pick a colour" style={{ width: 44, height: 36, border: 0, background: 'none' }} />
            <Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="#4F46E5" style={{ width: 120 }} />
          </div>
        </Field>
        <Button variant="primary" loading={busy} onClick={() => save({ brandColor: color }, 'Colour saved.')}>Save colour</Button>
        {brand.brandColor && <Button onClick={() => { setColor(''); save({ brandColor: '' }, 'Back to the default colour.'); }}>Use default</Button>}
      </div>
      <p className="fx-muted" style={{ marginTop: 'var(--nx-space-3)' }}>Your branded sign-in page: <code>{slugLink}</code></p>
    </div>
  );
}
