const LABELS = {
  pending: 'Pending',
  in_progress: 'In progress',
  completed: 'Done',
};

export default function StatusPill({ status }) {
  return (
    <span className={`status-pill ${status}`}>
      <span className="pip" />
      {LABELS[status] || status}
    </span>
  );
}
