import { useState, useEffect } from 'react';

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function AssignTaskForm({
  team,
  onSubmit,
  submitting,
  error,
  success,
}) {
  const [assignedTo, setAssignedTo] = useState(team[0]?.id || '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [taskDate, setTaskDate] = useState(todayStr());
  const [priority, setPriority] = useState('normal');
  const [reminderIntervalDays, setReminderIntervalDays] = useState('1');

  useEffect(() => {
    if (team.length > 0 && !team.some((p) => String(p.id) === String(assignedTo))) {
      setAssignedTo(team[0].id);
    }
  }, [team, assignedTo]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim() || !assignedTo) return;
    const parsedReminderDays = Number(reminderIntervalDays);
    onSubmit({
      assignedTo: Number(assignedTo),
      title: title.trim(),
      description: description.trim() || undefined,
      taskDate,
      priority,
      reminderIntervalDays:
        Number.isInteger(parsedReminderDays) && parsedReminderDays > 0 ? parsedReminderDays : null,
    }).then((ok) => {
      if (ok) {
        setTitle('');
        setDescription('');
        setPriority('normal');
        setReminderIntervalDays('1');
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

        <div className="field">
          <label>Reminder frequency in days (notifies at 11:00 AM sharp until Done)</label>
          <input
            type="number"
            min="0"
            max="365"
            step="1"
            value={reminderIntervalDays}
            onChange={(e) => setReminderIntervalDays(e.target.value)}
            placeholder="e.g. 1 (repeats every 1 day at 11:00 AM, 0 for no reminder)"
          />
          <small style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: 4, display: 'block' }}>
            {Number(reminderIntervalDays) > 0
              ? `⏰ Sends push notification & reminder every ${Number(reminderIntervalDays)} day${Number(reminderIntervalDays) > 1 ? 's' : ''} at 11:00 AM until marked Done.`
              : 'Reminders turned off for this task (enter 1 or more days to enable 11:00 AM reminders).'}
          </small>
        </div>

        <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
          {submitting ? 'Assigning…' : 'Assign task'}
        </button>
      </form>
    </div>
  );
}
