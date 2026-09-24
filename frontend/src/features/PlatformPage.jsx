import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button, DataTable, Field, FormGrid, Input, Modal, Page, Pill, toast } from '../ui';
import { api, fmtDate } from './api';
import './features.css';

/**
 * Platform → Companies. Only platform administrators (PLATFORM_ADMINS on the
 * server) get data here; everyone else gets the server's 403 message.
 * Each company is a separate CRM: its own users, leads, settings and key.
 */
export default function PlatformPage() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null);
  const [renaming, setRenaming] = useState(null);

  const load = useCallback(() => api('/api/platform/companies').then(setRows).catch((e) => { setError(e.message); setRows([]); }), []);
  useEffect(() => { load(); }, [load]);

  const setStatus = async (company, status) => {
    if (status === 'Suspended' && !await window.appConfirm(`Suspend ${company.name}? Its users are signed out and cannot sign in until it is reactivated.`)) return;
    try { await api(`/api/platform/companies/${company.id}`, { method: 'PUT', body: { status } }); load(); toast.success(`${company.name}: ${status}.`); } catch (e) { toast.error(e.message); }
  };

  if (error) {
    return <Page title="Companies"><p className="fx-error">{error}</p></Page>;
  }

  return (
    <Page
      title="Companies"
      subtitle="Every customer on this installation. Each company's data is kept completely separate."
      actions={<Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>New company</Button>}
    >
      <div className="nx-scope">
        <DataTable
          columns={[
            { key: 'name', label: 'Company', render: (r) => <span className="nx-page__strong">{r.name}</span> },
            { key: 'slug', label: 'Slug', render: (r) => <span className="nx-page__id">{r.slug}</span> },
            { key: 'plan', label: 'Plan', render: (r) => r.plan || '—' },
            { key: 'users', label: 'Users', align: 'right' },
            { key: 'leads', label: 'Leads', align: 'right' },
            { key: 'bookings', label: 'Bookings', align: 'right' },
            { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'Active' ? 'success' : 'danger'} dot>{r.status}</Pill> },
            { key: 'createdAt', label: 'Since', render: (r) => fmtDate(r.createdAt) },
          ]}
          rows={rows || []}
          loading={!rows}
          selectable={false}
          timestamps={false}
          exportName="companies"
          actions={(r) => (
            <div className="nx-page__row-actions">
              <Button size="sm" variant="ghost" onClick={() => setRenaming(r)}>Rename</Button>
              {r.status === 'Active'
                ? <Button size="sm" variant="ghost" onClick={() => setStatus(r, 'Suspended')}>Suspend</Button>
                : <Button size="sm" variant="ghost" onClick={() => setStatus(r, 'Active')}>Reactivate</Button>}
            </div>
          )}
        />
      </div>
      {creating && (
        <NewCompanyModal
          onClose={() => setCreating(false)}
          onCreated={(result) => { setCreating(false); setCreated(result); load(); }}
        />
      )}
      {renaming && (
        <RenameModal company={renaming} onClose={() => setRenaming(null)} onSaved={() => { setRenaming(null); load(); }} />
      )}
      {created && (
        <Modal open onClose={() => setCreated(null)} title="Company created" footer={<Button variant="primary" onClick={() => setCreated(null)}>Done</Button>}>
          <p><strong>{created.company.name}</strong> is ready with its default lists (lead statuses, sources, departments, email templates).</p>
          <p>Its administrator <strong>{created.admin.username}</strong> signs in with the password you set and is asked to change it straight away.</p>
          <p className="fx-muted">Company key for their website forms: <code>{created.company.publicKey}</code></p>
        </Modal>
      )}
    </Page>
  );
}

function NewCompanyModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', slug: '', plan: '', username: '', email: '', firstName: '', password: '' });
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
              name: form.name, slug: form.slug || undefined, plan: form.plan || undefined,
              admin: { username: form.username, email: form.email, firstName: form.firstName, password: form.password },
            },
          });
          onCreated(result);
        } catch (err) { setError(err.message); } finally { setSaving(false); }
      }}>
        <FormGrid columns={2}>
          <Field label="Company name" required><Input value={form.name} onChange={set('name')} data-autofocus /></Field>
          <Field label="Slug" hint="Used in their sign-up link. Made from the name if empty."><Input value={form.slug} onChange={set('slug')} placeholder="acme-realty" /></Field>
          <Field label="Plan"><Input value={form.plan} onChange={set('plan')} placeholder="e.g. Standard" /></Field>
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

function RenameModal({ company, onClose, onSaved }) {
  const [name, setName] = useState(company.name);
  const [plan, setPlan] = useState(company.plan || '');
  const [saving, setSaving] = useState(false);
  return (
    <Modal open onClose={onClose} title="Edit company"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="rename-company" loading={saving}>Save</Button></>}>
      <form id="rename-company" onSubmit={async (e) => {
        e.preventDefault(); setSaving(true);
        try { await api(`/api/platform/companies/${company.id}`, { method: 'PUT', body: { name, plan } }); toast.success('Saved.'); onSaved(); } catch (err) { toast.error(err.message); } finally { setSaving(false); }
      }}>
        <Field label="Company name" required><Input value={name} onChange={(e) => setName(e.target.value)} data-autofocus /></Field>
        <Field label="Plan"><Input value={plan} onChange={(e) => setPlan(e.target.value)} /></Field>
      </form>
    </Modal>
  );
}
