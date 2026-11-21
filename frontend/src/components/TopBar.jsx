import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import Avatar from './Avatar.jsx';

export default function TopBar() {
  const { session, activeTenant, switchTenant, logout } = useAuth();
  const [theme, setTheme] = useState(() => localStorage.getItem('studio_tasks_theme') || 'dark');
  const [installPrompt, setInstallPrompt] = useState(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('studio_tasks_theme', theme);
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', theme === 'light' ? '#ffffff' : '#09090b');
    }
  }, [theme]);

  useEffect(() => {
    const onBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    const onAppInstalled = () => {
      setInstallPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstallPrompt(null);
    }
  };

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
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
        <div className="brand-logo-box">S</div>
        <span className="brand-mark">
          Studio<span>Tasks</span>
        </span>
        {companyLabel ? (
          <span className="tenant-pill">
            {companyLabel} <small>@{companySlug}</small>
          </span>
        ) : (
          <span className="tenant-pill">
            SaaS Command Center <small>Super Admin</small>
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
        {installPrompt && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleInstallClick}
            title="Install Studio Tasks as an app on your device"
          >
            ⬇ Install App
          </button>
        )}
        <button
          type="button"
          className="theme-toggle-btn"
          onClick={toggleTheme}
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
          aria-label="Toggle color theme"
        >
          {theme === 'dark' ? '☀ Light' : '☾ Dark'}
        </button>
        <div className="user-chip">
          <Avatar name={session.user.name} role={session.user.role} size={28} />
          <div className="user-chip-text">
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
