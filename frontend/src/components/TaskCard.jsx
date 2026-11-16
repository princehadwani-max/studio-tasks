import { useState } from 'react';
import StatusPill from './StatusPill.jsx';
import { initials } from './Avatar.jsx';

function formatTime(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const datePart = d.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
  const timePart = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${datePart}, ${timePart}`;
}

function formatShortDate(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function TaskCard({ 
  task,
  showAssignee = false,
  interactive = false,
  onUpdateStatus,
  onAddRemark,
  busy,
  onDelete,
  deleting,
  viewingDate,
 }) {
  const [showNoteField, setShowNoteField] = useState(false);
  const [note, setNote] = useState('');
  const [showRemarkForm, setShowRemarkForm] = useState(false);
  const [remarkText, setRemarkText] = useState('');
  const [sendingRemark, setSendingRemark] = useState(false);

  const taskDateStr = task.taskDate ? task.taskDate.slice(0, 10) : null;
  const isCarriedOver = Boolean(viewingDate && taskDateStr && taskDateStr < viewingDate);
  const remarks = task.remarks || [];

  const handleStart = () => onUpdateStatus(task.id, { status: 'in_progress' });

  const handleComplete = () => {
    onUpdateStatus(task.id, { status: 'completed', completionNote: note.trim() || undefined });
    setShowNoteField(false);
    setNote('');
  };

  const handleRemarkSubmit = async (e) => {
    e.preventDefault();
    if (!remarkText.trim() || !onAddRemark) return;
    setSendingRemark(true);
    try {
      await onAddRemark(task.id, remarkText.trim());
      setRemarkText('');
      setShowRemarkForm(false);
    } finally {
      setSendingRemark(false);
    }
  };

  const handleDelete = () => {
    if (window.confirm(`Delete ${task.code} — "${task.title}"? This can't be undone.`)) {
      onDelete(task.id);
    }
  };

  return (
    <div className={`task-card status-${task.status}`}>
      <div className="task-card-top">
        <span className="task-code">{task.code}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className={`priority-flag ${task.priority}`}>{task.priority}</span>
          {onDelete && (
            <button
              type="button"
              className="task-delete-btn"
              onClick={handleDelete}
              disabled={deleting}
              title="Delete task"
              aria-label="Delete task"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {isCarriedOver && (
        <div className="carried-badge">Carried from {formatShortDate(taskDateStr)}</div>
      )}
      
      <div className="task-title">{task.title}</div>
      {task.description && <div className="task-desc">{task.description}</div>}

      <div className="task-meta-row">
        {showAssignee ? (
          <div className="assignee-chip">
            <span
              className="dot-avatar"
              style={{
                background: task.assignedTo.roleLabel.startsWith('Designer')
                  ? 'var(--amber-dim)'
                  : 'var(--teal-dim)',
                color: task.assignedTo.roleLabel.startsWith('Designer') ? 'var(--amber)' : 'var(--teal)',
              }}
            >
              {initials(task.assignedTo.name)}
            </span>
            {task.assignedTo.name}
          </div>
        ) : (
          <span className="activity-sub">from {task.assignedBy.name}</span>
        )}
        <StatusPill status={task.status} />
      </div>

      {task.status === 'completed' && task.completionNote && (
        <div className="completion-note">
          <span className="label">Wrap note · {formatDateTime(task.completedAt)}</span>
          {task.completionNote}
        </div>
      )}

      {remarks.length > 0 && (
        <div className="task-remarks">
          <div className="task-remarks-label">Remarks ({remarks.length})</div>
          {remarks.map((r) => (
            <div key={r.id} className="task-remark-item">
              <div className="task-remark-head">
                <b>{r.author?.name || 'Member'}</b>
                <span>{formatDateTime(r.createdAt)}</span>
              </div>
              <div className="task-remark-body">{r.remark}</div>
            </div>
          ))}
        </div>
      )}

      <div className="task-actions">
        {interactive && task.status === 'pending' && (
          <button className="btn btn-teal btn-sm" onClick={handleStart} disabled={busy}>
            Start work
          </button>
        )}
        {interactive && task.status === 'in_progress' && !showNoteField && (
          <button className="btn btn-green btn-sm" onClick={() => setShowNoteField(true)} disabled={busy}>
            Mark done
          </button>
        )}
        {onAddRemark && !showRemarkForm && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setShowRemarkForm(true)}
          >
            + Remark
          </button>
        )}
      </div>

      {onAddRemark && showRemarkForm && (
        <form className="task-remark-form" onSubmit={handleRemarkSubmit}>
          <textarea
            autoFocus
            value={remarkText}
            onChange={(e) => setRemarkText(e.target.value)}
            placeholder="Share an update, link, or remark about this task…"
            rows={2}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button className="btn btn-primary btn-sm" type="submit" disabled={sendingRemark}>
              {sendingRemark ? 'Posting…' : 'Post remark'}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              onClick={() => setShowRemarkForm(false)}
              disabled={sendingRemark}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {interactive && showNoteField && (
        <div style={{ marginTop: 10 }}>
          <div className="field" style={{ marginBottom: 8 }}>
            <label>What got done (optional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Sorted footage by scene, flagged 3 unusable takes"
              rows={2}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-green btn-sm" onClick={handleComplete} disabled={busy}>
              Save &amp; complete
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowNoteField(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
