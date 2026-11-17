import { useAuth } from '../context/AuthContext.jsx';
import Avatar from './Avatar.jsx';

export default function TopBar() {
  const { session, activeTenant, switchTenant, logout } = useAuth();
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const isSuperAdmin = session.user.role === 'super_admin';
  const companyLabel = isSuperAdmin
    ? activeTenant?.name || null
    : activeTenant?.name || session.user.companyName || 'Starco Ceramics';
  const companySlug = isSuperAdmin
    ? activeTenant?.slug || null
    : activeTenant?.slug || session.user.companySlug || 'starco';

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">
          STUDIO<span>/</span>TASKS
        </span>
        {companyLabel ? (
          <span className="tenant-pill">
            {companyLabel} <small>@{companySlug}</small>
          </span>
        ) : (
          <span className="tenant-pill">
            ⚡ SaaS Command Center <small>Platform Super Admin</small>
          </span>
        )}
        <span className="brand-date">{today}</span>
      </div>
      <div className="topbar-user">
        {isSuperAdmin && activeTenant && (
          <button
            type="button"
            className="btn btn-teal btn-sm"
            onClick={() => switchTenant(null)}
            title="Exit tenant workspace and return to SaaS Command Center"
          >
            ← Exit Workspace
          </button>
        )}
        <div className="user-chip">
          <Avatar name={session.user.name} role={session.user.role} size={30} />
          <div>
            <div className="name">{session.user.name}</div>
            <div className="role">{session.user.role_label}</div>
          </div>
        </div>
        <button className="logout-btn" onClick={logout}>
          Sign out
        </button>
      </div>
    </header>
  );
}
