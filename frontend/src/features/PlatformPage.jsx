import React, { useCallback, useEffect, useState } from 'react';
import { Copy, Eye, KeyRound, MessageCircle, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  Button, DataTable, Field, FormGrid, Input, Modal, Page, Pill, Select, Switch, Textarea, toast,
} from '../ui';
import { api, copyText, fmtDate } from './api';
import './features.css';

/**
 * Platform → Companies and Plans. Only platform administrators (PLATFORM_ADMINS
 * on the server) get data here; everyone else gets the server's 403 message.
 */

const SUB_TONE = { internal: 'success', active: 'success', trialing: 'info', pending_payment: 'warning', past_due: 'warning', cancelled: 'warning', expired: 'danger' };
const SUB_LABEL = { internal: 'Internal', active: 'Paid', trialing: 'Trial', pending_payment: 'Payment authorization required', past_due: 'Payment failed', cancelled: 'Cancelled', expired: 'Expired' };
const rupees = (paise) => `₹${(Number(paise || 0) / 100).toLocaleString('en-IN')}`;

export default function PlatformPage() {
  const [tab, setTab] = useState('companies');
  const companiesRef = React.useRef(null);
  const plansRef = React.useRef(null);

  const actions = tab === 'companies' ? (
    <Button variant="primary" icon={Plus} onClick={() => companiesRef.current?.newCompany()}>New company</Button>
  ) : (
    <Button variant="primary" icon={Plus} onClick={() => plansRef.current?.newPlan()}>New plan</Button>
  );

  return (
    <Page title="Platform" subtitle="Every customer on this installation, and the plans they can buy." actions={actions}>
      <div className="nx-scope">
        <div className="fx-tabs" role="tablist">
          {[['companies', 'Companies'], ['plans', 'Plans']].map(([k, l]) => (
            <button key={k} type="button" role="tab" className="fx-tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
        {tab === 'companies' ? <Companies ref={companiesRef} /> : <Plans ref={plansRef} />}
      </div>
    </Page>
  );
}

/* ------------------------------------------------------------ companies --- */

const Companies = React.forwardRef((props, ref) => {
  const [rows, setRows] = useState(null);
  const [plans, setPlans] = useState([]);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [changing, setChanging] = useState(null);
  const [copyingPaymentLinkFor, setCopyingPaymentLinkFor] = useState(null);

  React.useImperativeHandle(ref, () => ({
    newCompany: () => setCreating(true),
  }));

  const load = useCallback(() => {
    api('/api/platform/companies').then(setRows).catch((e) => { setError(e.message); setRows([]); });
    api('/api/platform/plans').then(setPlans).catch(() => { });
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

  const copyPaymentLink = async (company) => {
    setCopyingPaymentLinkFor(company.id);
    try {
      const link = await api(`/api/platform/companies/${company.id}/billing`, {
        method: 'POST',
        body: { action: 'create-payment-link' },
      });
      if (await copyText(link.url)) {
        toast.success(`Cashfree payment link copied. Send it to ${company.name}'s billing contact.`);
      } else {
        window.prompt('Copy this Cashfree payment link and send it to the customer:', link.url);
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      setCopyingPaymentLinkFor(null);
    }
  };

  const deleteCompanies = async (ids, clearSelection) => {
    const names = (rows || []).filter((r) => ids.includes(r.id)).map((r) => r.name).join(', ');
    if (!await window.appConfirm(`Permanently delete ${names} and ALL their data (users, leads, bookings, payments, documents)? This cannot be undone. Only suspended companies can be deleted.`)) return;
    try {
      toast.success((await api('/api/platform/companies/bulk-delete', { method: 'POST', body: { ids } })).message);
      clearSelection();
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  if (error) return <p className="fx-error">{error}</p>;

  return (
    <>
      <DataTable
        columns={[
          { key: 'name', label: 'Company', render: (r) => <span className="nx-page__strong">{r.name}</span> },
          { key: 'slug', label: 'Slug', render: (r) => <span className="nx-page__id">{r.slug}</span> },
          { key: 'planKey', label: 'Plan', render: (r) => plans.find((p) => p.key === r.planKey)?.name || '—' },
          {
            key: 'subscriptionStatus', label: 'Subscription',
            render: (r) => {
              const state = r.subscriptionStatus === 'pending_payment'
                ? 'pending_payment'
                : (r.access?.allowed === false ? 'expired' : r.subscriptionStatus);
              return <Pill tone={SUB_TONE[state] || 'neutral'} dot>{SUB_LABEL[state] || state}{r.access?.daysLeft != null ? ` · ${r.access.daysLeft}d` : ''}</Pill>;
            },
          },
          { key: 'users', label: 'Users', align: 'right' },
          { key: 'leads', label: 'Leads', align: 'right' },
          { key: 'status', label: 'Account', render: (r) => {
            /* Three states, three tones: Active green, Pending amber (new
               signup, email not yet verified), Suspended red. The old
               two-state render coloured Pending the same red as Suspended,
               so a new trial read as "something is wrong" rather than
               "there is a new customer to welcome". */
            const tone = r.status === 'Active' ? 'success'
              : r.status === 'Pending' ? 'warning' : 'danger';
            const label = r.status === 'Pending' ? 'Pending verification' : r.status;
            return <Pill tone={tone}>{label}</Pill>;
          } },
          { key: 'createdAt', label: 'Since', render: (r) => fmtDate(r.createdAt) },
        ]}
        rows={rows || []}
        loading={!rows}
        timestamps={false}
        exportName="companies"
        bulkActions={(selected, clear) => (
          <Button variant="danger-outline" size="sm" icon={Trash2} onClick={() => deleteCompanies(selected, clear)}>
            Delete Selected
          </Button>
        )}
        onRowClick={(r) => setEditing(r)}
        actions={(r) => (
          r.own ? <Pill tone="info">Your company</Pill> : (
            <div className="nx-page__row-actions">
              <Button size="sm" variant="ghost" icon={Eye} aria-label={`View ${r.name}`} title="View" onClick={(e) => { e.stopPropagation(); setViewing(r); }} />
              <Button size="sm" variant="ghost" icon={Pencil} aria-label={`Edit ${r.name}`} title="Edit" onClick={(e) => { e.stopPropagation(); setChanging(r); }} />
              {r.subscriptionStatus === 'pending_payment' && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Copy}
                  aria-label={`Create and copy Cashfree payment link for ${r.name}`}
                  title="Create a Cashfree hosted first-payment link"
                  loading={copyingPaymentLinkFor === r.id}
                  disabled={Boolean(copyingPaymentLinkFor)}
                  onClick={(e) => { e.stopPropagation(); copyPaymentLink(r); }}
                >
                  Send payment link
                </Button>
              )}
              {/* Three states, three actions:
                   Active    → Suspend (close for violation / non-payment)
                   Pending   → Activate (skip the email verification by
                               hand, for a customer who told you in person)
                   Suspended → Reactivate (lift the suspension) */}
              {r.status === 'Active'
                ? <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setStatus(r, 'Suspended'); }}>Suspend</Button>
                : r.status === 'Pending'
                  ? <Button size="sm" variant="primary" onClick={(e) => { e.stopPropagation(); setStatus(r, 'Active'); }}>Activate</Button>
                  : <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setStatus(r, 'Active'); }}>Reactivate</Button>}
            </div>
          )
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
      {viewing && (
        <CompanyViewModal company={viewing} onClose={() => setViewing(null)} onEdit={() => { setChanging(viewing); setViewing(null); }} />
      )}
      {changing && (
        <CompanyEditModal company={changing} onClose={() => setChanging(null)} onSaved={load} />
      )}
      {creating && (
        <NewCompanyModal plans={plans} onClose={() => setCreating(false)} onCreated={(result) => { setCreating(false); setCreated(result); load(); }} />
      )}
      {created && (
        <Modal open onClose={() => setCreated(null)} title="Company created" footer={<Button variant="primary" onClick={() => setCreated(null)}>Done</Button>}>
          <p><strong>{created.company.name}</strong> is ready, on a free trial, with its default lists.</p>
          <p>Its administrator <strong>{created.admin.username}</strong> signs in with the password you set and is asked to change it straight away.</p>
          <p className="fx-muted">Company key for their website forms: <code>{created.company.publicKey}</code></p>
          {created.login && <LoginMessage {...created.login} />}
        </Modal>
      )}
    </>
  );
});

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
          {company.nextBillingAt && company.subscriptionStatus === 'pending_payment' && <> · first charge scheduled {fmtDate(company.nextBillingAt)}</>}
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
        <strong> A record</strong> for the domain pointing to this server, then ask your server administrator to add the
        domain to the webserver and issue a Let's Encrypt certificate for it.
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

/* ------------------------------------------------ view / edit a company --- */

const SIGNED_IN = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never');

/** A random temporary password that meets the password rules. */
function makePassword() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const body = Array.from(bytes.slice(0, 8), (b) => letters[b % letters.length]).join('');
  return `${body}@${10 + (bytes[8] % 90)}`;
}

/** The message to send a client admin, with copy and WhatsApp buttons. */
function LoginMessage({ url, username, password }) {
  const text = `Your CRM is ready: ${url}\nUsername: ${username}${password ? `\nTemporary password: ${password}\nYou'll be asked to set your own password when you first sign in.` : ''}`;
  return (
    <div className="fx-card" style={{ marginTop: 'var(--nx-space-3)' }}>
      <h3 className="fx-card__title">Login details to send</h3>
      <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit', fontSize: 'var(--nx-text-sm)' }}>{text}</pre>
      {password && <p className="fx-card__hint" style={{ marginTop: 'var(--nx-space-2)' }}>Copy it now: the password is not shown again.</p>}
      <div className="fx-card__actions">
        <Button size="sm" icon={Copy} onClick={async () => ((await copyText(text)) ? toast.success('Copied.') : toast.error('Copy failed.'))}>Copy</Button>
        <Button size="sm" icon={MessageCircle} onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener')}>Send on WhatsApp</Button>
      </div>
    </div>
  );
}

function useCompanyDetails(id) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => api(`/api/platform/companies/${id}/details`).then(setData).catch((e) => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load]);
  return [data, error, load];
}

function Detail({ label, children }) {
  return (
    <div>
      <div className="fx-stat__label">{label}</div>
      <div style={{ marginTop: 2, overflowWrap: 'anywhere' }}>{children || '—'}</div>
    </div>
  );
}

/** View: everything about a client company and its admin logins, read-only. */
function CompanyViewModal({ company, onClose, onEdit }) {
  const [data, error] = useCompanyDetails(company.id);
  const c = data?.company;
  const state = c && (c.access?.allowed === false ? 'expired' : c.subscriptionStatus);
  return (
    <Modal open onClose={onClose} size="lg" title={company.name}
      footer={<><Button onClick={onClose}>Close</Button>{data && <Button variant="primary" icon={Pencil} onClick={onEdit}>Edit</Button>}</>}>
      {error && <p className="fx-error">{error}</p>}
      {!data && !error && <p className="fx-muted">Loading…</p>}
      {data && (
        <>
          <div className="fx-stats">
            <div className="fx-stat"><div className="fx-stat__label">Users</div><div className="fx-stat__value">{data.counts.users}</div></div>
            <div className="fx-stat"><div className="fx-stat__label">Leads</div><div className="fx-stat__value">{data.counts.leads}</div></div>
            <div className="fx-stat"><div className="fx-stat__label">Projects</div><div className="fx-stat__value">{data.counts.projects}</div></div>
            <div className="fx-stat"><div className="fx-stat__label">Bookings</div><div className="fx-stat__value">{data.counts.bookings}</div></div>
          </div>

          <div className="fx-card">
            <h3 className="fx-card__title">Company</h3>
            <FormGrid columns={2}>
              <Detail label="Name">{c.name}</Detail>
              <Detail label="Code (slug)"><code>{c.slug}</code></Detail>
              <Detail label="Account"><Pill tone={c.status === 'Active' ? 'success' : 'danger'}>{c.status}</Pill></Detail>
              <Detail label="Subscription"><Pill tone={SUB_TONE[state] || 'neutral'} dot>{SUB_LABEL[state] || state}</Pill> {c.plan || ''}{c.trialEndsAt ? ` · trial ends ${fmtDate(c.trialEndsAt)}` : ''}{c.nextBillingAt && c.subscriptionStatus === 'pending_payment' ? ` · first charge scheduled ${fmtDate(c.nextBillingAt)}` : ''}{c.currentPeriodEnd ? ` · paid until ${fmtDate(c.currentPeriodEnd)}` : ''}</Detail>
              <Detail label="Sign-in address"><a href={data.signInUrl} target="_blank" rel="noreferrer">{data.signInUrl}</a></Detail>
              <Detail label="Own domain">{c.customDomain}</Detail>
              <Detail label="Legal name">{c.legalName}</Detail>
              <Detail label="GSTIN">{c.gstin}</Detail>
              <Detail label="Billing email">{c.billingEmail}</Detail>
              <Detail label="Phone">{c.phone}</Detail>
              <Detail label="Billing address">{c.billingAddress}</Detail>
              <Detail label="Customer since">{fmtDate(c.createdAt)}</Detail>
            </FormGrid>
          </div>

          <div className="fx-card">
            <h3 className="fx-card__title">Administrator logins</h3>
            {data.admins.length === 0 && <p className="fx-muted">No administrator accounts.</p>}
            {data.admins.map((a) => (
              <FormGrid key={a.id} columns={2}>
                <Detail label="Username"><strong>{a.username}</strong></Detail>
                <Detail label="Name">{[a.firstName, a.lastName].filter(Boolean).join(' ')}</Detail>
                <Detail label="Email">{a.email}</Detail>
                <Detail label="Phone">{a.phone}</Detail>
                <Detail label="Last sign-in">{SIGNED_IN(a.lastLoginAt)}</Detail>
                <Detail label="Password">
                  {a.mustChangePassword ? <Pill tone="warning">Temporary: must change at next sign-in</Pill> : <Pill tone="success">Set by them</Pill>}
                  {a.locked && <> <Pill tone="danger">Locked</Pill></>}
                </Detail>
              </FormGrid>
            ))}
            <p className="fx-card__hint" style={{ marginTop: 'var(--nx-space-3)' }}>Passwords are stored scrambled and can't be shown. Use Edit to set a new temporary one.</p>
          </div>
        </>
      )}
    </Modal>
  );
}

/** Edit: company details, admin login details, and a new temporary password. */
function CompanyEditModal({ company, onClose, onSaved }) {
  const [data, error, reload] = useCompanyDetails(company.id);
  return (
    <Modal open onClose={onClose} size="lg" title={`Edit ${company.name}`} footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      {error && <p className="fx-error">{error}</p>}
      {!data && !error && <p className="fx-muted">Loading…</p>}
      {data && (
        <>
          <CompanyDetailsForm company={data.company} onSaved={() => { reload(); onSaved(); }} />
          {data.admins.map((a) => (
            <AdminEditor key={a.id} companyId={company.id} admin={a} signInUrl={data.signInUrl} onSaved={() => { reload(); onSaved(); }} />
          ))}
        </>
      )}
    </Modal>
  );
}

function CompanyDetailsForm({ company, onSaved }) {
  const [form, setForm] = useState({
    name: company.name || '', legalName: company.legalName || '', gstin: company.gstin || '',
    billingEmail: company.billingEmail || '', phone: company.phone || '', billingAddress: company.billingAddress || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <form className="fx-card" onSubmit={async (e) => {
      e.preventDefault(); setSaving(true);
      try { await api(`/api/platform/companies/${company.id}/details`, { method: 'PUT', body: form }); toast.success('Company saved.'); onSaved(); } catch (err) { toast.error(err.message); } finally { setSaving(false); }
    }}>
      <h3 className="fx-card__title">Company details</h3>
      <FormGrid columns={2}>
        <Field label="Company name" required><Input value={form.name} onChange={set('name')} /></Field>
        <Field label="Legal name"><Input value={form.legalName} onChange={set('legalName')} /></Field>
        <Field label="GSTIN"><Input value={form.gstin} onChange={set('gstin')} placeholder="29ABCDE1234F1Z5" /></Field>
        <Field label="Billing email"><Input type="email" value={form.billingEmail} onChange={set('billingEmail')} /></Field>
        <Field label="Phone"><Input value={form.phone} onChange={set('phone')} /></Field>
        <Field label="Billing address" className="nx-field--full"><Textarea rows={2} value={form.billingAddress} onChange={set('billingAddress')} /></Field>
      </FormGrid>
      <div className="fx-card__actions"><Button variant="primary" type="submit" loading={saving}>Save company</Button></div>
    </form>
  );
}

function AdminEditor({ companyId, admin, signInUrl, onSaved }) {
  const [form, setForm] = useState({
    username: admin.username || '', firstName: admin.firstName || '', lastName: admin.lastName || '',
    email: admin.email || '', phone: admin.phone || '',
  });
  const [password, setPassword] = useState('');
  const [sent, setSent] = useState(null);
  const [busy, setBusy] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const base = `/api/platform/companies/${companyId}/admins/${admin.id}`;
  return (
    <div className="fx-card">
      <h3 className="fx-card__title">Administrator login: {admin.username}</h3>
      <form onSubmit={async (e) => {
        e.preventDefault(); setBusy('save');
        try { await api(base, { method: 'PUT', body: form }); toast.success('Administrator saved.'); onSaved(); } catch (err) { toast.error(err.message); } finally { setBusy(''); }
      }}>
        <FormGrid columns={2}>
          <Field label="Username" required hint="Changing it signs them out; tell them the new one."><Input value={form.username} onChange={set('username')} autoComplete="off" /></Field>
          <Field label="Email" required hint="Password-reset links go here."><Input type="email" value={form.email} onChange={set('email')} /></Field>
          <Field label="First name" required><Input value={form.firstName} onChange={set('firstName')} /></Field>
          <Field label="Last name"><Input value={form.lastName} onChange={set('lastName')} /></Field>
          <Field label="Phone"><Input value={form.phone} onChange={set('phone')} /></Field>
        </FormGrid>
        <div className="fx-card__actions"><Button variant="primary" type="submit" loading={busy === 'save'}>Save administrator</Button></div>
      </form>

      <h3 className="fx-card__title" style={{ marginTop: 'var(--nx-space-4)' }}>Set a new temporary password</h3>
      <p className="fx-card__hint">For when they have lost theirs. They are signed out everywhere and must choose their own at next sign-in.</p>
      <form className="fx-row" onSubmit={async (e) => {
        e.preventDefault();
        if (!await window.appConfirm(`Set a new password for ${admin.username}? Their current password stops working.`)) return;
        setBusy('reset');
        try {
          toast.success((await api(`${base}/reset-password`, { method: 'POST', body: { password } })).message);
          setSent({ url: signInUrl, username: form.username, password });
          setPassword('');
          onSaved();
        } catch (err) { toast.error(err.message); } finally { setBusy(''); }
      }}>
        <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New temporary password" aria-label="New temporary password" autoComplete="new-password" />
        <Button type="button" icon={KeyRound} onClick={() => setPassword(makePassword())}>Generate</Button>
        <Button variant="primary" type="submit" loading={busy === 'reset'} disabled={!password}>Set password</Button>
      </form>
      {sent && <LoginMessage {...sent} />}
    </div>
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
          const result = await api('/api/platform/companies', {
            method: 'POST',
            body: {
              name: form.name, slug: form.slug || undefined, planKey: form.planKey,
              admin: { username: form.username, email: form.email, firstName: form.firstName, password: form.password },
            },
          });
          // Shown once, so it can be sent: the password is never shown again.
          onCreated({ ...result, login: { url: `${window.location.origin}/?company=${result.company.slug}`, username: result.admin.username, password: form.password } });
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

const Plans = React.forwardRef((props, ref) => {
  const [rows, setRows] = useState(null);
  const [editing, setEditing] = useState(null);
  const load = useCallback(() => api('/api/platform/plans').then(setRows).catch((e) => toast.error(e.message)), []);
  useEffect(() => { load(); }, [load]);

  React.useImperativeHandle(ref, () => ({
    newPlan: () => setEditing({ key: '', name: '', priceRupees: '', maxUsers: 10, description: '', features: '', active: true }),
  }));

  return (
    <>
      <div className="fx-row" style={{ justifyContent: 'space-between', marginBottom: 'var(--nx-space-4)' }}>
        <p className="fx-muted" style={{ margin: 0 }}>Prices are monthly, before GST. A price change applies to new subscriptions; existing subscribers keep theirs.</p>
      </div>
      <DataTable
        columns={[
          { key: 'name', label: 'Plan', render: (r) => <span className="nx-page__strong">{r.name}</span> },
          { key: 'key', label: 'Key', render: (r) => <span className="nx-page__id">{r.key}</span> },
          { key: 'pricePaise', label: 'Price / month', align: 'right', render: (r) => rupees(r.pricePaise) },
          { key: 'maxUsers', label: 'Users', align: 'right', render: (r) => (r.maxUsers ? r.maxUsers : 'Unlimited') },
          { key: 'active', label: 'On sale', render: (r) => (r.active ? <Pill tone="success" dot>Yes</Pill> : <Pill>No</Pill>) },
          { key: 'gatewayPlanId', label: 'Cashfree plan', render: (r) => r.gatewayPlanId || <span className="fx-muted">created on first sale</span> },
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
});

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
