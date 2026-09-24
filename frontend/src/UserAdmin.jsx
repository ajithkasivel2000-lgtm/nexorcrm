import { useCallback, useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { subscribeDataChanged } from './utils/dataBus';
import UserAdminList from './UserAdminList';
import UserAdminEdit from './UserAdminEdit';
import './UserAdmin.css';

/* Two routes, one component: /settings/user-admin is the list and
   /settings/user-admin/edit/:id is the 360 page. The view used to be local
   state, so editing a user left the URL on the list — the page could not be
   linked, bookmarked, opened in a new tab, or backed out of with the browser's
   own Back button. The id in the path is now the single source of truth.

   The record is fetched here rather than handed over from the list row, so a
   link pasted into a new tab shows the same page as a click, and the data is
   fresh either way. */
const UserAdmin = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);

  /* @param {boolean} quiet  keep the record on screen while it reloads, so a
     refresh after a save does not blink the whole page back to "Loading…". */
  const loadUser = useCallback((quiet = false) => {
    if (!id) { setUser(null); return undefined; }
    let alive = true;
    if (!quiet) setUser(null);
    fetch(`/api/users/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive) return;
        // An id that no longer resolves would otherwise sit on "Loading…"
        // for ever, so fall back to the list instead.
        if (data?.id) setUser(data);
        else if (!quiet) navigate('/settings/user-admin', { replace: true });
      })
      .catch(() => { if (alive && !quiet) navigate('/settings/user-admin', { replace: true }); });
    return () => { alive = false; };
  }, [id, navigate]);

  useEffect(() => loadUser(), [loadUser]);

  /* A role change, an activation, a permission edit — whatever wrote it, this
     page reloads the record rather than showing what it fetched on arrival.
     That is what the reload used to be for. */
  useEffect(
    () => subscribeDataChanged(['users', 'user-permissions'], () => loadUser(true)),
    [loadUser],
  );

  return (
    <div className="user-admin-wrapper">
      {!id && (
        <UserAdminList onEdit={(u) => navigate(`/settings/user-admin/edit/${u.id}`)} />
      )}
      {id && !user && <div className="nx-rec__loading">Loading…</div>}
      {id && user && (
        <UserAdminEdit
          key={user.id}
          user={user}
          onBack={() => navigate('/settings/user-admin')}
        />
      )}
    </div>
  );
};

export default UserAdmin;
