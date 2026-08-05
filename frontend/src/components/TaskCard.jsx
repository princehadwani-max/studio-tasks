import { useState } from 'react';
import StatusPill from './StatusPill.jsx';
import { initials } from './Avatar.jsx';

function formatTime(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function TaskCard({ task, showAssignee = false, interactive = false, onUpdateStatus, busy }) {
  const [showNoteField, setShowNoteField] = useState(false);
  const [note, setNote] = useState('');

  const handleStart = () => onUpdateStatus(task.id, { status: 'in_progress' });

  const handleComplete = () => {
    onUpdateStatus(task.id, { status: 'completed', completionNote: note.trim() || undefined });
    setShowNoteField(false);
    setNote('');
  };

  return (
    <div className={`task-card status-${task.status}`}>
      <div className="task-card-top">
        <span className="task-code">{task.code}</span>
        <span className={`priority-flag ${task.priority}`}>{task.priority}</span>
      </div>

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
          <span className="label">Wrap note · {formatTime(task.completedAt)}</span>
          {task.completionNote}
        </div>
      )}

      {interactive && task.status !== 'completed' && (
        <div className="task-actions">
          {task.status === 'pending' && (
            <button className="btn btn-teal btn-sm" onClick={handleStart} disabled={busy}>
              Start work
            </button>
          )}
          {task.status === 'in_progress' && !showNoteField && (
            <button className="btn btn-green btn-sm" onClick={() => setShowNoteField(true)} disabled={busy}>
              Mark done
            </button>
          )}
        </div>
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
