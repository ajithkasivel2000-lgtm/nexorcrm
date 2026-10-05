import { useCallback, useEffect, useState } from 'react';
import { LogOut, Plus } from 'lucide-react';
import { Button, DataTable, Field, FormGrid, Input, Modal, Pill, Textarea, toast, toneForStatus } from '../ui';
import { api, fmtDate, inr } from './api';
import './features.css';

/**
 * What a channel partner sees after signing in — and all they see: the leads
 * they brought in and how each is moving, a form to submit a new one, and the
 * commission they have earned on bookings. The server walls partner accounts
 * off from the rest of the CRM (middleware/authMiddleware.js).
 */
export default function PartnerPortal({ onLogout }) {
  const [me, setMe] = useState(null);
  const [leads, setLeads] = useState(null);
  const [commissions, setCommissions] = useState(null);
  const [tab, setTab] = useState('leads');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api('/api/partner/me').then(setMe).catch((e) => setError(e.message));
    api('/api/partner/leads').then(setLeads).catch(() => setLeads([]));
    api('/api/partner/commissions').then(setCommissions).catch(() => setCommissions([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="nx-scope" style={{ minHeight: '100vh', background: 'var(--nx-bg-app)', padding: 'var(--nx-space-6) var(--nx-space-4)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div className="fx-row" style={{ marginBottom: 'var(--nx-space-5)' }}>
          <img src="/dark-logo.svg" alt="NexorCRM" style={{ height: 32 }} />
          <div className="fx-grow">
            <h1 style={{ margin: 0, fontSize: 'var(--nx-text-xl)', color: 'var(--nx-text)' }}>Partner portal</h1>
            <p className="fx-muted" style={{ margin: 0 }}>{me?.partner?.companyName || ''}</p>
          </div>
          <Button icon={LogOut} onClick={onLogout}>Sign out</Button>
        </div>

        {error && <p className="fx-error">{error}</p>}

        <div className="fx-stats">
          <Stat label="Leads submitted" value={me?.leads ?? '—'} />
          <Stat label="Commission earned" value={inr(me?.commission?.total)} />
          <Stat label="Approved, awaiting payment" value={inr(me?.commission?.approved)} />
          <Stat label="Paid to you" value={inr(me?.commission?.paid)} tone="success" />
        </div>

        <div className="fx-row" style={{ justifyContent: 'space-between' }}>
          <div className="fx-tabs" role="tablist" style={{ flex: 1 }}>
            {[['leads', 'My leads'], ['commissions', 'Commissions']].map(([key, label]) => (
              <button key={key} type="button" role="tab" className="fx-tab" aria-selected={tab === key} onClick={() => setTab(key)}>{label}</button>
            ))}
          </div>
          <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>Submit a lead</Button>
        </div>

        {tab === 'leads' && (
          <DataTable
            columns={[
              { key: 'id', label: 'Lead', width: '140px', render: (r) => <span className="nx-page__id">{r.id}</span> },
              { key: 'name', label: 'Name', render: (r) => <span className="nx-page__strong">{r.name}</span> },
              { key: 'mobile', label: 'Mobile' },
              { key: 'project', label: 'Project' },
              { key: 'status', label: 'Status', render: (r) => <Pill tone={toneForStatus(r.status)} dot>{r.status}</Pill> },
              { key: 'siteVisitDate', label: 'Site visit', render: (r) => fmtDate(r.siteVisitDate) },
              { key: 'createdAt', label: 'Submitted', render: (r) => fmtDate(r.createdAt) },
            ]}
            rows={leads || []}
            loading={!leads}
            selectable={false}
            timestamps={false}
            emptyMessage="No leads yet. Submit your first one."
          />
        )}

        {tab === 'commissions' && (
          <DataTable
            columns={[
              { key: 'buyer', label: 'Buyer', render: (r) => r.booking.buyerName },
              { key: 'date', label: 'Booked', render: (r) => fmtDate(r.booking.bookingDate) },
              { key: 'value', label: 'Deal value', align: 'right', render: (r) => inr(r.booking.agreementValue) },
              { key: 'percent', label: '%', align: 'right', render: (r) => `${Number(r.percent)}%` },
              { key: 'amount', label: 'Commission', align: 'right', render: (r) => inr(r.amount) },
              { key: 'buyerPaid', label: 'Buyer has paid', align: 'right', render: (r) => `${r.booking.percentPaidByBuyer}%` },
              { key: 'status', label: 'Status', render: (r) => <Pill tone={{ Paid: 'success', Approved: 'info', Pending: 'warning', Cancelled: 'danger' }[r.status] || 'neutral'} dot>{r.status}</Pill> },
            ]}
            rows={commissions || []}
            loading={!commissions}
            selectable={false}
            timestamps={false}
            emptyMessage="No commissions yet — they appear when a lead you brought books a unit."
          />
        )}
      </div>

      {adding && <SubmitLeadModal onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); }} />}
    </div>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className="fx-stat">
      <div className="fx-stat__label">{label}</div>
      <div className={`fx-stat__value${tone ? ` fx-stat__value--${tone}` : ''}`}>{value}</div>
    </div>
  );
}

function SubmitLeadModal({ onClose, onDone }) {
  const [form, setForm] = useState({ name: '', mobile: '', email: '', project: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <Modal open onClose={onClose} title="Submit a lead"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="partner-lead" loading={saving}>Submit</Button></>}>
      <form id="partner-lead" onSubmit={async (e) => {
        e.preventDefault(); setSaving(true); setError('');
        try { const r = await api('/api/partner/leads', { method: 'POST', body: form }); toast.success(r.message); onDone(); } catch (err) { setError(err.message); } finally { setSaving(false); }
      }}>
        <FormGrid columns={2}>
          <Field label="Customer name" required><Input value={form.name} onChange={set('name')} data-autofocus /></Field>
          <Field label="Mobile" required><Input value={form.mobile} onChange={set('mobile')} inputMode="tel" /></Field>
          <Field label="Email"><Input type="email" value={form.email} onChange={set('email')} /></Field>
          <Field label="Project interested in"><Input value={form.project} onChange={set('project')} /></Field>
        </FormGrid>
        <Field label="Notes"><Textarea rows={3} value={form.notes} onChange={set('notes')} placeholder="Budget, configuration, best time to call…" /></Field>
        {error && <p className="fx-error" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}

/**
 * On a channel partner's record (staff side): the portal logins for that
 * partner, and a form to create one. Administrators only.
 */
export function PartnerLoginsPanel({ channelPartnerId, defaultEmail }) {
  const [users, setUsers] = useState(null);
  const [form, setForm] = useState({ username: '', email: defaultEmail || '', password: '' });
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api(`/api/partner-accounts/${channelPartnerId}`).then(setUsers).catch(() => setUsers(null)), [channelPartnerId]);
  useEffect(() => { load(); }, [load]);
  if (users === null) return null; // not an administrator: nothing to show
  return (
    <div className="fx-card">
      <h3 className="fx-card__title">Partner portal access</h3>
      <p className="fx-card__hint">A login for this partner to submit leads and follow them and their commission. They see nothing else in the CRM.</p>
      {users.length > 0 && (
        <ul className="fx-muted" style={{ marginTop: 0 }}>
          {users.map((u) => <li key={u.id}><strong>{u.username}</strong> · {u.email} · last sign-in {fmtDate(u.lastLoginAt)}</li>)}
        </ul>
      )}
      <form onSubmit={async (e) => {
        e.preventDefault(); setBusy(true);
        try { await api(`/api/partner-accounts/${channelPartnerId}`, { method: 'POST', body: form }); toast.success('Login created. They must change the password when they first sign in.'); setForm((f) => ({ ...f, username: '', password: '' })); load(); } catch (err) { toast.error(err.message); } finally { setBusy(false); }
      }}>
        <FormGrid columns={3}>
          <Field label="Username" required><Input value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} autoComplete="off" /></Field>
          <Field label="Email" required><Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></Field>
          <Field label="Temporary password" required hint="10+ characters"><Input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} autoComplete="new-password" /></Field>
        </FormGrid>
        <div className="fx-card__actions"><Button variant="primary" type="submit" loading={busy}>Create portal login</Button></div>
      </form>
    </div>
  );
}

