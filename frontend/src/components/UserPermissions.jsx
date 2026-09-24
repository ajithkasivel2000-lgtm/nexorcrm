import { useCallback, useEffect, useRef, useState } from 'react';
import { ShieldCheck, Save, RotateCcw, Sparkles } from 'lucide-react';
import { Button, toast } from '../ui';
import { subscribeDataChanged } from '../utils/dataBus';
import './UserPermissions.css';

/**
 * One person's permissions, page by page.
 *
 * Assigned directly to the user — there is no role matrix behind this, so what
 * is ticked here is what is stored and what the server enforces.
 *
 * The important state is the one that is easy to miss: a user with nothing
 * configured is *unrestricted*, not denied. The banner says so, because a grid
 * of empty checkboxes would otherwise read as "this person can do nothing",
 * which is the opposite of the truth.
 *
 * Edits are local until Save — the app's manual-save rule — so a half-finished
 * grid never reaches the server.
 */
export default function UserPermissions({ userId, canEdit = false }) {
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/user-permissions/${userId}`);
      if (!res.ok) { setData({ failed: true }); return; }
      const body = await res.json();
      setData(body);
      setDraft(body.pages || {});
    } catch {
      setData({ failed: true });
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  /* Changing someone's role REPLACES their permission rows on the server
     (userController's role handler applies the new role's defaults), so after
     a promotion this grid is showing the old role's ticks until someone
     reloads the page. The shared bus already announces that write; this just
     listens for it.

     A ref rather than effect dependencies: the subscription reads the latest
     draft without re-subscribing on every tick of a checkbox. */
  const stateRef = useRef({ draft: {}, data: null });
  stateRef.current = { draft, data };

  useEffect(() => subscribeDataChanged(['users', 'user-permissions'], () => {
    const { draft: current, data: server } = stateRef.current;
    /* Unsaved edits win. Refetching under someone who is midway through
       ticking boxes would throw their work away, and this component's rule is
       that nothing reaches the server until Save. */
    const isDirty = server && !server.failed
      && JSON.stringify(current) !== JSON.stringify(server.pages || {});
    if (!isDirty) load();
  }), [load]);

  if (!data) return <p className="nx-perm__msg">Loading permissions…</p>;
  if (data.failed) return <p className="nx-perm__msg">Permissions are unavailable.</p>;

  if (data.superAdmin) {
    return (
      <div className="nx-perm__banner is-info">
        <ShieldCheck size={15} aria-hidden="true" />
        <span>
          <strong>{data.username}</strong> is the super admin and is never restricted.
          Permissions do not apply to this account.
        </span>
      </div>
    );
  }

  const get = (page, action) => Boolean(draft[page]?.[action]);

  const toggle = (page, action) => {
    if (!canEdit) return;
    setDraft((prev) => {
      const row = { ...(prev[page] || {}) };
      row[action] = !row[action];
      /* Turning off view turns off the rest: there is no meaningful "may edit
         but may not see". Turning any other action ON implies view. */
      if (action === 'view' && !row.view) {
        ['create', 'edit', 'delete', 'export'].forEach((a) => { row[a] = false; });
      } else if (action !== 'view' && row[action]) {
        row.view = true;
      }
      return { ...prev, [page]: row };
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/user-permissions/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pages: draft }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(body.message || 'Could not save permissions.'); return; }
      await load();
      toast.success('Permissions saved.');
    } catch {
      toast.error('Could not save permissions.');
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!await window.appConfirm(
      'Remove every permission row for this user?\n\nThey become unrestricted — able to reach everything, as before any permissions were set.',
    )) return;
    try {
      const res = await fetch(`/api/user-permissions/${userId}`, { method: 'DELETE' });
      if (!res.ok) { toast.error('Could not clear permissions.'); return; }
      await load();
      toast.success('This user is unrestricted again.');
    } catch {
      toast.error('Could not clear permissions.');
    }
  };

  /* Puts the user back on their role's template. Confirmed first, because it
     replaces whatever has been customised rather than adding to it. */
  const applyDefaults = async () => {
    if (!await window.appConfirm(
      `Apply the ${data.role} role's default permissions?

This replaces everything currently set for this user.`,
    )) return;
    try {
      const res = await fetch(`/api/user-permissions/${userId}/apply-role-defaults`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(body.message || 'Could not apply the defaults.'); return; }
      await load();
      toast.success(`Applied the ${data.role} defaults.`);
    } catch {
      toast.error('Could not apply the defaults.');
    }
  };

  const dirty = JSON.stringify(draft) !== JSON.stringify(data.pages || {});

  return (
    <div className="nx-perm">
      <div className={`nx-perm__banner ${data.restricted ? 'is-on' : 'is-warn'}`}>
        <ShieldCheck size={15} aria-hidden="true" />
        <span>
          {data.restricted ? (
            <>
              <strong>{data.username}</strong> is restricted to what is ticked below.
              A page with nothing ticked is closed to them.
            </>
          ) : (
            <>
              <strong>{data.username}</strong> has no permissions set, so they can currently
              reach <strong>everything</strong>. Tick the pages they should have and press
              Save — from then on, anything unticked is closed.
            </>
          )}
        </span>
      </div>

      {data.catalogue.map((group) => (
        <section key={group.name} className="nx-perm__group">
          <h3 className="nx-perm__group-title">{group.name}</h3>
          {group.pages.map((page) => (
            <div key={page.id} className="nx-perm__row">
              <div className="nx-perm__page">
                <span className="nx-perm__page-name">{page.label}</span>
                {page.note && <span className="nx-perm__page-note">{page.note}</span>}
              </div>
              <div className="nx-perm__actions">
                {page.actions.map((action) => (
                  <label
                    key={action}
                    className={`nx-perm__chip${get(page.id, action) ? ' is-on' : ''}${canEdit ? ' is-editable' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={get(page.id, action)}
                      disabled={!canEdit}
                      onChange={() => toggle(page.id, action)}
                    />
                    <span>{action}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}

      {canEdit && (
        <div className="nx-perm__bar">
          <Button variant="primary" icon={Save} loading={saving} disabled={!dirty} onClick={save}>
            {dirty ? 'Save Permissions' : 'Saved'}
          </Button>
          <Button variant="secondary" icon={Sparkles} onClick={applyDefaults}>
            Apply {data.role} defaults
          </Button>
          {data.restricted && (
            <Button variant="secondary" icon={RotateCcw} onClick={reset}>
              Remove all restrictions
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
