import { useState } from 'react';
import Avatar from './Avatar.jsx';

const ROLE_OPTIONS = [
  { value: 'designer', label: 'Designer' },
  { value: 'operation_coordinator', label: 'Operation Coordinator' },
  { value: 'manager', label: 'Manager' },
   { value: 'sales manager', label: ' Manager' },
    { value: 'MD', label: 'MD' },
     { value: 'Export Manager', label: 'Export Manager' },
];

function AddPersonForm({ onCreate }) {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
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
    if (!name.trim() || !username.trim() || !password) {
      setError('Name, username, and password are required.');
      return;
    }
    setSubmitting(true);
    try {
      const created = await onCreate({
        name: name.trim(),
        username: username.trim().toLowerCase(),
        password,
        role,
        roleLabel: roleLabel.trim() || undefined,
      });
      setSuccess(`${created.name} was added to the team.`);
      setName('');
      setUsername('');
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
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. swati" />
          </div>
          <div className="field">
            <label>Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. swati"
              autoComplete="off"
            />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLE_OPTIONS.map((r) => (
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
        <div className="field">
          <label>Temporary password</label>
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
            autoComplete="off"
          />
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

export default function TeamPanel({ team, currentUserId, onCreate, onSetActive, onResetPassword }) {
  const [busyId, setBusyId] = useState(null);
  const [rowError, setRowError] = useState({});

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

  const renderRow = (person) => (
    <div key={person.id} className="team-row">
      <Avatar name={person.name} role={person.role} />
      <div className="info">
        <div className="r-name">
          {person.name}
          {person.id === currentUserId && <span className="you-tag">you</span>}
        </div>
        <div className="r-role">
          {person.role_label} · @{person.username}
        </div>
        {rowError[person.id] && <div className="team-row-error">{rowError[person.id]}</div>}
      </div>
      <div className="team-row-actions">
        <PasswordRow person={person} onResetPassword={onResetPassword} />
        {person.active ? (
          <button
            className="btn btn-ghost btn-sm btn-danger-text"
            disabled={busyId === person.id || person.id === currentUserId}
            onClick={() => handleToggleActive(person, false)}
            title={person.id === currentUserId ? "You can't remove your own account." : 'Remove from team'}
          >
            Remove
          </button>
        ) : (
          <button
            className="btn btn-teal btn-sm"
            disabled={busyId === person.id}
            onClick={() => handleToggleActive(person, true)}
          >
            Restore
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div>
      <AddPersonForm onCreate={onCreate} />

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
