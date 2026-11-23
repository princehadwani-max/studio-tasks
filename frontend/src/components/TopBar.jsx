import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api/client.js';
import Avatar from './Avatar.jsx';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function playNotificationChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const notes = [587.33, 880]; // D5 -> A5 pleasant alert chime
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.14);
      gain.gain.setValueAtTime(0.001, now + idx * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.22, now + idx * 0.14 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.14 + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.14);
      osc.stop(now + idx * 0.14 + 0.3);
    });
  } catch {
    // Ignore audio context autoplay restrictions if user hasn't interacted yet
  }
}

export default function TopBar() {
  const { session, activeTenant, switchTenant, logout } = useAuth();
  const [theme, setTheme] = useState(() => localStorage.getItem('studio_tasks_theme') || 'dark');
  const [installPrompt, setInstallPrompt] = useState(null);
  const [pushState, setPushState] = useState('checking'); // 'unsupported' | 'prompt' | 'granted' | 'denied' | 'subscribing'

  const syncPushSubscription = useCallback(
    async (requestPermission = false) => {
      if (
        typeof window === 'undefined' ||
        !('serviceWorker' in navigator) ||
        !('PushManager' in window) ||
        !('Notification' in window)
      ) {
        setPushState('unsupported');
        return false;
      }

      let permission = Notification.permission;
      if (requestPermission && permission !== 'granted') {
        permission = await Notification.requestPermission();
      }

      if (permission !== 'granted') {
        setPushState(permission === 'denied' ? 'denied' : 'prompt');
        return false;
      }

      try {
        setPushState('subscribing');
        const reg = await navigator.serviceWorker.ready;
        const { publicKey } = await api.vapidPublicKey();
        if (!publicKey) {
          setPushState('prompt');
          return false;
        }

        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey),
          });
        }

        await api.pushSubscribe(session.token, sub.toJSON ? sub.toJSON() : sub);
        setPushState('granted');
        return true;
      } catch (err) {
        console.warn('[Push] Failed to sync subscription:', err.message);
        setPushState('prompt');
        return false;
      }
    },
    [session?.token]
  );

  useEffect(() => {
    if (!session?.token) return;
    if (
      typeof window === 'undefined' ||
      !('serviceWorker' in navigator) ||
      !('PushManager' in window) ||
      !('Notification' in window)
    ) {
      setPushState('unsupported');
      return;
    }

    if (Notification.permission === 'granted') {
      syncPushSubscription(false);
    } else if (Notification.permission === 'denied') {
      setPushState('denied');
    } else {
      setPushState('prompt');
    }
  }, [session?.token, syncPushSubscription]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    const onMessage = (event) => {
      if (event.data && event.data.type === 'PUSH_NOTIFICATION_RECEIVED') {
        playNotificationChime();
        if (navigator.vibrate) {
          navigator.vibrate([250, 100, 250]);
        }
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);

  const handleEnableAlertsClick = async () => {
    if (pushState === 'granted') {
      playNotificationChime();
      try {
        await api.pushTest(session.token);
      } catch {
        // Ignore test errors
      }
      return;
    }
    const ok = await syncPushSubscription(true);
    if (ok) {
      playNotificationChime();
      try {
        await api.pushTest(session.token);
      } catch {
        // Ignore test errors
      }
    }
  };

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
        {pushState !== 'unsupported' && (
          <button
            type="button"
            className={`btn btn-sm ${pushState === 'granted' ? 'btn-ghost' : 'btn-teal'}`}
            onClick={handleEnableAlertsClick}
            disabled={pushState === 'subscribing'}
            title={
              pushState === 'granted'
                ? 'Push notifications active — click to send a test notification with sound & vibration'
                : pushState === 'denied'
                  ? 'Notifications blocked in browser settings — allow notifications for this site to receive alerts'
                  : 'Enable push notifications with sound & vibration for assigned tasks and 11:00 AM reminders'
            }
          >
            {pushState === 'granted'
              ? '🔔 Alerts On'
              : pushState === 'subscribing'
                ? '🔔 Enabling…'
                : pushState === 'denied'
                  ? '🔕 Alerts Blocked'
                  : '🔔 Enable Alerts'}
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
