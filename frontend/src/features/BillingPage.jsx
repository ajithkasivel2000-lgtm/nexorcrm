import { useCallback, useEffect, useState } from 'react';
import { Check, FileDown } from 'lucide-react';
import { Button, DataTable, Field, FormGrid, Input, Page, Pill, Textarea, toast } from '../ui';
import loadPdfTools from '../utils/loadPdfTools';
import { api, fmtDate } from './api';
import './features.css';

/**
 * Settings → Billing & Plan (company administrators): the subscription, the
 * plans on offer with Cashfree checkout, invoices with GST PDFs, and the
 * billing details printed on them.
 */

const rupees = (paise) => `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const STATE = {
  internal: ['Internal — not billed', 'success'],
  active: ['Active', 'success'],
  trialing: ['Free trial', 'info'],
  past_due: ['Payment failed', 'warning'],
  cancelled: ['Cancelled', 'warning'],
  expired: ['Expired', 'danger'],
};

function loadCheckout() {
  if (window.Cashfree) return Promise.resolve(window.Cashfree);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
    s.onload = () => resolve(window.Cashfree);
    s.onerror = () => reject(new Error('Could not load Cashfree checkout. Check your connection.'));
    document.body.appendChild(s);
  });
}

/* Checked before anything loads: without it the page mounted for a moment
   while permissions loaded, and its refused requests surfaced as error pop-ups. */
export default function BillingPage() {
  const allowed = ["Admin", "superadmin"].includes(localStorage.getItem('userStatus'));
  if (!allowed) return <Page title="Billing & Plan"><p className="fx-muted">Only administrators can manage billing.</p></Page>;
  return <BillingPageInner />;
}

function BillingPageInner() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const load = useCallback(() => api('/api/billing').then(setData).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const choose = async (plan) => {
    if (String(data?.company?.phone || '').replace(/\D/g, '').length < 10) {
      toast.error('Add a valid 10-digit phone number in Billing details before choosing a plan.');
      document.getElementById('billing-phone')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.setTimeout(() => document.getElementById('billing-phone')?.focus(), 250);
      return;
    }
    setBusy(plan.key);
    try {
      const checkout = await api('/api/billing/subscribe', { method: 'POST', body: { planKey: plan.key } });
      const Cashfree = await loadCheckout();
      const cashfree = Cashfree({ mode: checkout.mode });
      sessionStorage.setItem('cashfreeSubscriptionId', checkout.subscriptionId);
      const result = await cashfree.checkout({
        subsSessionId: checkout.subscriptionSessionId,
        redirectTarget: '_self',
      });
      if (result?.error) {
        sessionStorage.removeItem('cashfreeSubscriptionId');
        throw new Error(result.error.message || 'Cashfree checkout was not completed.');
      }
      const verified = await api('/api/billing/verify', {
        method: 'POST',
        body: { subscriptionId: checkout.subscriptionId },
      });
      if (verified.pending) toast.info(verified.message);
      else {
        sessionStorage.removeItem('cashfreeSubscriptionId');
        toast.success(verified.message);
      }
      await load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy('');
    }
  };

  if (error) return <Page title="Billing & Plan"><p className="fx-error">{error}</p></Page>;
  if (!data) return <Page title="Billing & Plan"><p className="fx-muted">Loading…</p></Page>;

  const [label, tone] = STATE[data.access?.state || data.status] || [data.status, 'neutral'];
  const internal = data.status === 'internal';

  return (
    <Page title="Billing & Plan" subtitle="Your NexorCRM subscription, invoices and billing details.">
      <div className="nx-scope">
        <div className="fx-stats">
          <div className="fx-stat">
            <div className="fx-stat__label">Status</div>
            <div className="fx-stat__value" style={{ fontSize: 'var(--nx-text-lg)' }}><Pill tone={tone} dot>{label}</Pill></div>
          </div>
          <div className="fx-stat">
            <div className="fx-stat__label">Plan</div>
            <div className="fx-stat__value" style={{ fontSize: 'var(--nx-text-lg)' }}>{internal ? '—' : (data.plan?.name || 'Not chosen')}</div>
          </div>
          <div className="fx-stat">
            <div className="fx-stat__label">{data.status === 'trialing' ? 'Trial ends' : 'Paid until'}</div>
            <div className="fx-stat__value" style={{ fontSize: 'var(--nx-text-lg)' }}>
              {internal ? '—' : fmtDate(data.trialEndsAt || data.currentPeriodEnd)}
              {data.access?.daysLeft != null && <span className="fx-muted"> ({data.access.daysLeft} days)</span>}
            </div>
          </div>
          <div className="fx-stat">
            <div className="fx-stat__label">Users</div>
            <div className="fx-stat__value" style={{ fontSize: 'var(--nx-text-lg)' }}>{data.seats.used}{data.seats.limit ? ` / ${data.seats.limit}` : ' (unlimited)'}</div>
          </div>
        </div>

        {data.access && !data.access.allowed && (
          <div className="fx-card" style={{ borderColor: 'var(--nx-danger)' }}>
            <h3 className="fx-card__title">{data.access.reason}</h3>
            <p className="fx-card__hint">Your data is safe. Choose a plan below and everyone gets back in straight away.</p>
          </div>
        )}

        {!internal && (
          <>
            <h3 className="fx-card__title">Plans</h3>
            {!data.onlinePayments && (
              <p className="fx-muted">
                Cashfree Sandbox isn’t configured on this backend. Add your test
                <code> CASHFREE_APP_ID </code> and <code>CASHFREE_SECRET_KEY</code> to
                <code> backend/.env</code>, then restart the backend. Don’t use production keys for local testing.
              </p>
            )}
            {data.onlinePayments && String(data.company.phone || '').replace(/\D/g, '').length < 10 && (
              <p className="fx-error" role="alert">Add a 10-digit billing phone number below before starting Cashfree checkout.</p>
            )}
            <div className="fx-stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
              {data.plans.map((plan) => {
                const current = data.plan?.key === plan.key && data.status === 'active';
                return (
                  <div key={plan.key} className="fx-stat" style={current ? { borderColor: 'var(--nx-accent)', boxShadow: 'var(--nx-shadow)' } : undefined}>
                    <div className="fx-stat__label">{plan.name}</div>
                    <div className="fx-stat__value">{rupees(plan.pricePaise)}<span className="fx-muted"> /month + {plan.gstPercent}% GST</span></div>
                    <p className="fx-muted" style={{ margin: 'var(--nx-space-2) 0' }}>{plan.maxUsers ? `Up to ${plan.maxUsers} users` : 'Unlimited users'} · {plan.description}</p>
                    <ul style={{ margin: '0 0 var(--nx-space-3)', paddingLeft: 18, fontSize: 'var(--nx-text-sm)', color: 'var(--nx-text-secondary)' }}>
                      {/* Keyed by position, not text: the same feature text can
                          legitimately appear twice and a text key then collides. */}
                      {plan.features.map((f, i) => <li key={i}>{f}</li>)}
                    </ul>
                    {current
                      ? <Pill tone="success" dot>Current plan</Pill>
                      : <Button variant="primary" icon={Check} loading={busy === plan.key} disabled={!data.onlinePayments || Boolean(busy)} onClick={() => choose(plan)}>Choose {plan.name}</Button>}
                  </div>
                );
              })}
            </div>
            {data.status === 'active' && (
              <Button variant="danger" onClick={async () => {
                if (!await window.appConfirm('Stop renewing? You keep access until the end of the period you have paid for.')) return;
                try { toast.success((await api('/api/billing/cancel', { method: 'POST' })).message); load(); } catch (e) { toast.error(e.message); }
              }}>Cancel subscription</Button>
            )}
          </>
        )}

        <h3 className="fx-card__title" style={{ marginTop: 'var(--nx-space-6)' }}>Invoices</h3>
        <DataTable
          columns={[
            { key: 'number', label: 'Invoice', render: (r) => <span className="nx-page__id">{r.number}</span> },
            { key: 'createdAt', label: 'Date', render: (r) => fmtDate(r.paidAt || r.createdAt) },
            { key: 'description', label: 'For' },
            { key: 'totalPaise', label: 'Total', align: 'right', render: (r) => rupees(r.totalPaise) },
            { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'paid' ? 'success' : 'warning'}>{r.status}</Pill> },
          ]}
          rows={data.invoices}
          selectable={false}
          timestamps={false}
          emptyMessage="No invoices yet."
          actions={(r) => <Button size="sm" variant="ghost" icon={FileDown} aria-label="Download invoice" onClick={() => invoicePdf(r, data.company).catch((e) => toast.error(e.message))} />}
        />

        <BillingDetails company={data.company} onSaved={load} />
      </div>
    </Page>
  );
}

function BillingDetails({ company, onSaved }) {
  const [form, setForm] = useState({
    legalName: company.legalName || '', gstin: company.gstin || '', billingAddress: company.billingAddress || '',
    billingEmail: company.billingEmail || '', phone: company.phone || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <form className="fx-card" style={{ marginTop: 'var(--nx-space-6)' }} onSubmit={async (e) => {
      e.preventDefault(); setSaving(true);
      try { toast.success((await api('/api/billing/details', { method: 'PUT', body: form })).message); onSaved(); } catch (err) { toast.error(err.message); } finally { setSaving(false); }
    }}>
      <h3 className="fx-card__title">Billing details</h3>
      <p className="fx-card__hint">Printed on your GST invoices.</p>
      <FormGrid columns={2}>
        <Field label="Legal name"><Input value={form.legalName} onChange={set('legalName')} placeholder={company.name} /></Field>
        <Field label="GSTIN"><Input value={form.gstin} onChange={set('gstin')} placeholder="29ABCDE1234F1Z5" /></Field>
        <Field label="Billing email"><Input type="email" value={form.billingEmail} onChange={set('billingEmail')} /></Field>
        <Field label="Phone (required for Cashfree)" hint="Enter a number with at least 10 digits. Include the country code if needed.">
          <Input id="billing-phone" type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} />
        </Field>
        <Field label="Billing address" className="nx-field--full"><Textarea rows={3} value={form.billingAddress} onChange={set('billingAddress')} /></Field>
      </FormGrid>
      <div className="fx-card__actions"><Button variant="primary" type="submit" loading={saving}>Save details</Button></div>
    </form>
  );
}

async function invoicePdf(inv, company) {
  const { jsPDF, autoTable } = await loadPdfTools();
  const doc = new jsPDF();
  const money = (paise) => `Rs. ${(Number(paise) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const gst = inv.totalPaise - inv.amountPaise;
  doc.setFontSize(18); doc.text('Tax Invoice', 14, 20);
  doc.setFontSize(10);
  doc.text(`Invoice: ${inv.number}`, 14, 30);
  doc.text(`Date: ${fmtDate(inv.paidAt || inv.createdAt)}`, 14, 36);
  doc.text('Billed to:', 120, 30);
  const to = [company.legalName || company.name, company.gstin ? `GSTIN: ${company.gstin}` : null, ...(company.billingAddress || '').split('\n')].filter(Boolean);
  to.forEach((line, i) => doc.text(String(line).slice(0, 60), 120, 36 + i * 6));
  autoTable(doc, {
    startY: 36 + Math.max(2, to.length) * 6 + 6,
    head: [['Description', 'Amount']],
    body: [
      [inv.description, money(inv.amountPaise)],
      [`GST @ ${Number(inv.gstPercent)}%`, money(gst)],
      [{ content: 'Total', styles: { fontStyle: 'bold' } }, { content: money(inv.totalPaise), styles: { fontStyle: 'bold' } }],
    ],
    columnStyles: { 1: { halign: 'right' } },
  });
  doc.text(`Status: ${inv.status.toUpperCase()}${inv.gatewayPaymentId ? `   Payment ref: ${inv.gatewayPaymentId}` : ''}`, 14, doc.lastAutoTable.finalY + 10);
  doc.save(`${inv.number}.pdf`);
}
