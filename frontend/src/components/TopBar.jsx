import { useAuth } from '../context/AuthContext.jsx';
import Avatar from './Avatar.jsx';

export default function TopBar() {
  const { session, logout } = useAuth();
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">
          STUDIO<span>/</span>TASKS
        </span>
        <span className="brand-date">{today}</span>
      </div>
      <div className="topbar-user">
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
