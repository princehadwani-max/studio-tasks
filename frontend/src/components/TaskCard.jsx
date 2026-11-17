import { useState } from 'react';
import StatusPill from './StatusPill.jsx';
import { initials } from './Avatar.jsx';

function formatDateTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const datePart = d.toLocaleDateString([], { day: '2-digit', month: 'short' });
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
  compact = false,
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
  const [showAllRemarks, setShowAllRemarks] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [remarkText, setRemarkText] = useState('');
  const [sendingRemark, setSendingRemark] = useState(false);

  const taskDateStr = task.taskDate ? task.taskDate.slice(0, 10) : null;
  const isCarriedOver = Boolean(
    viewingDate && taskDateStr && taskDateStr < viewingDate && task.status !== 'completed'
  );
  const remarks = task.remarks || [];
  const latestRemark = remarks.length > 0 ? remarks[remarks.length - 1] : null;
  const isLongDesc = Boolean(task.description && task.description.length > 110);

  const handleStart = () => onUpdateStatus && onUpdateStatus(task.id, { status: 'in_progress' });
  const handleReopen = () => onUpdateStatus && onUpdateStatus(task.id, { status: 'pending' });

  const handleComplete = () => {
    if (!onUpdateStatus) return;
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
      setShowAllRemarks(true);
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
    <div className={`task-card status-${task.status} ${compact ? 'compact-row' : ''}`}>
      {/* Header Row: Code, Carried Over badge, Priority, Status & Delete */}
      <div className="task-card-top">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span className="task-code">{task.code}</span>
          {isCarriedOver && (
            <span className="carried-badge" title={`Originally assigned on ${formatShortDate(taskDateStr)}`}>
              Carried · {formatShortDate(taskDateStr)}
            </span>
          )}
          <span className={`priority-flag ${task.priority}`}>{task.priority}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <StatusPill status={task.status} />
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

      {/* Title & Clamped Description */}
      <div className="task-title">{task.title}</div>
      {task.description && (
        <div className="task-desc-wrap">
          <div className={`task-desc ${!descExpanded && isLongDesc ? 'clamped' : ''}`}>
            {task.description}
          </div>
          {isLongDesc && (
            <button
              type="button"
              className="text-link-btn"
              onClick={() => setDescExpanded((v) => !v)}
            >
              {descExpanded ? 'Show less' : 'Read more'}
            </button>
          )}
        </div>
      )}

      {/* Completion Note */}
      {task.status === 'completed' && task.completionNote && (
        <div className="completion-note">
          <span className="label">Wrapped · {formatDateTime(task.completedAt)}</span>
          {task.completionNote}
        </div>
      )}

      {/* Compact Remarks Preview / Expandable Thread */}
      {remarks.length > 0 && (
        <div className="task-remarks">
          {!showAllRemarks && remarks.length === 1 ? (
            <div className="task-remark-item">
              <div className="task-remark-head">
                <b>{latestRemark.author?.name || 'Member'}</b>
                <span>{formatDateTime(latestRemark.createdAt)}</span>
              </div>
              <div className="task-remark-body">{latestRemark.remark}</div>
            </div>
          ) : !showAllRemarks ? (
            <div className="task-remark-item">
              <div className="task-remark-head">
                <b>{latestRemark.author?.name || 'Member'}</b>
                <button
                  type="button"
                  className="text-link-btn"
                  onClick={() => setShowAllRemarks(true)}
                >
                  View all {remarks.length} remarks
                </button>
              </div>
              <div className="task-remark-body">{latestRemark.remark}</div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="task-remarks-label">Remarks ({remarks.length})</span>
                {remarks.length > 1 && (
                  <button
                    type="button"
                    className="text-link-btn"
                    onClick={() => setShowAllRemarks(false)}
                  >
                    Collapse
                  </button>
                )}
              </div>
              {remarks.map((r) => (
                <div key={r.id} className="task-remark-item">
                  <div className="task-remark-head">
                    <b>{r.author?.name || 'Member'}</b>
                    <span>{formatDateTime(r.createdAt)}</span>
                  </div>
                  <div className="task-remark-body">{r.remark}</div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Bottom Command Bar: Assignee + Direct Actions */}
      <div className="task-footer-bar">
        {showAssignee ? (
          <div className="assignee-chip">
            <span
              className="dot-avatar"
              style={{
                background: task.assignedTo.roleLabel?.startsWith('Designer')
                  ? 'var(--amber-dim)'
                  : 'var(--primary-dim)',
                color: task.assignedTo.roleLabel?.startsWith('Designer')
                  ? 'var(--amber)'
                  : 'var(--primary)',
              }}
            >
              {initials(task.assignedTo.name)}
            </span>
            <span>{task.assignedTo.name}</span>
          </div>
        ) : (
          <span className="activity-sub">from {task.assignedBy.name}</span>
        )}

        <div className="task-actions">
          {onAddRemark && !showRemarkForm && (
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => setShowRemarkForm(true)}
            >
              + Remark
            </button>
          )}
          {interactive && onUpdateStatus && task.status === 'pending' && (
            <button className="btn btn-teal btn-xs" onClick={handleStart} disabled={busy}>
              Start →
            </button>
          )}
          {interactive && onUpdateStatus && task.status === 'in_progress' && !showNoteField && (
            <button
              className="btn btn-green btn-xs"
              onClick={() => setShowNoteField(true)}
              disabled={busy}
            >
              ✓ Mark Done
            </button>
          )}
          {interactive && onUpdateStatus && task.status === 'completed' && (
            <button className="btn btn-ghost btn-xs" onClick={handleReopen} disabled={busy}>
              Reopen
            </button>
          )}
        </div>
      </div>

      {/* Inline Remark Input */}
      {onAddRemark && showRemarkForm && (
        <form className="task-remark-form" onSubmit={handleRemarkSubmit}>
          <textarea
            autoFocus
            value={remarkText}
            onChange={(e) => setRemarkText(e.target.value)}
            placeholder="Write a quick remark or update…"
            rows={2}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button className="btn btn-primary btn-xs" type="submit" disabled={sendingRemark}>
              {sendingRemark ? 'Posting…' : 'Post remark'}
            </button>
            <button
              className="btn btn-ghost btn-xs"
              type="button"
              onClick={() => setShowRemarkForm(false)}
              disabled={sendingRemark}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Inline Completion Note Input */}
      {interactive && showNoteField && (
        <div className="task-remark-form">
          <textarea
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional wrap note (what was completed)…"
            rows={2}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button className="btn btn-green btn-xs" onClick={handleComplete} disabled={busy}>
              Save &amp; Complete
            </button>
            <button
              className="btn btn-ghost btn-xs"
              onClick={() => setShowNoteField(false)}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
