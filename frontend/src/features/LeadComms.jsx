import { useCallback, useEffect, useRef, useState } from 'react';
import { FileDown, MessageCircle, Paperclip, Phone, Send, Trash2, Upload } from 'lucide-react';
import { Button, Field, Input, Pill, Select, Textarea, toast } from '../ui';
import { subscribeDataChanged } from '../utils/dataBus';
import { api, fmtDate, readAsDataUrl } from './api';
import './features.css';

/**
 * Talking to a lead from its record: the WhatsApp conversation, a Call button
 * (Exotel rings your phone, then connects the lead) and the call history.
 * Backed by /api/leads/:id/whatsapp and /api/leads/:id/call(s).
 */
export function LeadConversations({ leadId, mobile, readOnly = false }) {
  const [messages, setMessages] = useState(null);
  const [calls, setCalls] = useState([]);
  const [text, setText] = useState('');
  const [template, setTemplate] = useState({ name: '', language: 'en', params: '' });
  const [mode, setMode] = useState('text');
  const [busy, setBusy] = useState(false);
  const threadRef = useRef(null);

  const load = useCallback(() => {
    api(`/api/leads/${leadId}/whatsapp`).then(setMessages).catch(() => setMessages([]));
    api(`/api/leads/${leadId}/calls`).then(setCalls).catch(() => setCalls([]));
  }, [leadId]);
  useEffect(() => { load(); return subscribeDataChanged(['leads', 'notifications'], load); }, [load]);
  useEffect(() => { if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight; }, [messages]);

  const send = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = mode === 'text'
        ? { text }
        : { template: template.name.trim(), language: template.language.trim() || 'en', params: template.params.split('|').map((s) => s.trim()).filter(Boolean) };
      await api(`/api/leads/${leadId}/whatsapp`, { method: 'POST', body });
      setText('');
      load();
    } catch (err) {
      toast.error(err.message);
      load();
    } finally {
      setBusy(false);
    }
  };

  const call = async () => {
    setBusy(true);
    try {
      const r = await api(`/api/leads/${leadId}/call`, { method: 'POST' });
      toast.success(r.message || 'Calling…');
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const waLink = mobile ? `https://wa.me/${String(mobile).replace(/\D/g, '').replace(/^(\d{10})$/, '91$1')}` : null;

  return (
    <>
      <section className="nx-rec-card">
        <header className="nx-rec-card__head">
          <span className="nx-rec-card__icon"><MessageCircle size={16} /></span>
          <div className="nx-rec-card__titles">
            <h2 className="nx-rec-card__title">WhatsApp</h2>
            <p className="nx-rec-card__sub">Messages sent from the CRM and replies from the customer</p>
          </div>
        </header>
        <div className="nx-rec-card__body">
          <div className="fx-thread" ref={threadRef} aria-live="polite">
            {messages === null && <p className="fx-muted">Loading…</p>}
            {messages?.length === 0 && <p className="fx-muted">No WhatsApp messages yet.</p>}
            {messages?.map((m) => (
              <div key={m.id} className={`fx-bubble fx-bubble--${m.direction === 'in' ? 'in' : 'out'}`}>
                {m.template ? <em>Template: {m.template}</em> : m.body}
                <span className="fx-bubble__meta">
                  {new Date(m.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                  {m.direction === 'out' && ` · ${m.sentBy || ''} · ${m.status}`}
                  {m.error && <span className="fx-error"> — {m.error}</span>}
                </span>
              </div>
            ))}
          </div>
          {!readOnly && (
            <form onSubmit={send} style={{ marginTop: 'var(--nx-space-3)' }}>
              <div className="fx-row" style={{ marginBottom: 'var(--nx-space-2)' }}>
                <Select value={mode} onChange={(e) => setMode(e.target.value)} advanceOnPick={false} aria-label="Message type"
                  options={[{ value: 'text', label: 'Message' }, { value: 'template', label: 'Approved template' }]} />
                <span className="fx-muted">Free text works within 24 hours of the customer's last message; after that, send an approved template.</span>
              </div>
              {mode === 'text' ? (
                <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message…" aria-label="Message" />
              ) : (
                <div className="fx-row">
                  <Field label="Template name"><Input value={template.name} onChange={(e) => setTemplate((t) => ({ ...t, name: e.target.value }))} placeholder="site_visit_confirmation" /></Field>
                  <Field label="Language"><Input value={template.language} onChange={(e) => setTemplate((t) => ({ ...t, language: e.target.value }))} /></Field>
                  <Field label="Values ({{1}}|{{2}}…)" className="fx-grow"><Input value={template.params} onChange={(e) => setTemplate((t) => ({ ...t, params: e.target.value }))} placeholder="Ravi|Saturday 11am" /></Field>
                </div>
              )}
              <div className="fx-card__actions">
                <Button variant="primary" type="submit" icon={Send} loading={busy} disabled={mode === 'text' ? !text.trim() : !template.name.trim()}>Send on WhatsApp</Button>
                {waLink && <a className="nx-btn nx-btn--secondary nx-btn--md" href={waLink} target="_blank" rel="noreferrer">Open in WhatsApp</a>}
              </div>
            </form>
          )}
        </div>
      </section>

      <section className="nx-rec-card">
        <header className="nx-rec-card__head">
          <span className="nx-rec-card__icon"><Phone size={16} /></span>
          <div className="nx-rec-card__titles">
            <h2 className="nx-rec-card__title">Calls</h2>
            <p className="nx-rec-card__sub">Click-to-call rings your mobile first, then connects the lead. Calls are recorded.</p>
          </div>
          {!readOnly && <Button variant="primary" size="sm" icon={Phone} loading={busy} onClick={call}>Call lead</Button>}
        </header>
        <div className="nx-rec-card__body">
          {calls.length === 0 ? <p className="fx-muted">No calls placed from the CRM yet.</p> : (
            <div className="fx-scroll">
              <table className="fx-table">
                <thead><tr><th>When</th><th>Status</th><th className="num">Duration</th><th>Recording</th></tr></thead>
                <tbody>
                  {calls.map((c) => (
                    <tr key={c.id}>
                      <td>{new Date(c.startedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                      <td><Pill tone={c.status === 'completed' ? 'success' : ['failed', 'busy', 'no-answer'].includes(c.status) ? 'danger' : 'info'}>{c.status}</Pill></td>
                      <td className="num">{c.durationSec ? `${Math.floor(c.durationSec / 60)}m ${c.durationSec % 60}s` : '—'}</td>
                      <td>{c.recordingUrl ? <a href={c.recordingUrl} target="_blank" rel="noreferrer">Listen</a> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

/**
 * Files on a record (lead, opportunity, customer, project): upload, download,
 * delete. Stored on disk or S3 by the server; access follows the record.
 */
export function RecordDocuments({ entityType, entityId, readOnly = false }) {
  const [docs, setDocs] = useState(null);
  const [category, setCategory] = useState('Other');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const load = useCallback(() => api(`/api/records/${entityType}/${entityId}/documents`).then(setDocs).catch(() => setDocs([])), [entityType, entityId]);
  useEffect(() => { load(); }, [load]);

  const upload = async (file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error('Files must be under 10MB.'); return; }
    setBusy(true);
    try {
      const dataUrl = await readAsDataUrl(file);
      await api(`/api/records/${entityType}/${entityId}/documents/upload`, { method: 'POST', body: { fileName: file.name, category, dataUrl } });
      toast.success('Uploaded.');
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const download = async (doc) => {
    try {
      const res = await fetch(`/api/documents/${doc.id}/download`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Download failed.');
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url; a.download = doc.fileName; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <section className="nx-rec-card">
      <header className="nx-rec-card__head">
        <span className="nx-rec-card__icon"><Paperclip size={16} /></span>
        <div className="nx-rec-card__titles">
          <h2 className="nx-rec-card__title">Documents</h2>
          <p className="nx-rec-card__sub">Agreements, KYC, brochures — PDF, images, Word, Excel. Up to 10MB each.</p>
        </div>
      </header>
      <div className="nx-rec-card__body">
        {!readOnly && (
          <div className="fx-row" style={{ marginBottom: 'var(--nx-space-3)' }}>
            <Select value={category} onChange={(e) => setCategory(e.target.value)} advanceOnPick={false} aria-label="Category"
              options={['Agreement', 'KYC', 'Payment proof', 'Brochure', 'Other']} />
            <input ref={fileRef} type="file" hidden onChange={(e) => upload(e.target.files?.[0])}
              accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.doc,.docx,.xls,.xlsx,.csv,.txt" />
            <Button icon={Upload} loading={busy} onClick={() => fileRef.current?.click()}>Upload file</Button>
          </div>
        )}
        {docs === null && <p className="fx-muted">Loading…</p>}
        {docs?.length === 0 && <p className="fx-muted">No documents yet.</p>}
        {docs?.length > 0 && (
          <div className="fx-scroll">
            <table className="fx-table">
              <thead><tr><th>File</th><th>Category</th><th>Uploaded</th><th className="num">Size</th><th /></tr></thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id}>
                    <td className="nx-page__strong">{d.fileName}</td>
                    <td>{d.category || '—'}</td>
                    <td>{fmtDate(d.createdAt)} {d.uploadedBy ? `· ${d.uploadedBy}` : ''}</td>
                    <td className="num">{d.size ? `${Math.max(1, Math.round(d.size / 1024))} KB` : '—'}</td>
                    <td>
                      <Button variant="ghost" size="sm" icon={FileDown} aria-label="Download" onClick={() => download(d)} />
                      {!readOnly && (
                        <Button variant="ghost" size="sm" icon={Trash2} aria-label="Delete" onClick={async () => {
                          if (!await window.appConfirm(`Delete ${d.fileName}?`)) return;
                          try { await api(`/api/records/${entityType}/${entityId}/documents/${d.id}`, { method: 'DELETE' }); load(); } catch (err) { toast.error(err.message); }
                        }} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
