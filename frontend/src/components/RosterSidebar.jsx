import Avatar from './Avatar.jsx';

export default function RosterSidebar({ summary, selectedUserId, onSelect }) {
  return (
    <aside className="sidebar">
      <h2>Team — today</h2>

      <button
        className={`roster-item ${selectedUserId === null ? 'active' : ''}`}
        onClick={() => onSelect(null)}
      >
        <div
          className="avatar role-manager"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          ★
        </div>
        <div className="info">
          <div className="r-name">Everyone</div>
          <div className="r-role">Full board</div>
        </div>
      </button>

      {summary.map((person) => {
        const isActive = selectedUserId === person.id;
        return (
          <button
            key={person.id}
            className={`roster-item ${isActive ? 'active' : ''}`}
            onClick={() => onSelect(person.id)}
          >
            <Avatar name={person.name} role={person.role} />
            <div className="info">
              <div className="r-name">{person.name}</div>
              <div className="r-role">{person.roleLabel}</div>
              <div className="roster-progress">
                {person.total === 0 ? (
                  <span className="seg" style={{ flex: 1 }} />
                ) : (
                  <>
                    {Array.from({ length: person.pending }).map((_, i) => (
                      <span key={`p${i}`} className="seg pending" />
                    ))}
                    {Array.from({ length: person.inProgress }).map((_, i) => (
                      <span key={`i${i}`} className="seg in_progress" />
                    ))}
                    {Array.from({ length: person.completed }).map((_, i) => (
                      <span key={`c${i}`} className="seg completed" />
                    ))}
                  </>
                )}
              </div>
            </div>
            <span className="roster-count">
              {person.completed}/{person.total}
            </span>
          </button>
        );
      })}
    </aside>
  );
}
