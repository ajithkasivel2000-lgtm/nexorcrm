import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import {
  Button, DataTable, Field, FormGrid, Input, Modal, Page, Pill, Select, Switch, Textarea, toast,
} from '../ui';
import { api, fmtDate } from './api';
import './features.css';

/**
 * Platform → Companies and Plans. Only platform administrators (PLATFORM_ADMINS
 * on the server) get data here; everyone else gets the server's 403 message.
 */

const SUB_TONE = { internal: 'success', active: 'success', trialing: 'info', past_due: 'warning', cancelled: 'warning', expired: 'danger' };
const SUB_LABEL = { internal: 'Internal', active: 'Paid', trialing: 'Trial', past_due: 'Payment failed', cancelled: 'Cancelled', expired: 'Expired' };
const rupees = (paise) => `₹${(Number(paise || 0) / 100).toLocaleString('en-IN')}`;

export default function PlatformPage() {
  const [tab, setTab] = useState('companies');
  return (
    <Page title="Platform" subtitle="Every customer on this installation, and the plans they can buy.">
      <div className="nx-scope">
        <div className="fx-tabs" role="tablist">
          {[['companies', 'Companies'], ['plans', 'Plans']].map(([k, l]) => (
            <button key={k} type="button" role="tab" className="fx-tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
        {tab === 'companies' ? <Companies /> : <Plans />}
      </div>
    </Page>
  );
}

/* ------------------------------------------------------------ companies --- */

function Companies() {
  const [rows, setRows] = useState(null);
  const [plans, setPlans] = useState([]);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null);
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    api('/api/platform/companies').then(setRows).catch((e) => { setError(e.message); setRows([]); });
    api('/api/platform/plans').then(setPlans).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (company, body, confirmText) => {
    if (confirmText && !await window.appConfirm(confirmText)) return;
    try { toast.success((await api(`/api/platform/companies/${company.id}/billing`, { method: 'POST', body })).message); load(); } catch (e) { toast.error(e.message); }
  };
  const setStatus = async (company, status) => {
    if (status === 'Suspended' && !await window.appConfirm(`Suspend ${company.name}? Its users are signed out and cannot sign in until it is reactivated.`)) return;
    try { await api(`/api/platform/companies/${company.id}`, { method: 'PUT', body: { status } }); load(); toast.success(`${company.name}: ${status}.`); } catch (e) { toast.error(e.message); }
  };

  if (error) return <p className="fx-error">{error}</p>;

  return (
    <>
      <div className="fx-row" style={{ justifyContent: 'flex-end', marginBottom: 'var(--nx-space-4)' }}>
        <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>New company</Button>
      </div>
      <DataTable
        columns={[
          { key: 'name', label: 'Company', render: (r) => <span className="nx-page__strong">{r.name}</span> },
          { key: 'slug', label: 'Slug', render: (r) => <span className="nx-page__id">{r.slug}</span> },
          { key: 'planKey', label: 'Plan', render: (r) => plans.find((p) => p.key === r.planKey)?.name || '—' },
          {
            key: 'subscriptionStatus', label: 'Subscription',
            render: (r) => {
              const state = r.access?.allowed === false ? 'expired' : r.subscriptionStatus;
              return <Pill tone={SUB_TONE[state] || 'neutral'} dot>{SUB_LABEL[state] || state}{r.access?.daysLeft != null ? ` · ${r.access.daysLeft}d` : ''}</Pill>;
            },
          },
          { key: 'users', label: 'Users', align: 'right' },
          { key: 'leads', label: 'Leads', align: 'right' },
          { key: 'status', label: 'Account', render: (r) => <Pill tone={r.status === 'Active' ? 'success' : 'danger'}>{r.status}</Pill> },
          { key: 'createdAt', label: 'Since', render: (r) => fmtDate(r.createdAt) },
        ]}
        rows={rows || []}
        loading={!rows}
        selectable={false}
        timestamps={false}
        exportName="companies"
        onRowClick={(r) => setEditing(r)}
        actions={(r) => (
          <div className="nx-page__row-actions">
            {r.status === 'Active'
              ? <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setStatus(r, 'Suspended'); }}>Suspend</Button>
              : <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setStatus(r, 'Active'); }}>Reactivate</Button>}
          </div>
        )}
      />
      {editing && (
        <CompanyModal
          company={editing}
          plans={plans}
          onClose={() => setEditing(null)}
          onAction={(body, confirmText) => act(editing, body, confirmText).then(() => setEditing(null))}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
      {creating && (
        <NewCompanyModal plans={plans} onClose={() => setCreating(false)} onCreated={(result) => { setCreating(false); setCreated(result); load(); }} />
      )}
      {created && (
        <Modal open onClose={() => setCreated(null)} title="Company created" footer={<Button variant="primary" onClick={() => setCreated(null)}>Done</Button>}>
          <p><strong>{created.company.name}</strong> is ready, on a free trial, with its default lists.</p>
          <p>Its administrator <strong>{created.admin.username}</strong> signs in with the password you set and is asked to change it straight away.</p>
          <p className="fx-muted">Company key for their website forms: <code>{created.company.publicKey}</code></p>
        </Modal>
      )}
    </>
  );
}

function CompanyModal({ company, plans, onClose, onAction, onSaved }) {
  const [name, setName] = useState(company.name);
  const [planKey, setPlanKey] = useState(company.planKey || 'growth');
  const [days, setDays] = useState('30');
  const [saving, setSaving] = useState(false);
  return (
    <Modal open onClose={onClose} size="lg" title={company.name}
      footer={<Button onClick={onClose}>Close</Button>}>
      <form className="fx-card" onSubmit={async (e) => {
        e.preventDefault(); setSaving(true);
        try { await api(`/api/platform/companies/${company.id}`, { method: 'PUT', body: { name } }); toast.success('Saved.'); onSaved(); } catch (err) { toast.error(err.message); } finally { setSaving(false); }
      }}>
        <h3 className="fx-card__title">Name</h3>
        <div className="fx-row">
          <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Company name" />
          <Button variant="primary" type="submit" loading={saving}>Rename</Button>
        </div>
      </form>

      <DomainCard company={company} onSaved={onSaved} />

      <div className="fx-card">
        <h3 className="fx-card__title">Subscription</h3>
        <p className="fx-card__hint">
          Status <strong>{SUB_LABEL[company.subscriptionStatus] || company.subscriptionStatus}</strong>
          {company.trialEndsAt && <> · trial ends {fmtDate(company.trialEndsAt)}</>}
          {company.currentPeriodEnd && <> · paid until {fmtDate(company.currentPeriodEnd)}</>}
        </p>
        <FormGrid columns={2}>
          <Field label="Plan">
            <Select value={planKey} onChange={(e) => setPlanKey(e.target.value)} advanceOnPick={false}
              options={plans.map((p) => ({ value: p.key, label: `${p.name} — ${rupees(p.pricePaise)}/mo${p.maxUsers ? `, ${p.maxUsers} users` : ', unlimited'}` }))} />
          </Field>
          <Field label="Days"><Input type="number" min="1" value={days} onChange={(e) => setDays(e.target.value)} /></Field>
        </FormGrid>
        <div className="fx-card__actions">
          <Button onClick={() => onAction({ action: 'set-plan', planKey })}>Set plan</Button>
          <Button variant="primary" onClick={() => onAction({ action: 'activate', planKey, days }, `Record an offline payment and activate ${company.name} for ${days} days?`)}>Paid offline: activate {days} days</Button>
          <Button onClick={() => onAction({ action: 'extend-trial', days })}>Extend trial {days} days</Button>
          <Button onClick={() => onAction({ action: 'internal' }, 'Mark as internal? It will never be billed or limited.')}>Mark internal</Button>
          <Button variant="danger" onClick={() => onAction({ action: 'expire' }, `Expire ${company.name}'s subscription now? Only billing will open for them.`)}>Expire now</Button>
        </div>
      </div>
    </Modal>
  );
}

/** The company's own web address, e.g. crm.roofonwalls.com. */
function DomainCard({ company, onSaved }) {
  const [domain, setDomain] = useState(company.customDomain || '');
  // What is saved now; the company row passed in is the one the dialog opened with.
  const [current, setCurrent] = useState(company.customDomain || '');
  const [saving, setSaving] = useState(false);
  const save = async (value) => {
    setSaving(true);
    try {
      const saved = await api(`/api/platform/companies/${company.id}`, { method: 'PUT', body: { customDomain: value } });
      setDomain(saved.customDomain || '');
      setCurrent(saved.customDomain || '');
      toast.success(saved.customDomain ? `Domain set: ${saved.customDomain}` : 'Domain removed.');
      onSaved();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };
  return (
    <form className="fx-card" onSubmit={(e) => { e.preventDefault(); save(domain); }}>
      <h3 className="fx-card__title">Own domain</h3>
      <p className="fx-card__hint">
        Run this company's CRM on its own address, such as <code>crm.{company.slug}.com</code>. Their staff sign in there and
        their buyers use <code>/portal</code> on it, with the company's logo, and emails link to it. Before saving: add a DNS
        <strong> A record</strong> for the domain pointing to this server, add the domain to the nginx config and run certbot
        (see deploy/DEPLOY.md).
      </p>
      <div className="fx-row">
        <Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="crm.example.com" aria-label="Own domain" />
        <Button variant="primary" type="submit" loading={saving}>Save domain</Button>
        {current && <Button type="button" disabled={saving} onClick={() => save('')}>Remove</Button>}
      </div>
      {current && (
        <p className="fx-card__hint" style={{ marginTop: 'var(--nx-space-2)' }}>
          Live at <a href={`https://${current}`} target="_blank" rel="noreferrer">https://{current}</a>
        </p>
      )}
    </form>
  );
}

function NewCompanyModal({ plans, onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', slug: '', planKey: 'growth', username: '', email: '', firstName: '', password: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <Modal open onClose={onClose} size="lg" title="New company"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="new-company" loading={saving}>Create company</Button></>}>
      <form id="new-company" onSubmit={async (e) => {
        e.preventDefault(); setSaving(true); setError('');
        try {
          onCreated(await api('/api/platform/companies', {
            method: 'POST',
            body: {
              name: form.name, slug: form.slug || undefined, planKey: form.planKey,
              admin: { username: form.username, email: form.email, firstName: form.firstName, password: form.password },
            },
          }));
        } catch (err) { setError(err.message); } finally { setSaving(false); }
      }}>
        <FormGrid columns={2}>
          <Field label="Company name" required><Input value={form.name} onChange={set('name')} data-autofocus /></Field>
          <Field label="Slug" hint="Used in their sign-in link. Made from the name if empty."><Input value={form.slug} onChange={set('slug')} placeholder="acme-realty" /></Field>
          <Field label="Plan (after the free trial)">
            <Select value={form.planKey} onChange={set('planKey')} advanceOnPick={false} options={plans.filter((p) => p.active).map((p) => ({ value: p.key, label: p.name }))} />
          </Field>
        </FormGrid>
        <h3 className="fx-card__title" style={{ marginTop: 'var(--nx-space-4)' }}>First administrator</h3>
        <FormGrid columns={2}>
          <Field label="Username" required><Input value={form.username} onChange={set('username')} autoComplete="off" /></Field>
          <Field label="First name"><Input value={form.firstName} onChange={set('firstName')} /></Field>
          <Field label="Email" required><Input type="email" value={form.email} onChange={set('email')} /></Field>
          <Field label="Temporary password" required hint="At least 10 characters. They must change it on first sign-in."><Input type="password" value={form.password} onChange={set('password')} autoComplete="new-password" /></Field>
        </FormGrid>
        {error && <p className="fx-error" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}

/* ---------------------------------------------------------------- plans --- */

function Plans() {
  const [rows, setRows] = useState(null);
  const [editing, setEditing] = useState(null);
  const load = useCallback(() => api('/api/platform/plans').then(setRows).catch((e) => toast.error(e.message)), []);
  useEffect(() => { load(); }, [load]);
  return (
    <>
      <div className="fx-row" style={{ justifyContent: 'space-between', marginBottom: 'var(--nx-space-4)' }}>
        <p className="fx-muted" style={{ margin: 0 }}>Prices are monthly, before GST. A price change applies to new subscriptions; existing subscribers keep theirs.</p>
        <Button variant="primary" icon={Plus} onClick={() => setEditing({ key: '', name: '', priceRupees: '', maxUsers: 10, description: '', features: '', active: true })}>New plan</Button>
      </div>
      <DataTable
        columns={[
          { key: 'name', label: 'Plan', render: (r) => <span className="nx-page__strong">{r.name}</span> },
          { key: 'key', label: 'Key', render: (r) => <span className="nx-page__id">{r.key}</span> },
          { key: 'pricePaise', label: 'Price / month', align: 'right', render: (r) => rupees(r.pricePaise) },
          { key: 'maxUsers', label: 'Users', align: 'right', render: (r) => (r.maxUsers ? r.maxUsers : 'Unlimited') },
          { key: 'active', label: 'On sale', render: (r) => (r.active ? <Pill tone="success" dot>Yes</Pill> : <Pill>No</Pill>) },
          { key: 'razorpayPlanId', label: 'Razorpay', render: (r) => r.razorpayPlanId || <span className="fx-muted">created on first sale</span> },
        ]}
        rows={rows || []}
        loading={!rows}
        selectable={false}
        timestamps={false}
        onRowClick={(r) => setEditing({ ...r, priceRupees: r.pricePaise / 100, features: (r.features || []).join('\n') })}
      />
      {editing && <PlanModal plan={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </>
  );
}

function PlanModal({ plan, onClose, onSaved }) {
  const [form, setForm] = useState(plan);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  return (
    <Modal open onClose={onClose} title={plan.id ? `Edit ${plan.name}` : 'New plan'}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="plan-form" loading={saving}>Save</Button></>}>
      <form id="plan-form" onSubmit={async (e) => {
        e.preventDefault(); setSaving(true); setError('');
        const body = { name: form.name, priceRupees: form.priceRupees, maxUsers: form.maxUsers, description: form.description, features: form.features, active: form.active };
        if (!plan.id) body.key = form.key;
        try {
          await api(plan.id ? `/api/platform/plans/${plan.id}` : '/api/platform/plans', { method: plan.id ? 'PUT' : 'POST', body });
          toast.success('Plan saved.'); onSaved();
        } catch (err) { setError(err.message); } finally { setSaving(false); }
      }}>
        <FormGrid columns={2}>
          <Field label="Name" required><Input value={form.name} onChange={set('name')} data-autofocus /></Field>
          <Field label="Key" required hint={plan.id ? 'Fixed once created.' : 'Lowercase, e.g. growth'}><Input value={form.key} onChange={set('key')} disabled={Boolean(plan.id)} /></Field>
          <Field label="Price per month (₹, before GST)" required><Input type="number" min="0" value={form.priceRupees} onChange={set('priceRupees')} /></Field>
          <Field label="Max users" hint="0 = unlimited"><Input type="number" min="0" value={form.maxUsers} onChange={set('maxUsers')} /></Field>
        </FormGrid>
        <Field label="Description"><Input value={form.description || ''} onChange={set('description')} /></Field>
        <Field label="Features" hint="One per line."><Textarea rows={4} value={form.features} onChange={set('features')} /></Field>
        <Switch label="On sale" checked={Boolean(form.active)} onChange={set('active')} />
        {error && <p className="fx-error" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}
