import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, Loader2, Trash2, UserCheck } from 'lucide-react';
import { Button, Modal, Select } from './ui';
import './DeleteUserDialog.css';

/**
 * Deleting a user, with their work handed over first.
 *
 * None of the columns naming a user is a foreign key, so the database will
 * happily delete someone who still owns forty leads and leave every one of
 * them pointing at a person who no longer exists. This makes the hand-over the
 * first step rather than an afterthought: what they hold is listed, a new
 * owner is chosen, the records move, and only then is the account removed.
 */
export default function DeleteUserDialog({ user, users = [], onClose, onDeleted }) {
  const [workload, setWorkload] = useState(null);
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState('');          // 'loading' | 'moving' | 'deleting'
  const [error, setError] = useState('');
  const [moved, setMoved] = useState(null);

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    setBusy('loading');
    setError('');
    fetch(`/api/users/${user.id}/workload`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Could not read this user’s records.'))))
      .then((data) => { if (!cancelled) { setWorkload(data); setBusy(''); } })
      .catch((err) => { if (!cancelled) { setError(err.message); setBusy(''); } });
    return () => { cancelled = true; };
  }, [user]);

  if (!user) return null;

  // Anyone but the person being deleted.
  const candidates = users.filter((u) => u.id !== user.id);
  const holdsWork = (workload?.total ?? 0) > 0;
  const needsTarget = holdsWork && !moved;

  const reassign = async () => {
    setBusy('moving');
    setError('');
    try {
      const res = await fetch(`/api/users/${user.id}/reassign`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toUserId: target }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'The hand-over failed.');
      setMoved(data);
      setWorkload((w) => ({ ...w, total: 0, items: [] }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const remove = async () => {
    setBusy('deleting');
    setError('');
    try {
      const res = await fetch(`/api/users/${user.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'The account could not be deleted.');
      onDeleted?.(user);
    } catch (err) {
      setError(err.message);
      setBusy('');
    }
  };

  return (
    <Modal
      open
      onClose={busy ? undefined : onClose}
      title={`Delete ${user.username}`}
      description="Their records move to another user before the account is removed."
      size="md"
      footer={(
        <div className="dud__actions">
          <Button variant="secondary" onClick={onClose} disabled={!!busy}>Cancel</Button>

          {needsTarget ? (
            <Button variant="primary" onClick={reassign} disabled={!target || busy === 'moving'}>
              {busy === 'moving'
                ? <><Loader2 size={15} className="dud__spin" /> Moving…</>
                : <>Hand over <ArrowRight size={15} /></>}
            </Button>
          ) : (
            <Button variant="danger" onClick={remove} disabled={!!busy || holdsWork}>
              {busy === 'deleting'
                ? <><Loader2 size={15} className="dud__spin" /> Deleting…</>
                : <><Trash2 size={15} /> Delete {user.username}</>}
            </Button>
          )}
        </div>
      )}
    >
      <div className="dud">
        {busy === 'loading' && (
          <p className="dud__loading"><Loader2 size={16} className="dud__spin" /> Checking what this user holds…</p>
        )}

        {workload && holdsWork && (
          <>
            <div className="dud__warning">
              <AlertTriangle size={17} />
              <div>
                <strong>{user.username} still holds {workload.total} record{workload.total === 1 ? '' : 's'}.</strong>
                <p>
                  Nothing here is linked by the database, so deleting the account would leave
                  every one of these pointing at somebody who no longer exists. Hand them over first.
                </p>
              </div>
            </div>

            <ul className="dud__list">
              {workload.items.map((item) => (
                <li key={`${item.model}.${item.field}`}>
                  <span>{item.label}</span>
                  <strong>{item.count}</strong>
                </li>
              ))}
            </ul>

            <div className="dud__field">
              <span className="dud__label">Hand everything to</span>
              <Select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="Choose a user"
                options={candidates.map((u) => ({
                  value: u.id,
                  label: `${u.username}${u.status ? ` — ${u.status}` : ''}`,
                }))}
              />
            </div>
          </>
        )}

        {moved && (
          <div className="dud__done">
            <UserCheck size={17} />
            <div>
              <strong>Moved {moved.total} record{moved.total === 1 ? '' : 's'} to {moved.to}.</strong>
              <p>{user.username} no longer holds anything and can be deleted.</p>
            </div>
          </div>
        )}

        {workload && !holdsWork && !moved && (
          <p className="dud__clear">
            {user.username} holds no leads, opportunities, partners or properties.
            The account can be deleted safely.
          </p>
        )}

        {error && <p className="dud__error" role="alert">{error}</p>}
      </div>

    </Modal>
  );
}
