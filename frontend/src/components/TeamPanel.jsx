import { useState, useEffect } from 'react';
import Avatar from './Avatar.jsx';
import { api } from '../api/client.js';

function WhatsAppConnectionCard({ token, companyName }) {
  const [wa, setWa] = useState({ status: 'disconnected', qrDataUrl: null, connectedPhone: null, error: null });
  const [busy, setBusy] = useState(false);
  const [uiError, setUiError] = useState('');

  useEffect(() => {
    if (!token) return;
    let active = true;
    const poll = async () => {
      try {
        const res = await api.whatsappStatus(token);
        if (active) setWa(res);
      } catch {}
    };
    poll();
    const timer = setInterval(poll, 2500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [token, companyName]);

  const handleConnect = async () => {
    setBusy(true);
    setUiError('');
    setWa((prev) => ({ ...prev, status: 'connecting', error: null }));
    try {
      const res = await api.whatsappConnect(token);
      setWa(res);
      if (res.error) setUiError(res.error);
    } catch (err) {
      setUiError(err.message || 'Could not generate WhatsApp QR code.');
      setWa((prev) => ({ ...prev, status: 'disconnected' }));
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setBusy(true);
    setUiError('');
    try {
      const res = await api.whatsappDisconnect(token);
      setWa(res);
    } catch (err) {
      setUiError(err.message || 'Could not disconnect WhatsApp.');
    } finally {
      setBusy(false);
    }
  };

  const activeCompanyLabel = wa.companyName || companyName || 'this company';

  return (
    <div className="form-card" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h3 style={{ marginBottom: 4 }}>WhatsApp Auto-Notifications ({activeCompanyLabel})</h3>
          <div style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>
            {wa.status === 'connected'
              ? `Connected (+${wa.connectedPhone || 'Linked'}) for ${activeCompanyLabel} — tasks assigned in this workspace are sent from this number.`
              : wa.status === 'qr_ready'
              ? `QR code ready for ${activeCompanyLabel} — scan below with WhatsApp on your phone.`
              : `Link ${activeCompanyLabel}'s WhatsApp number so tasks in this workspace are sent automatically.`}
          </div>
        </div>
        {wa.status === 'connected' ? (
          <button className="btn btn-ghost btn-sm btn-danger-text" onClick={handleDisconnect} disabled={busy}>
            Disconnect
          </button>
        ) : (
          <button className="btn btn-teal btn-sm" onClick={handleConnect} disabled={busy}>
            {busy || wa.status === 'connecting'
              ? 'Generating QR…'
              : wa.status === 'qr_ready'
              ? 'Refresh QR'
              : 'Link WhatsApp'}
          </button>
        )}
      </div>

      {(uiError || wa.error) && (
        <div className="form-error" style={{ marginTop: 12, marginBottom: 0 }}>
          {uiError || wa.error}
        </div>
      )}

      {wa.status === 'qr_ready' && wa.qrDataUrl && (
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <img
            src={wa.qrDataUrl}
            alt="WhatsApp QR Code"
            style={{ width: 180, height: 180, borderRadius: 8, background: '#fff', padding: 6 }}
          />
          <div style={{ fontSize: 12.5, color: 'var(--text-dim)', lineHeight: 1.6, maxWidth: 260 }}>
            <b style={{ color: 'var(--text)' }}>Scan once with WhatsApp:</b>
            <br />
            1. Open WhatsApp on your phone
            <br />
            2. Tap <b>Linked Devices → Link a Device</b>
            <br />
            3. Point your phone at this QR code
          </div>
        </div>
      )}
    </div>
  );
}

const ROLE_OPTIONS = [
  { value: 'designer', label: 'Designer' },
  { value: 'operation_coordinator', label: 'Operation Coordinator' },
  { value: 'manager', label: 'Manager' },
  { value: 'sales manager', label: 'Sales Manager' },
  { value: 'MD', label: 'MD' },
  { value: 'export_coordinator', label: 'Export Coordinator' },
];

function AddPersonForm({ onCreate, isAdmin }) {
  const roleOptions = isAdmin
    ? [...ROLE_OPTIONS, { value: 'admin', label: 'Admin' }]
    : ROLE_OPTIONS;
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('designer');
  const [roleLabel, setRoleLabel] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!name.trim() || !username.trim() || !phone.trim() || !password) {
      setError('Name, username, phone number, and password are required.');
      return;
    }
    setSubmitting(true);
    try {
      const created = await onCreate({
        name: name.trim(),
        username: username.trim().toLowerCase(),
        phone: phone.trim(),
        password,
        role,
        roleLabel: roleLabel.trim() || undefined,
      });
      setSuccess(`${created.name} was added to the team.`);
      setName('');
      setUsername('');
      setPhone('');
      setPassword('');
      setRoleLabel('');
      setRole('designer');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="form-card">
      <h3 style={{ marginBottom: 14 }}>Add a team member</h3>
      {error && <div className="form-error">{error}</div>}
      {success && <div className="form-success">{success}</div>}
      <form onSubmit={handleSubmit}>
        <div className="field-row">
          <div className="field">
            <label>Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Swati"
              required
            />
          </div>
          <div className="field">
            <label>Username *</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. swati"
              autoComplete="off"
              required
            />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>Phone number *</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 9876543210"
              required
            />
          </div>
          <div className="field">
            <label>Temporary password *</label>
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              autoComplete="off"
              required
            />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>Role *</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {roleOptions.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Role label (optional)</label>
            <input
              value={roleLabel}
              onChange={(e) => setRoleLabel(e.target.value)}
              placeholder="e.g. Operation Coordinator 3"
            />
          </div>
        </div>
        <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
          {submitting ? 'Adding…' : 'Add to team'}
        </button>
      </form>
    </div>
  );
}

function PasswordRow({ person, onResetPassword }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setSubmitting(true);
    try {
      await onResetPassword(person.id, password);
      setSuccess('Password updated.');
      setPassword('');
      setTimeout(() => setOpen(false), 1200);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        Reset password
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 220 }}>
      {error && <div className="form-error" style={{ padding: '6px 10px', fontSize: 12 }}>{error}</div>}
      {success && <div className="form-success" style={{ padding: '6px 10px', fontSize: 12 }}>{success}</div>}
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          autoFocus
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="New password"
          style={{
            flex: 1,
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            color: 'var(--text)',
            padding: '6px 8px',
            font: 'inherit',
            fontSize: 12.5,
          }}
        />
        <button className="btn btn-teal btn-sm" type="submit" disabled={submitting}>
          Save
        </button>
        <button className="btn btn-ghost btn-sm" type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function PhoneRow({ person, onUpdatePhone }) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(person.phone || '');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!phone.trim()) {
      setError('Phone number is required.');
      return;
    }
    setSubmitting(true);
    try {
      await onUpdatePhone(person.id, phone.trim());
      setOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        Edit phone
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 200 }}>
      {error && <div className="form-error" style={{ padding: '6px 10px', fontSize: 12 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          autoFocus
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone number"
          style={{
            flex: 1,
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            color: 'var(--text)',
            padding: '6px 8px',
            font: 'inherit',
            fontSize: 12.5,
          }}
        />
        <button className="btn btn-teal btn-sm" type="submit" disabled={submitting}>
          Save
        </button>
        <button className="btn btn-ghost btn-sm" type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function TeamPanel({
  team,
  token,
  companyName,
  whatsappEnabled = true,
  currentUserId,
  currentUserRole,
  onCreate,
  onSetActive,
  onUpdatePhone,
  onResetPassword,
}) {
  const [busyId, setBusyId] = useState(null);
  const [rowError, setRowError] = useState({});

  const isAdmin = ['super_admin', 'admin', 'MD'].includes(currentUserRole);
  const active = team.filter((p) => p.active);
  const removed = team.filter((p) => !p.active);

  const handleToggleActive = async (person, nextActive) => {
    if (nextActive === false) {
      const ok = window.confirm(
        `Remove ${person.name} from the team? They won't be able to sign in, but their task history is kept.`
      );
      if (!ok) return;
    }
    setBusyId(person.id);
    setRowError((prev) => ({ ...prev, [person.id]: '' }));
    try {
      await onSetActive(person.id, nextActive);
    } catch (err) {
      setRowError((prev) => ({ ...prev, [person.id]: err.message }));
    } finally {
      setBusyId(null);
    }
  };

  const renderRow = (person) => {
    const isProtectedAdmin =
      person.role === 'super_admin' ||
      (!isAdmin && (person.role === 'admin' || person.role === 'MD'));
    return (
      <div key={person.id} className="team-row">
        <Avatar name={person.name} role={person.role} />
        <div className="info">
          <div className="r-name">
            {person.name}
            {person.id === currentUserId && <span className="you-tag">you</span>}
          </div>
          <div className="r-role">
            {person.role_label} · @{person.username} · 📞 {person.phone || 'Not set'}
          </div>
          {rowError[person.id] && <div className="team-row-error">{rowError[person.id]}</div>}
        </div>
        <div className="team-row-actions">
          {!isProtectedAdmin && onUpdatePhone && (
            <PhoneRow person={person} onUpdatePhone={onUpdatePhone} />
          )}
          {!isProtectedAdmin && <PasswordRow person={person} onResetPassword={onResetPassword} />}
          {person.active ? (
            <button
              className="btn btn-ghost btn-sm btn-danger-text"
              disabled={busyId === person.id || person.id === currentUserId || isProtectedAdmin}
              onClick={() => handleToggleActive(person, false)}
              title={
                person.id === currentUserId
                  ? "You can't remove your own account."
                  : isProtectedAdmin
                  ? 'Managers cannot remove an admin.'
                  : 'Remove from team'
              }
            >
              Remove
            </button>
          ) : (
            <button
              className="btn btn-teal btn-sm"
              disabled={busyId === person.id || isProtectedAdmin}
              onClick={() => handleToggleActive(person, true)}
            >
              Restore
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      {whatsappEnabled && <WhatsAppConnectionCard token={token} companyName={companyName} />}
      <AddPersonForm onCreate={onCreate} isAdmin={isAdmin} />

      <h3 style={{ margin: '22px 0 12px' }}>On the team</h3>
      <div className="team-list">{active.map(renderRow)}</div>

      {removed.length > 0 && (
        <>
          <h3 style={{ margin: '22px 0 12px', color: 'var(--text-faint)' }}>Removed</h3>
          <div className="team-list">{removed.map(renderRow)}</div>
        </>
      )}
    </div>
  );
}
