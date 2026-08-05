function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function ActivityLog({ activity }) {
  if (activity.length === 0) {
    return (
      <div className="empty-state">
        <h3>Nothing logged yet</h3>
        <p>Once someone starts or completes a task, it'll show up here in order.</p>
      </div>
    );
  }

  return (
    <div className="activity-list">
      {activity.map((task) => {
        const isDone = task.status === 'completed';
        const time = isDone ? task.completedAt : task.startedAt;
        return (
          <div className="activity-item" key={task.id}>
            <div className="activity-time">{formatTime(time)}</div>
            <div className="activity-body">
              <div className="activity-headline">
                <b>{task.assignedTo.name}</b> {isDone ? 'completed' : 'started'} {task.code} —{' '}
                {task.title}
              </div>
              {isDone && task.completionNote && <div className="activity-sub">{task.completionNote}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
