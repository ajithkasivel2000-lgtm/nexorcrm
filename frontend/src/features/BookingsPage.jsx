import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, FileDown, IndianRupee, Link2, MessageCircle, Plus, Trash2, XCircle } from 'lucide-react';
import {
  Button, DataTable, Field, FormGrid, Input, Modal, Page, Pill, Select, Checkbox, toast,
} from '../ui';
import useListData from '../components/Leads/useListData';
import usePagePermissions from '../hooks/usePagePermissions';
import loadPdfTools from '../utils/loadPdfTools';
import { api, inr, fmtDate, toDateInput, copyText } from './api';
import { RecordDocuments } from './LeadComms';
import './features.css';

/**
 * Bookings & Payments: units sold, their payment plans, money received,
 * what is overdue, and channel-partner commissions.
 * Backed by /api/bookings (backend/controllers/bookingController.js).
 */

const STATUS_TONE = { Booked: 'info', Agreement: 'purple', Registered: 'success', Cancelled: 'danger' };
const MODES = ['NEFT', 'RTGS', 'UPI', 'Cheque', 'Cash', 'Home Loan', 'Other'];

export default function BookingsPage() {
  const perms = usePagePermissions('bookings');
  const [tab, setTab] = useState('bookings');
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState(null);

  const { rows, loading, refresh } = useListData(useCallback(() => api('/api/bookings'), []), { resource: 'bookings' });

  const totals = useMemo(() => {
    const live = rows.filter((b) => b.status !== 'Cancelled');
    return {
      count: live.length,
      value: live.reduce((s, b) => s + Number(b.agreementValue), 0),
      paid: live.reduce((s, b) => s + b.summary.paid, 0),
      overdue: live.reduce((s, b) => s + b.summary.overdue, 0),
    };
  }, [rows]);

  const columns = useMemo(() => [
    { key: 'id', label: 'Booking', width: '150px', render: (r) => <span className="nx-page__id">{r.id}</span> },
    { key: 'buyerName', label: 'Buyer', render: (r) => <span className="nx-page__strong">{r.buyerName}</span> },
    { key: 'projectName', label: 'Project' },
    { key: 'unit', label: 'Unit', render: (r) => r.unit?.unitNumber || '—', exportValue: (r) => r.unit?.unitNumber || '' },
    { key: 'agreementValue', label: 'Value', align: 'right', render: (r) => inr(r.agreementValue), sortValue: (r) => Number(r.agreementValue) },
    {
      key: 'paid', label: 'Received', align: 'right', sortValue: (r) => r.summary.percentPaid,
      render: (r) => <span>{inr(r.summary.paid)} <span className="fx-muted">({r.summary.percentPaid}%)</span></span>,
      exportValue: (r) => r.summary.paid,
    },
    {
      key: 'overdue', label: 'Overdue', align: 'right', sortValue: (r) => r.summary.overdue,
      render: (r) => (r.summary.overdue > 0 ? <Pill tone="danger">{inr(r.summary.overdue)}</Pill> : '—'),
      exportValue: (r) => r.summary.overdue,
    },
    { key: 'bookingDate', label: 'Booked', width: '120px', render: (r) => fmtDate(r.bookingDate) },
    { key: 'status', label: 'Status', render: (r) => <Pill tone={STATUS_TONE[r.status] || 'neutral'} dot>{r.status}</Pill> },
  ], []);

  return (
    <Page
      title="Bookings & Payments"
      subtitle="Units sold, payment plans, collections and partner commissions."
      actions={perms.canCreate && <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>New booking</Button>}
    >
      <div className="nx-scope">
        <div className="fx-tabs" role="tablist">
          {[['bookings', 'Bookings'], ['collections', 'Collections']].map(([key, label]) => (
            <button key={key} type="button" role="tab" className="fx-tab" aria-selected={tab === key} onClick={() => setTab(key)}>{label}</button>
          ))}
        </div>

        {tab === 'bookings' && (
          <>
            <div className="fx-stats">
              <Stat label="Active bookings" value={totals.count} />
              <Stat label="Booked value" value={inr(totals.value)} />
              <Stat label="Received" value={inr(totals.paid)} tone="success" />
              <Stat label="Overdue" value={inr(totals.overdue)} tone={totals.overdue > 0 ? 'danger' : undefined} />
            </div>
            <DataTable
              columns={columns}
              rows={rows}
              loading={loading}
              exportName="bookings"
              selectable={false}
              onRowClick={(r) => setOpenId(r.id)}
              emptyMessage="No bookings yet."
            />
          </>
        )}

        {tab === 'collections' && <Collections onOpen={setOpenId} />}
      </div>

      {creating && (
        <NewBookingModal
          onClose={() => setCreating(false)}
          onCreated={(b) => { setCreating(false); refresh(); setOpenId(b.id); }}
        />
      )}
      {openId && <BookingDetail id={openId} perms={perms} onClose={() => { setOpenId(null); refresh(); }} />}
    </Page>
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

/* ---------------------------------------------------------------- create --- */

function NewBookingModal({ onClose, onCreated }) {
  const [projects, setProjects] = useState([]);
  const [units, setUnits] = useState([]);
  const [plans, setPlans] = useState([]);
  const [partners, setPartners] = useState([]);
  const [form, setForm] = useState({
    projectId: '', unitId: '', buyerName: '', buyerMobile: '', buyerEmail: '',
    agreementValue: '', bookingAmount: '', bookingAmountPaid: true, paymentMode: 'NEFT',
    plan: 'construction-linked', channelPartnerId: '', commissionPct: '', notes: '',
  });
  const [steps, setSteps] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/projects').then(setProjects).catch(() => setProjects([]));
    api('/api/bookings/plans').then(setPlans).catch(() => setPlans([]));
    api('/api/channel-partners').then(setPartners).catch(() => setPartners([]));
  }, []);

  useEffect(() => {
    setUnits([]);
    if (!form.projectId) return;
    api(`/api/projects/${form.projectId}/units`)
      .then((list) => setUnits(list.filter((u) => !['Booked', 'Sold', 'Blocked'].includes(u.status))))
      .catch(() => setUnits([]));
  }, [form.projectId]);

  // Choosing a plan fills the editable steps; they can then be changed.
  useEffect(() => {
    const plan = plans.find((p) => p.key === form.plan);
    if (plan) setSteps(plan.steps.map((s) => ({ ...s, dueDate: '' })));
  }, [form.plan, plans]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));

  const pickUnit = (e) => {
    const unitId = e.target.value;
    const unit = units.find((u) => u.id === unitId);
    setForm((f) => ({ ...f, unitId, agreementValue: f.agreementValue || (unit?.price ? String(Number(unit.price)) : '') }));
  };

  const pctTotal = steps.reduce((s, x) => s + Number(x.percent || 0), 0);
  const value = Number(form.agreementValue || 0);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (Math.abs(pctTotal - 100) > 0.01) { setError(`The plan adds up to ${pctTotal}%, not 100%.`); return; }
    setSaving(true);
    try {
      const booking = await api('/api/bookings', {
        method: 'POST',
        body: {
          ...form,
          agreementValue: value,
          bookingAmount: form.bookingAmount ? Number(form.bookingAmount) : null,
          commissionPct: form.commissionPct ? Number(form.commissionPct) : null,
          channelPartnerId: form.channelPartnerId || null,
          steps: steps.map((s) => ({ name: s.name, percent: Number(s.percent), dueDate: s.dueDate || null })),
        },
      });
      toast.success('Unit booked.');
      onCreated(booking);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title="New booking"
      footer={(
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="new-booking" loading={saving}>Book unit</Button>
        </>
      )}
    >
      <form id="new-booking" onSubmit={submit}>
        <FormGrid columns={2}>
          <Field label="Project" required>
            <Select value={form.projectId} onChange={set('projectId')} placeholder="Choose a project"
              options={projects.map((p) => ({ value: p.id, label: p.projectName }))} />
          </Field>
          <Field label="Unit" required hint={form.projectId && !units.length ? 'No available units in this project.' : undefined}>
            <Select value={form.unitId} onChange={pickUnit} placeholder="Choose a unit" disabled={!units.length}
              options={units.map((u) => ({ value: u.id, label: `${u.unitNumber}${u.bhk ? ` · ${u.bhk}` : ''}${u.price ? ` · ${inr(u.price)}` : ''} (${u.status})` }))} />
          </Field>
          <Field label="Buyer name" required><Input value={form.buyerName} onChange={set('buyerName')} data-autofocus /></Field>
          <Field label="Buyer mobile"><Input value={form.buyerMobile} onChange={set('buyerMobile')} inputMode="tel" /></Field>
          <Field label="Buyer email"><Input type="email" value={form.buyerEmail} onChange={set('buyerEmail')} /></Field>
          <Field label="Agreement value (₹)" required><Input type="number" min="1" value={form.agreementValue} onChange={set('agreementValue')} /></Field>
          <Field label="Booking amount (₹)"><Input type="number" min="0" value={form.bookingAmount} onChange={set('bookingAmount')} /></Field>
          <Field label="Booking amount received by">
            <Select value={form.paymentMode} onChange={set('paymentMode')} options={MODES} advanceOnPick={false} />
          </Field>
          <div className="nx-field--full">
            <Checkbox label="The booking amount has been received (records it as the first payment)" checked={form.bookingAmountPaid} onChange={set('bookingAmountPaid')} />
          </div>
          <Field label="Channel partner">
            <Select value={form.channelPartnerId} onChange={set('channelPartnerId')} placeholder="None (direct)"
              options={[{ value: '', label: 'None (direct)' }, ...partners.map((p) => ({ value: p.id, label: p.companyName || p.ownerName }))]} />
          </Field>
          <Field label="Partner commission %" hint={form.commissionPct && value ? inr((value * Number(form.commissionPct)) / 100) : undefined}>
            <Input type="number" min="0" max="20" step="0.1" value={form.commissionPct} onChange={set('commissionPct')} disabled={!form.channelPartnerId} />
          </Field>
        </FormGrid>

        <h3 className="fx-card__title" style={{ marginTop: 'var(--nx-space-5)' }}>Payment plan</h3>
        <Field label="Start from">
          <Select value={form.plan} onChange={set('plan')} options={plans.map((p) => ({ value: p.key, label: p.label }))} advanceOnPick={false} />
        </Field>
        <div className="fx-scroll">
          <table className="fx-table">
            <thead><tr><th>Milestone</th><th className="num">%</th><th className="num">Amount</th><th>Due date</th><th aria-label="Remove" /></tr></thead>
            <tbody>
              {steps.map((s, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <tr key={i}>
                  <td><Input value={s.name} aria-label="Milestone name" onChange={(e) => setSteps((all) => all.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} /></td>
                  <td className="num" style={{ width: 90 }}><Input type="number" step="0.01" aria-label="Percent" value={s.percent} onChange={(e) => setSteps((all) => all.map((x, j) => (j === i ? { ...x, percent: e.target.value } : x)))} /></td>
                  <td className="num">{inr((value * Number(s.percent || 0)) / 100)}</td>
                  <td style={{ width: 170 }}><Input type="date" aria-label="Due date" value={s.dueDate} onChange={(e) => setSteps((all) => all.map((x, j) => (j === i ? { ...x, dueDate: e.target.value } : x)))} /></td>
                  <td><Button type="button" variant="ghost" size="sm" icon={Trash2} aria-label="Remove step" onClick={() => setSteps((all) => all.filter((_, j) => j !== i))} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td><Button type="button" size="sm" icon={Plus} onClick={() => setSteps((all) => [...all, { name: '', percent: 0, dueDate: '' }])}>Add step</Button></td>
                <td className="num"><strong style={{ color: Math.abs(pctTotal - 100) > 0.01 ? 'var(--nx-danger)' : undefined }}>{pctTotal}%</strong></td>
                <td className="num"><strong>{inr((value * pctTotal) / 100)}</strong></td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
        {error && <p className="fx-error" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}

/* ---------------------------------------------------------------- detail --- */

function BookingDetail({ id, perms, onClose }) {
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState('');
  const [payment, setPayment] = useState({ amount: '', mode: 'NEFT', reference: '', paidOn: toDateInput(new Date()) });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api(`/api/bookings/${id}`).then(setBooking).catch((e) => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load]);

  const act = async (fn, success) => {
    setBusy(true);
    try {
      const updated = await fn();
      if (updated?.id) setBooking((b) => ({ ...b, ...updated }));
      else await load();
      if (success) toast.success(success);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!booking) {
    return <Modal open onClose={onClose} title="Booking" size="xl">{error ? <p className="fx-error">{error}</p> : <p className="fx-muted">Loading…</p>}</Modal>;
  }
  const s = booking.summary;
  const cancelled = booking.status === 'Cancelled';

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={`${booking.buyerName} · ${booking.project?.projectName || ''} ${booking.unit?.unitNumber || ''}`}
      footer={(
        <>
          <Button icon={FileDown} onClick={() => costSheetPdf(booking).catch((e) => toast.error(e.message))}>Cost sheet PDF</Button>
          {perms.canEdit && !cancelled && (
            <Button variant="danger" icon={XCircle} disabled={busy} onClick={async () => {
              if (!await window.appConfirm('Cancel this booking and release the unit?')) return;
              act(() => api(`/api/bookings/${id}/cancel`, { method: 'POST', body: {} }), 'Booking cancelled; the unit is available again.');
            }}>Cancel booking</Button>
          )}
          <Button variant="primary" onClick={onClose}>Close</Button>
        </>
      )}
    >
      <div className="fx-stats">
        <Stat label="Agreement value" value={inr(s.agreementValue)} />
        <Stat label="Received" value={inr(s.paid)} tone="success" />
        <Stat label="Balance" value={inr(s.balance)} />
        <Stat label="Overdue" value={inr(s.overdue)} tone={s.overdue > 0 ? 'danger' : undefined} />
      </div>
      <div className="fx-progress" aria-label={`${s.percentPaid}% paid`}><span style={{ width: `${Math.min(100, s.percentPaid)}%` }} /></div>
      <p className="fx-muted">
        {s.percentPaid}% paid · Booked {fmtDate(booking.bookingDate)} · Status <Pill tone={STATUS_TONE[booking.status] || 'neutral'}>{booking.status}</Pill>
        {s.nextDue && <> · Next: <strong>{s.nextDue.name}</strong> {inr(s.nextDue.outstanding)} {s.nextDue.dueDate ? `by ${fmtDate(s.nextDue.dueDate)}` : ''}</>}
      </p>

      {perms.canEdit && !cancelled && (
        <div className="fx-row" style={{ margin: 'var(--nx-space-3) 0' }}>
          <span className="fx-muted">Move to:</span>
          {['Booked', 'Agreement', 'Registered'].filter((st) => st !== booking.status).map((st) => (
            <Button key={st} size="sm" disabled={busy} onClick={() => act(() => api(`/api/bookings/${id}`, { method: 'PUT', body: { status: st } }), `Status: ${st}`)}>{st}</Button>
          ))}
        </div>
      )}

      <h3 className="fx-card__title">Payment plan</h3>
      <div className="fx-scroll">
        <table className="fx-table">
          <thead><tr><th>Milestone</th><th>Due</th><th className="num">Amount</th><th className="num">Paid</th><th className="num">Outstanding</th><th /></tr></thead>
          <tbody>
            {s.milestones.map((m) => (
              <tr key={m.id}>
                <td>{m.name}</td>
                <td>{fmtDate(m.dueDate)}</td>
                <td className="num">{inr(m.amount)}</td>
                <td className="num">{inr(m.paid)}</td>
                <td className="num">{inr(m.outstanding)}</td>
                <td>{m.outstanding <= 0 ? <Pill tone="success">Paid</Pill> : m.overdue ? <Pill tone="danger">Overdue</Pill> : <Pill>Due</Pill>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="fx-card__title" style={{ marginTop: 'var(--nx-space-5)' }}>Payments received</h3>
      <div className="fx-scroll">
        <table className="fx-table">
          <thead><tr><th>Date</th><th>Receipt</th><th>Mode</th><th>Reference</th><th className="num">Amount</th><th /></tr></thead>
          <tbody>
            {booking.payments.length === 0 && <tr><td colSpan={6} className="fx-muted">No payments yet.</td></tr>}
            {booking.payments.map((p) => (
              <tr key={p.id}>
                <td>{fmtDate(p.paidOn)}</td>
                <td className="nx-page__id">{p.receiptNo || '—'}</td>
                <td>{p.mode || '—'}</td>
                <td>{p.reference || '—'}</td>
                <td className="num">{inr(p.amount)}</td>
                <td>
                  <Button variant="ghost" size="sm" icon={FileDown} aria-label="Receipt PDF" onClick={() => receiptPdf(booking, p).catch((e) => toast.error(e.message))} />
                  {perms.canDelete && (
                    <Button variant="ghost" size="sm" icon={Trash2} aria-label="Delete payment" onClick={async () => {
                      if (!await window.appConfirm('Delete this payment from the ledger?')) return;
                      act(() => api(`/api/bookings/${id}/payments/${p.id}`, { method: 'DELETE' }), 'Payment deleted.');
                    }} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {perms.canEdit && !cancelled && s.balance > 0 && (
        <form
          className="fx-card"
          style={{ marginTop: 'var(--nx-space-4)' }}
          onSubmit={(e) => {
            e.preventDefault();
            act(() => api(`/api/bookings/${id}/payments`, { method: 'POST', body: { ...payment, amount: Number(payment.amount) } }), 'Payment recorded.')
              .then(() => setPayment((p) => ({ ...p, amount: '', reference: '' })));
          }}
        >
          <h3 className="fx-card__title">Record a payment</h3>
          <FormGrid columns={4}>
            <Field label="Amount (₹)" required><Input type="number" min="1" max={s.balance} value={payment.amount} onChange={(e) => setPayment((p) => ({ ...p, amount: e.target.value }))} /></Field>
            <Field label="Received on"><Input type="date" value={payment.paidOn} onChange={(e) => setPayment((p) => ({ ...p, paidOn: e.target.value }))} /></Field>
            <Field label="Mode"><Select value={payment.mode} onChange={(e) => setPayment((p) => ({ ...p, mode: e.target.value }))} options={MODES} advanceOnPick={false} /></Field>
            <Field label="Reference"><Input value={payment.reference} onChange={(e) => setPayment((p) => ({ ...p, reference: e.target.value }))} placeholder="UTR / cheque no." /></Field>
          </FormGrid>
          <div className="fx-card__actions"><Button variant="primary" type="submit" icon={IndianRupee} loading={busy}>Record payment</Button></div>
        </form>
      )}

      {!cancelled && <BuyerTools booking={booking} canEdit={perms.canEdit} />}

      <h3 className="fx-card__title" style={{ marginTop: 'var(--nx-space-5)' }}>Documents</h3>
      <p className="fx-card__hint">Files here (agreement, allotment letter, receipts) are also shown to the buyer in their portal.</p>
      <RecordDocuments entityType="booking" entityId={booking.id} readOnly={!perms.canEdit} />

      {booking.commission && (
        <div className="fx-card" style={{ marginTop: 'var(--nx-space-4)' }}>
          <h3 className="fx-card__title">Partner commission</h3>
          <p className="fx-card__hint">
            {Number(booking.commission.percent)}% = <strong>{inr(booking.commission.amount)}</strong> · <Pill tone={booking.commission.status === 'Paid' ? 'success' : 'warning'}>{booking.commission.status}</Pill>
          </p>
          {perms.canDelete && booking.commission.status !== 'Cancelled' && (
            <div className="fx-row">
              {['Pending', 'Approved', 'Paid'].filter((st) => st !== booking.commission.status).map((st) => (
                <Button key={st} size="sm" disabled={busy} onClick={() => act(() => api(`/api/bookings/${id}/commission`, { method: 'PUT', body: { status: st } }), `Commission ${st.toLowerCase()}.`)}>Mark {st}</Button>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------ buyer portal & pay links --- */

const LINK_TONE = { created: 'info', paid: 'success', expired: 'neutral', cancelled: 'neutral', failed: 'danger' };

/** The buyer's portal link to share, and Razorpay payment links for their dues. */
function BuyerTools({ booking, canEdit }) {
  const [links, setLinks] = useState(null);
  const [online, setOnline] = useState(false);
  const [milestoneId, setMilestoneId] = useState('');
  const [busy, setBusy] = useState('');
  const due = booking.summary.milestones.filter((m) => m.outstanding > 0);

  const load = useCallback(() => api(`/api/bookings/${booking.id}/payment-links`)
    .then((r) => { setLinks(r.links); setOnline(r.online); })
    .catch(() => setLinks([])), [booking.id]);
  useEffect(() => { load(); }, [load]);

  const share = (text) => {
    const phone = String(booking.buyerMobile || '').replace(/D/g, '').slice(-10);
    window.open(`https://wa.me/${phone ? `91${phone}` : ''}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  const portal = async (how) => {
    setBusy('portal');
    try {
      const { url } = await api(`/api/bookings/${booking.id}/portal-link`, { method: 'POST' });
      if (how === 'whatsapp') share(`Hello ${booking.buyerName}, you can see your payment plan, receipts and documents here (link valid for 7 days): ${url}`);
      else if (await copyText(url)) toast.success('Portal link copied. It works once, for 7 days.');
      else toast.error('Copy failed.');
    } catch (e) { toast.error(e.message); } finally { setBusy(''); }
  };

  const request = async () => {
    setBusy('link');
    try {
      const link = await api(`/api/bookings/${booking.id}/payment-links`, { method: 'POST', body: { milestoneId: milestoneId || undefined } });
      toast.success('Payment link ready.');
      await load();
      if (link.shortUrl) await copyText(link.shortUrl);
    } catch (e) { toast.error(e.message); } finally { setBusy(''); }
  };

  return (
    <div className="fx-card" style={{ marginTop: 'var(--nx-space-4)' }}>
      <h3 className="fx-card__title">Buyer portal & online payment</h3>
      <p className="fx-card__hint">
        {booking.buyerEmail
          ? <>The buyer signs in with <strong>{booking.buyerEmail}</strong> to see this booking, pay online and download receipts.</>
          : "Add the buyer's email to the booking to give them portal access."}
      </p>
      {booking.buyerEmail && (
        <div className="fx-row">
          <Button size="sm" icon={Copy} loading={busy === 'portal'} onClick={() => portal('copy')}>Copy portal link</Button>
          <Button size="sm" icon={MessageCircle} disabled={Boolean(busy)} onClick={() => portal('whatsapp')}>Send on WhatsApp</Button>
        </div>
      )}

      {canEdit && booking.summary.balance > 0 && (
        online ? (
          <div className="fx-row" style={{ marginTop: 'var(--nx-space-3)' }}>
            <div style={{ minWidth: 260 }}>
              <Select value={milestoneId} onChange={(e) => setMilestoneId(e.target.value)} advanceOnPick={false}
                options={[{ value: '', label: 'Next due milestone' }, ...due.map((m) => ({ value: m.id, label: `${m.name} — ${inr(m.outstanding)}` }))]} />
            </div>
            <Button size="sm" variant="primary" icon={Link2} loading={busy === 'link'} onClick={request}>Create payment link</Button>
          </div>
        ) : <p className="fx-muted" style={{ marginTop: 'var(--nx-space-3)' }}>Online payment is off. An administrator can connect Razorpay in Settings → Integrations → Buyer payments.</p>
      )}

      {links?.length > 0 && (
        <div className="fx-scroll" style={{ marginTop: 'var(--nx-space-3)' }}>
          <table className="fx-table">
            <thead><tr><th>Created</th><th>For</th><th className="num">Amount</th><th>Status</th><th /></tr></thead>
            <tbody>
              {links.map((l) => (
                <tr key={l.id}>
                  <td>{fmtDate(l.createdAt)}</td>
                  <td>{l.description}</td>
                  <td className="num">{inr(l.amount)}</td>
                  <td><Pill tone={LINK_TONE[l.status] || 'neutral'}>{l.status === 'created' ? 'Waiting' : l.status}</Pill></td>
                  <td>
                    {l.status === 'created' && l.shortUrl && (
                      <>
                        <Button variant="ghost" size="sm" icon={Copy} aria-label="Copy link" onClick={async () => toast[(await copyText(l.shortUrl)) ? 'success' : 'error']('Link copied.')} />
                        <Button variant="ghost" size="sm" icon={MessageCircle} aria-label="Send on WhatsApp" onClick={() => share(`Hello ${booking.buyerName}, please pay ${inr(l.amount)} (${l.description}) securely here: ${l.shortUrl}`)} />
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------- collections --- */

function Collections({ onOpen }) {
  const [days, setDays] = useState('30');
  const [data, setData] = useState(null);
  useEffect(() => {
    setData(null);
    api(`/api/bookings/collections?days=${days}`).then(setData).catch(() => setData({ rows: [], overdueTotal: 0, dueTotal: 0 }));
  }, [days]);

  const columns = useMemo(() => [
    { key: 'dueDate', label: 'Due', width: '120px', render: (r) => fmtDate(r.dueDate), sortValue: (r) => new Date(r.dueDate).getTime() },
    { key: 'buyerName', label: 'Buyer', render: (r) => <span className="nx-page__strong">{r.buyerName}</span> },
    { key: 'buyerMobile', label: 'Mobile', render: (r) => r.buyerMobile || '—' },
    { key: 'milestone', label: 'Milestone' },
    { key: 'outstanding', label: 'Outstanding', align: 'right', render: (r) => inr(r.outstanding), sortValue: (r) => r.outstanding },
    { key: 'overdue', label: 'State', render: (r) => (r.overdue ? <Pill tone="danger" dot>Overdue</Pill> : <Pill tone="warning" dot>Due soon</Pill>), exportValue: (r) => (r.overdue ? 'Overdue' : 'Due soon') },
  ], []);

  return (
    <>
      <div className="fx-stats">
        <Stat label="Overdue" value={inr(data?.overdueTotal)} tone={data?.overdueTotal > 0 ? 'danger' : undefined} />
        <Stat label={`Due in the next ${days} days`} value={inr(data?.dueTotal)} />
        <div className="fx-stat">
          <div className="fx-stat__label">Look ahead</div>
          <Select value={days} onChange={(e) => setDays(e.target.value)} advanceOnPick={false} aria-label="Look ahead"
            options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }]} />
        </div>
      </div>
      <DataTable
        columns={columns}
        rows={(data?.rows || []).map((r, i) => ({ ...r, id: `${r.bookingId}-${i}` }))}
        loading={!data}
        exportName="collections"
        selectable={false}
        timestamps={false}
        onRowClick={(r) => onOpen(r.bookingId)}
        emptyMessage="Nothing due. 🎉"
      />
    </>
  );
}

/* --------------------------------------------------------------- PDFs ----- */

async function costSheetPdf(b) {
  const { jsPDF, autoTable } = await loadPdfTools();
  const doc = new jsPDF();
  const p = b.project || {};
  const value = Number(b.agreementValue);
  const pct = (n) => (n != null && n !== '' ? Number(n) : 0);
  const gst = (value * pct(p.gstPercent)) / 100;
  const stamp = (value * pct(p.stampDutyPercent)) / 100;
  const reg = (value * pct(p.registrationPercent)) / 100;
  const extras = [
    ['Car parking', pct(p.parkingCharges)], ['Club house', pct(p.clubHouseCharges)],
    ['Maintenance deposit', pct(p.maintenanceCharges)], ['Corpus fund', pct(p.corpusFund)],
    ['Floor rise', pct(p.floorRiseCharges)], ['Other charges', pct(p.otherCharges)],
  ].filter(([, v]) => v > 0);
  const grand = value + gst + stamp + reg + extras.reduce((s, [, v]) => s + v, 0);
  const money = (n) => `Rs. ${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  doc.setFontSize(16); doc.text('Cost Sheet', 14, 18);
  doc.setFontSize(10);
  doc.text(`${p.projectName || ''}${b.unit?.unitNumber ? ` - Unit ${b.unit.unitNumber}` : ''}`, 14, 26);
  doc.text(`Buyer: ${b.buyerName}    Booking: ${b.id}    Date: ${fmtDate(b.bookingDate)}`, 14, 32);
  if (p.reraNumber) doc.text(`RERA: ${p.reraNumber}`, 14, 38);

  autoTable(doc, {
    startY: 44,
    head: [['Component', 'Amount']],
    body: [
      ['Agreement value', money(value)],
      ...(gst ? [[`GST (${pct(p.gstPercent)}%)`, money(gst)]] : []),
      ...(stamp ? [[`Stamp duty (${pct(p.stampDutyPercent)}%)`, money(stamp)]] : []),
      ...(reg ? [[`Registration (${pct(p.registrationPercent)}%)`, money(reg)]] : []),
      ...extras.map(([k, v]) => [k, money(v)]),
      [{ content: 'Total cost', styles: { fontStyle: 'bold' } }, { content: money(grand), styles: { fontStyle: 'bold' } }],
    ],
    columnStyles: { 1: { halign: 'right' } },
  });
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 8,
    head: [['Payment milestone', 'Due', 'Amount', 'Paid', 'Balance']],
    body: b.summary.milestones.map((m) => [m.name, fmtDate(m.dueDate), money(m.amount), money(m.paid), money(m.outstanding)]),
    columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
  });
  doc.setFontSize(8);
  doc.text('Charges, taxes and duties are indicative and subject to change as per applicable law.', 14, doc.lastAutoTable.finalY + 8);
  doc.save(`cost-sheet-${b.id}.pdf`);
}

async function receiptPdf(b, pay) {
  const { jsPDF, autoTable } = await loadPdfTools();
  const doc = new jsPDF();
  const money = (n) => `Rs. ${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  doc.setFontSize(16); doc.text('Payment Receipt', 14, 18);
  doc.setFontSize(10);
  autoTable(doc, {
    startY: 26,
    body: [
      ['Receipt no.', pay.receiptNo || pay.id],
      ['Date', fmtDate(pay.paidOn)],
      ['Received from', b.buyerName],
      ['Project / unit', `${b.project?.projectName || ''} ${b.unit?.unitNumber || ''}`],
      ['Amount', money(pay.amount)],
      ['Mode', pay.mode || '—'],
      ['Reference', pay.reference || '—'],
      ['Booking', b.id],
    ],
    theme: 'plain',
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 45 } },
  });
  doc.text(`Total received to date: ${money(b.summary.paid)} of ${money(b.summary.agreementValue)}`, 14, doc.lastAutoTable.finalY + 10);
  doc.save(`receipt-${pay.receiptNo || pay.id}.pdf`);
}
