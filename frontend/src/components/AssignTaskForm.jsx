import { useState } from 'react';

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function AssignTaskForm({ team, onSubmit, submitting, error, success }) {
  const [assignedTo, setAssignedTo] = useState(team[0]?.id || '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [taskDate, setTaskDate] = useState(todayStr());
  const [priority, setPriority] = useState('normal');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim() || !assignedTo) return;
    onSubmit({
      assignedTo: Number(assignedTo),
      title: title.trim(),
      description: description.trim() || undefined,
      taskDate,
      priority,
    }).then((ok) => {
      if (ok) {
        setTitle('');
        setDescription('');
        setPriority('normal');
      }
    });
  };

  return (
    <div className="form-card">
      {error && <div className="form-error">{error}</div>}
      {success && <div className="form-success">{success}</div>}

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Assign to</label>
          <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
            {team.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name} — {person.roleLabel}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Task title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Rough cut the Sfumato flute promo reel"
            required
          />
        </div>

        <div className="field">
          <label>Details (optional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Any context, references, or notes for the task"
            rows={3}
          />
        </div>

        <div className="field-row">
          <div className="field">
            <label>Date</label>
            <input type="date" value={taskDate} onChange={(e) => setTaskDate(e.target.value)} />
          </div>
          <div className="field">
            <label>Priority</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>

        <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
          {submitting ? 'Assigning…' : 'Assign task'}
        </button>
      </form>
    </div>
  );
}
