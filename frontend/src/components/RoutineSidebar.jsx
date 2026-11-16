import { useState, useEffect } from 'react';
import { initials } from './Avatar.jsx';

export default function RoutineSidebar({
  routines = [],
  currentUser,
  canAssign = false,
  assignableUsers = [],
  selectedUserId = null,
  onCreateRoutine,
  onToggleRoutine,
  onDeleteRoutine,
}) {
  const [freqTab, setFreqTab] = useState('daily');
  const [scope, setScope] = useState('all'); // 'all' | 'mine'
  const [showForm, setShowForm] = useState(false);

  const [assignedTo, setAssignedTo] = useState('');
  const [frequency, setFrequency] = useState('daily');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (selectedUserId && assignableUsers.some((u) => u.id === selectedUserId)) {
      setAssignedTo(String(selectedUserId));
    } else if (assignableUsers.length > 0 && !assignableUsers.some((u) => String(u.id) === String(assignedTo))) {
      setAssignedTo(String(assignableUsers[0].id));
    }
  }, [assignableUsers, selectedUserId, assignedTo]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!title.trim() || !assignedTo) {
      setError('Select a person and enter a routine title.');
      return;
    }
    setSubmitting(true);
    try {
      await onCreateRoutine({
        assignedTo: Number(assignedTo),
        frequency,
        title: title.trim(),
        description: description.trim() || undefined,
      });
      setTitle('');
      setDescription('');
      setFreqTab(frequency);
      setShowForm(false);
    } catch (err) {
      setError(err.message || 'Could not add routine.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (id) => {
    setBusyId(id);
    try {
      await onToggleRoutine(id);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Remove ${item.frequency} routine "${item.title}"?`)) return;
    setBusyId(item.id);
    try {
      await onDeleteRoutine(item.id);
    } finally {
      setBusyId(null);
    }
  };

  // Filter by scope ('mine' vs 'all') when in Manager/Admin view and no left-sidebar user is selected
  const scopedRoutines =
    canAssign && !selectedUserId && scope === 'mine'
      ? routines.filter((r) => r.assignedTo.id === currentUser?.id)
      : routines;

  const dailyList = scopedRoutines.filter((r) => r.frequency === 'daily');
  const monthlyList = scopedRoutines.filter((r) => r.frequency === 'monthly');
  const activeList = freqTab === 'daily' ? dailyList : monthlyList;

  const dailyDone = dailyList.filter((r) => r.completed).length;
  const monthlyDone = monthlyList.filter((r) => r.completed).length;

  return (
    <aside className="routine-sidebar">
      <div className="routine-sidebar-head">
        <div>
          <h2>Routine Tasks</h2>
          <div className="routine-sub">Daily &amp; monthly recurring work</div>
        </div>
        {canAssign && (
          <button
            type="button"
            className={`btn btn-sm ${showForm ? 'btn-ghost' : 'btn-primary'}`}
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? 'Close' : '+ Assign'}
          </button>
        )}
      </div>

      {canAssign && showForm && (
        <form className="routine-form" onSubmit={handleSubmit}>
          {error && <div className="form-error" style={{ padding: '6px 10px', fontSize: 12 }}>{error}</div>}

          <div className="field" style={{ marginBottom: 10 }}>
            <label>Assign to</label>
            <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
              {assignableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} — {u.role_label || u.roleLabel}
                </option>
              ))}
            </select>
          </div>

          <div className="field" style={{ marginBottom: 10 }}>
            <label>Routine type</label>
            <select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
              <option value="daily">Daily Routine</option>
              <option value="monthly">Monthly Routine</option>
            </select>
          </div>

          <div className="field" style={{ marginBottom: 10 }}>
            <label>Task title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                frequency === 'daily'
                  ? 'e.g. Daily backup & footage check'
                  : 'e.g. Monthly archive & client report'
              }
              required
            />
          </div>

          <div className="field" style={{ marginBottom: 12 }}>
            <label>Details (optional)</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short note or instructions"
            />
          </div>

          <button className="btn btn-primary btn-sm btn-block" type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : `Add ${frequency} routine`}
          </button>
        </form>
      )}

      {canAssign && !selectedUserId && (
        <div className="routine-scope-bar">
          <button
            type="button"
            className={`routine-scope-btn ${scope === 'all' ? 'active' : ''}`}
            onClick={() => setScope('all')}
          >
            Team &amp; Me
          </button>
          <button
            type="button"
            className={`routine-scope-btn ${scope === 'mine' ? 'active' : ''}`}
            onClick={() => setScope('mine')}
          >
            My Routines
          </button>
        </div>
      )}

      <div className="routine-tabs">
        <button
          type="button"
          className={`routine-tab ${freqTab === 'daily' ? 'active' : ''}`}
          onClick={() => setFreqTab('daily')}
        >
          <span>Daily</span>
          <span className="routine-count">
            {dailyDone}/{dailyList.length}
          </span>
        </button>
        <button
          type="button"
          className={`routine-tab ${freqTab === 'monthly' ? 'active' : ''}`}
          onClick={() => setFreqTab('monthly')}
        >
          <span>Monthly</span>
          <span className="routine-count">
            {monthlyDone}/{monthlyList.length}
          </span>
        </button>
      </div>

      <div className="routine-list">
        {activeList.length === 0 ? (
          <div className="empty-col" style={{ marginTop: 8 }}>
            No {freqTab} routine tasks assigned yet.
          </div>
        ) : (
          activeList.map((item) => {
            const isMine = item.assignedTo.id === currentUser?.id;
            return (
              <div
                key={item.id}
                className={`routine-card ${item.completed ? 'completed' : ''}`}
              >
                <div className="routine-card-top">
                  <button
                    type="button"
                    className={`routine-check ${item.completed ? 'checked' : ''}`}
                    onClick={() => handleToggle(item.id)}
                    disabled={busyId === item.id}
                    title={
                      item.completed
                        ? `Completed for this ${item.frequency === 'daily' ? 'day' : 'month'}`
                        : `Mark done for this ${item.frequency === 'daily' ? 'day' : 'month'}`
                    }
                  >
                    {item.completed ? '✓' : ''}
                  </button>
                  <div className="routine-card-body">
                    <div className="routine-title">{item.title}</div>
                    {item.description && <div className="routine-desc">{item.description}</div>}
                    <div className="routine-meta">
                      {canAssign && !isMine ? (
                        <span className="assignee-chip" style={{ fontSize: 11 }}>
                          <span
                            className="dot-avatar"
                            style={{
                              background: 'var(--teal-dim)',
                              color: 'var(--teal)',
                            }}
                          >
                            {initials(item.assignedTo.name)}
                          </span>
                          {item.assignedTo.name}
                        </span>
                      ) : (
                        <span className="activity-sub" style={{ fontSize: 11 }}>
                          {isMine ? `You · from ${item.assignedBy.name}` : `from ${item.assignedBy.name}`}
                        </span>
                      )}
                      <span className={`routine-badge ${item.frequency}`}>
                        {item.frequency}
                      </span>
                    </div>
                  </div>
                  {canAssign && onDeleteRoutine && (
                    <button
                      type="button"
                      className="task-delete-btn"
                      onClick={() => handleDelete(item)}
                      disabled={busyId === item.id}
                      title="Delete routine"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
