import { useCallback, useEffect, useState } from 'react';
import { Building2, CheckCircle2, CreditCard, FileDown, FileText, LogOut, Mail } from 'lucide-react';
import { Button, Field, Input, Pill, toast } from '../ui';
import loadPdfTools from '../utils/loadPdfTools';
import { inr, fmtDate } from './api';
import './features.css';
import './BuyerPortal.css';

/**
 * The buyer portal at /portal?company=<slug>.
 *
 * Buyers sign in with a one-time link sent to the email on their booking (or
 * sent by the sales team on WhatsApp). They see each booking's payment plan,
 * pay a milestone online through Razorpay, and download receipts and the
 * documents the builder shared. It has nothing to do with a staff sign-in and
 * uses its own token (X-Buyer-Token).
 */

const STORE = 'nx.buyerPortal';
const readStore = () => { try { return JSON.parse(localStorage.getItem(STORE) || 'null'); } catch { return null; } };
const writeStore = (v) => { try { if (v) localStorage.setItem(STORE, JSON.stringify(v)); else localStorage.removeItem(STORE); } catch { /* private window */ } };

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Buyer-Token': token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.message || 'Something went wrong.'), { status: res.status });
  return data;
}

export default function BuyerPortal() {
  const params = new URLSearchParams(window.location.search);
  const [session, setSession] = useState(() => {
    const saved = readStore();
    const slug = params.get('company');
    return saved && (!slug || saved.slug === slug) ? saved : null;
  });
  const [slug] = useState(() => params.get('company') || readStore()?.slug || '');
  const [linkToken] = useState(() => params.get('token'));
  const [paid] = useState(() => params.get('razorpay_payment_link_status') === 'paid');
  const [branding, setBranding] = useState(null);
  const [error, setError] = useState('');
  const [exchanging, setExchanging] = useState(Boolean(linkToken));

  useEffect(() => {
    // Nothing sensitive stays in the address bar.
    if (window.location.search) window.history.replaceState({}, document.title, `/portal${slug ? `?company=${encodeURIComponent(slug)}` : ''}`);
    if (slug) fetch(`/api/public/branding?company=${encodeURIComponent(slug)}`).then((r) => r.json()).then(setBranding).catch(() => {});
    if (!linkToken) return;
    call('/api/buyer/sign-in', { method: 'POST', body: { token: linkToken } })
      .then((r) => { const s = { token: r.token, email: r.email, slug }; writeStore(s); setSession(s); })
      .catch((e) => setError(e.message))
      .finally(() => setExchanging(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const color = branding?.brandColor;
    if (color) document.documentElement.style.setProperty('--nx-accent', color);
    document.title = `${branding?.name || 'Buyer'} portal`;
  }, [branding]);

  const expired = useCallback(() => { writeStore(null); setSession(null); setError('Your session has ended. Ask for a new link.'); }, []);

  const signOut = async () => {
    if (session) await call('/api/buyer/sign-out', { method: 'POST', token: session.token }).catch(() => {});
    writeStore(null);
    setSession(null);
  };

  return (
    <div className="nx-scope bp">
      <header className="bp-head">
        <div className="bp-brand">
          {branding?.logoUrl ? <img src={branding.logoUrl} alt="" /> : <Building2 size={28} aria-hidden />}
          <strong>{branding?.name || 'Buyer portal'}</strong>
        </div>
        {session && <Button variant="ghost" size="sm" icon={LogOut} onClick={signOut}>Sign out</Button>}
      </header>
      <main className="bp-main">
        {exchanging && <p className="fx-muted">Signing you in…</p>}
        {!exchanging && !session && <SignIn slug={slug} error={error} />}
        {!exchanging && session && <Dashboard session={session} justPaid={paid} onExpired={expired} />}
      </main>
    </div>
  );
}

function SignIn({ slug, error }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState('');
  const [busy, setBusy] = useState(false);
  if (!slug) {
    return <div className="fx-card bp-card"><h2>Buyer portal</h2><p className="fx-muted">Open the portal from the link your builder sent you.</p></div>;
  }
  return (
    <form className="fx-card bp-card" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true);
      try { setSent((await call('/api/buyer/request-link', { method: 'POST', body: { company: slug, email } })).message); } catch (err) { toast.error(err.message); } finally { setBusy(false); }
    }}>
      <h2>Sign in to your buyer portal</h2>
      <p className="fx-muted">See your payment plan, pay online and download receipts. Enter the email address on your booking and we will email you a sign-in link.</p>
      {error && <p className="fx-error">{error}</p>}
      {sent ? <p className="bp-sent"><Mail size={18} aria-hidden /> {sent}</p> : (
        <>
          <Field label="Email address" required><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field>
          <Button variant="primary" type="submit" loading={busy} style={{ marginTop: 'var(--nx-space-3)' }}>Email me a sign-in link</Button>
        </>
      )}
    </form>
  );
}

function Dashboard({ session, justPaid, onExpired }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => call('/api/buyer/me', { token: session.token })
    .then(setData)
    .catch((e) => (e.status === 401 ? onExpired() : setError(e.message))), [session.token, onExpired]);
  useEffect(() => { load(); }, [load]);

  // Razorpay tells us about the payment a moment after the buyer comes back.
  useEffect(() => {
    if (!justPaid) return undefined;
    const timers = [4000, 10000, 20000].map((ms) => setTimeout(load, ms));
    return () => timers.forEach(clearTimeout);
  }, [justPaid, load]);

  if (error) return <p className="fx-error">{error}</p>;
  if (!data) return <p className="fx-muted">Loading your bookings…</p>;
  return (
    <>
      {justPaid && <div className="fx-card bp-paid"><CheckCircle2 size={20} aria-hidden /> Thank you, your payment was successful. It will show below within a minute, and a receipt is on its way to your email.</div>}
      <p className="fx-muted">Signed in as <strong>{data.email}</strong></p>
      {data.bookings.length === 0 && <div className="fx-card bp-card"><p>There are no active bookings under this email. If you think this is wrong, contact {data.company.name}{data.company.phone ? ` on ${data.company.phone}` : ''}.</p></div>}
      {data.bookings.map((b) => <BookingCard key={b.id} booking={b} data={data} token={session.token} />)}
      {(data.company.phone || data.company.email) && (
        <p className="fx-muted bp-contact">Questions? Contact {data.company.name}{data.company.phone ? ` · ${data.company.phone}` : ''}{data.company.email ? ` · ${data.company.email}` : ''}</p>
      )}
    </>
  );
}

function BookingCard({ booking: b, data, token }) {
  const [busy, setBusy] = useState('');
  const s = b.summary;
  const next = s.milestones.find((m) => m.outstanding > 0) || null;
  const unitLine = [b.unit?.building, b.unit?.number && `Unit ${b.unit.number}`, b.unit?.floor != null && `Floor ${b.unit.floor}`, b.unit?.type].filter(Boolean).join(' · ');

  const pay = async (milestoneId) => {
    setBusy(milestoneId);
    try {
      const r = await call(`/api/buyer/bookings/${b.id}/pay`, { method: 'POST', body: { milestoneId }, token });
      window.location.href = r.shortUrl;
    } catch (e) { toast.error(e.message); setBusy(''); }
  };

  const download = async (doc) => {
    try {
      const res = await fetch(`/api/buyer/documents/${doc.id}`, { headers: { 'X-Buyer-Token': token } });
      if (!res.ok) throw new Error('Could not download the file.');
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url; a.download = doc.fileName; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) { toast.error(e.message); }
  };

  return (
    <section className="fx-card bp-booking">
      <div className="bp-booking__head">
        <div>
          <h2>{b.project?.name || 'Your home'}</h2>
          <p className="fx-muted">{unitLine}{b.project?.location ? ` · ${b.project.location}` : ''}</p>
        </div>
        <Pill tone="info">{b.status}</Pill>
      </div>
      <div className="fx-stats">
        <div className="fx-stat"><div className="fx-stat__label">Agreement value</div><div className="fx-stat__value">{inr(s.agreementValue)}</div></div>
        <div className="fx-stat"><div className="fx-stat__label">Paid</div><div className="fx-stat__value">{inr(s.paid)}</div></div>
        <div className="fx-stat"><div className="fx-stat__label">Balance</div><div className="fx-stat__value">{inr(s.balance)}</div></div>
        {s.overdue > 0 && <div className="fx-stat"><div className="fx-stat__label">Overdue</div><div className="fx-stat__value" style={{ color: 'var(--nx-danger)' }}>{inr(s.overdue)}</div></div>}
      </div>
      <div className="fx-progress" aria-label={`${s.percentPaid}% paid`}><span style={{ width: `${Math.min(100, s.percentPaid)}%` }} /></div>
      <p className="fx-muted">{s.percentPaid}% paid · Booking {b.id} · {fmtDate(b.bookingDate)}</p>

      {data.onlinePayments && next && (
        <div className="bp-next">
          <div>
            <div className="fx-muted">{next.overdue ? 'Overdue' : 'Next payment'}: {next.name}{next.dueDate ? ` · due ${fmtDate(next.dueDate)}` : ''}</div>
            <strong>{inr(next.outstanding)}</strong>
          </div>
          <Button variant="primary" icon={CreditCard} loading={busy === next.id} disabled={Boolean(busy)} onClick={() => pay(next.id)}>Pay now</Button>
        </div>
      )}

      <h3 className="fx-card__title">Payment plan</h3>
      <div className="fx-scroll">
        <table className="fx-table">
          <thead><tr><th>Milestone</th><th>Due</th><th className="num bp-hide-sm">Amount</th><th className="num">Outstanding</th><th /></tr></thead>
          <tbody>
            {s.milestones.map((m) => (
              <tr key={m.id}>
                <td>{m.name}</td>
                <td>{fmtDate(m.dueDate)}</td>
                <td className="num bp-hide-sm">{inr(m.amount)}</td>
                <td className="num">{inr(m.outstanding)}</td>
                <td className="bp-action">
                  {m.outstanding <= 0 ? <Pill tone="success">Paid</Pill>
                    : data.onlinePayments
                      ? <Button size="sm" variant={m.id === next?.id ? 'primary' : 'secondary'} icon={CreditCard} loading={busy === m.id} disabled={Boolean(busy)} onClick={() => pay(m.id)}>Pay</Button>
                      : m.overdue ? <Pill tone="danger">Overdue</Pill> : <Pill>Due</Pill>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="fx-card__title">Receipts</h3>
      {b.payments.length === 0 ? <p className="fx-muted">No payments yet.</p> : (
        <div className="fx-scroll">
          <table className="fx-table">
            <thead><tr><th>Date</th><th>Receipt</th><th>Mode</th><th className="num">Amount</th><th /></tr></thead>
            <tbody>
              {b.payments.map((p) => (
                <tr key={p.id}>
                  <td>{fmtDate(p.paidOn)}</td>
                  <td>{p.receiptNo || '—'}</td>
                  <td>{p.mode || '—'}</td>
                  <td className="num">{inr(p.amount)}</td>
                  <td><Button size="sm" variant="ghost" icon={FileDown} aria-label="Download receipt" onClick={() => receiptPdf(data.company, b, p).catch((e) => toast.error(e.message))} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {b.documents.length > 0 && (
        <>
          <h3 className="fx-card__title">Documents</h3>
          <ul className="bp-docs">
            {b.documents.map((d) => (
              <li key={d.id}>
                <FileText size={16} aria-hidden />
                <span>{d.fileName}{d.category ? <span className="fx-muted"> · {d.category}</span> : null}</span>
                <Button size="sm" variant="ghost" icon={FileDown} onClick={() => download(d)}>Download</Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

async function receiptPdf(company, booking, p) {
  const { jsPDF, autoTable } = await loadPdfTools();
  const doc = new jsPDF();
  const money = (n) => `Rs. ${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  doc.setFontSize(16); doc.text(company.name, 14, 18);
  doc.setFontSize(12); doc.text('Payment receipt', 14, 27);
  doc.setFontSize(10);
  autoTable(doc, {
    startY: 34,
    body: [
      ['Receipt no.', p.receiptNo || '-'],
      ['Date', fmtDate(p.paidOn)],
      ['Received from', booking.buyerName],
      ['Booking', `${booking.id}${booking.project ? ` · ${booking.project.name}` : ''}${booking.unit?.number ? ` · Unit ${booking.unit.number}` : ''}`],
      ['Mode', p.mode || '-'],
      ['Reference', p.reference || '-'],
      [{ content: 'Amount', styles: { fontStyle: 'bold' } }, { content: money(p.amount), styles: { fontStyle: 'bold' } }],
    ],
    theme: 'grid',
    columnStyles: { 0: { cellWidth: 45 } },
  });
  doc.text('This is a computer-generated receipt.', 14, doc.lastAutoTable.finalY + 10);
  doc.save(`${p.receiptNo || 'receipt'}.pdf`);
}
