import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api/client.js';
import TopBar from '../components/TopBar.jsx';
import TaskCard from '../components/TaskCard.jsx';
import RoutineSidebar from '../components/RoutineSidebar.jsx';

const todayStr = () => new Date().toISOString().slice(0, 10);

const COLUMNS = [
  { key: 'pending', label: 'Pending', dot: 'var(--amber)' },
  { key: 'in_progress', label: 'In progress', dot: 'var(--teal)' },
  { key: 'completed', label: 'Completed', dot: 'var(--green)' },
];

export default function EmployeeDashboard() {
  const { session, activeTenant } = useAuth();
  const token = session.token;
  const tenantFeatures = activeTenant?.features || session.user.companyFeatures || {
    whatsapp: true,
    routines: true,
    remarks: true,
    team_management: true,
  };

  const [date, setDate] = useState(todayStr());
  const [tasks, setTasks] = useState([]);
  const [routines, setRoutines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'pending' | 'in_progress' | 'completed'
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tasksRes, routinesRes] = await Promise.all([
        api.listTasks(token, { date }),
        api.listRoutines(token),
      ]);
      setTasks(tasksRes.tasks);
      setRoutines(routinesRes.routines);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [token, date]);

  useEffect(() => {
    load();
  }, [load]);

  const handleUpdate = async (id, payload) => {
    setBusyId(id);
    try {
      await api.updateStatus(token, id, payload);
      await load();
    } catch (err) {
      console.error(err);
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleRoutine = async (id) => {
    await api.toggleRoutine(token, id);
    await load();
  };

  const handleAddRemark = async (id, remark) => {
    await api.addTaskRemark(token, id, remark);
    await load();
  };

  const filteredTasks = tasks.filter((t) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.title?.toLowerCase().includes(q) ||
      t.code?.toLowerCase().includes(q) ||
      t.description?.toLowerCase().includes(q) ||
      t.assignedBy?.name?.toLowerCase().includes(q)
    );
  });

  const columnTasks = (statusKey) => filteredTasks.filter((t) => t.status === statusKey);
  const visibleTasks =
    statusFilter === 'all' ? filteredTasks : filteredTasks.filter((t) => t.status === statusFilter);

  const pendingTotal = tasks.filter((t) => t.status === 'pending').length;
  const inProgressTotal = tasks.filter((t) => t.status === 'in_progress').length;
  const doneTotal = tasks.filter((t) => t.status === 'completed').length;
  const isToday = date === todayStr();
  const carriedOverCount = tasks.filter(
    (t) => t.status !== 'completed' && t.taskDate && t.taskDate.slice(0, 10) < date
  ).length;

  const counts = {
    all: filteredTasks.length,
    pending: columnTasks('pending').length,
    in_progress: columnTasks('in_progress').length,
    completed: columnTasks('completed').length,
  };

  return (
    <div className="app-shell">
      <TopBar />
      <div className="main-layout">
        <main className="content" style={{ maxWidth: 1120, margin: '0 auto', width: '100%' }}>
          <div className="content-header">
            <div>
              <h1>{isToday ? "Today's call sheet" : 'Call sheet'}</h1>
              <div className="subtitle">
                {pendingTotal} pending · {inProgressTotal} in progress · {doneTotal} completed
                {carriedOverCount > 0 && (
                  <>
                    {' '}
                    · <span style={{ color: 'var(--amber)' }}>{carriedOverCount} carried over</span>
                  </>
                )}{' '}
                ·{' '}
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-dim)',
                    font: 'inherit',
                  }}
                />
              </div>
            </div>
          </div>

          {loading && <p style={{ color: 'var(--text-faint)' }}>Loading…</p>}

          {!loading && pendingTotal > 0 && (
            <div
              className="form-success"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 16,
              }}
            >
              <span>
                🔔 You have <b>{pendingTotal}</b> pending task
                {pendingTotal === 1 ? '' : 's'} assigned to you.
              </span>
            </div>
          )}

          {!loading && (
            <>
              <div className="command-toolbar">
                <div className="status-filter-pills">
                  <button
                    type="button"
                    className={`filter-pill ${statusFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setStatusFilter('all')}
                  >
                    <span>All</span>
                    <span className="pill-count">{counts.all}</span>
                  </button>
                  {COLUMNS.map((col) => (
                    <button
                      key={col.key}
                      type="button"
                      className={`filter-pill ${statusFilter === col.key ? 'active' : ''}`}
                      onClick={() => setStatusFilter(col.key)}
                    >
                      <span className="dot" style={{ background: col.dot }} />
                      <span>{col.label}</span>
                      <span className="pill-count">{counts[col.key]}</span>
                    </button>
                  ))}
                </div>

                <div className="toolbar-right">
                  <input
                    type="search"
                    className="toolbar-search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter my tasks…"
                  />
                  <div className="view-mode-toggle">
                    <button
                      type="button"
                      className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                      onClick={() => setViewMode('grid')}
                      title="Multi-column card grid"
                    >
                      ⊞ Grid
                    </button>
                    <button
                      type="button"
                      className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
                      onClick={() => setViewMode('list')}
                      title="Compact command list"
                    >
                      ☰ List
                    </button>
                  </div>
                </div>
              </div>

              {visibleTasks.length === 0 ? (
                <div className="empty-state">
                  <h3>
                    {tasks.length === 0
                      ? `Nothing assigned ${isToday ? 'today' : 'for this day'}`
                      : 'No tasks match this filter'}
                  </h3>
                  <p>
                    {tasks.length === 0
                      ? "When your manager assigns you work, it'll show up here."
                      : 'Switch status tabs or clear your search filter to see other tasks.'}
                  </p>
                </div>
              ) : statusFilter !== 'all' ? (
                <div className={viewMode === 'grid' ? 'task-grid' : 'task-list-stack'}>
                  {visibleTasks.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      interactive
                      compact={viewMode === 'list'}
                      onUpdateStatus={handleUpdate}
                      onAddRemark={tenantFeatures.remarks !== false ? handleAddRemark : undefined}
                      busy={busyId === t.id}
                      viewingDate={date}
                    />
                  ))}
                </div>
              ) : (
                <div className="status-sections">
                  {[
                    { key: 'in_progress', label: 'In Progress', dot: 'var(--teal)' },
                    { key: 'pending', label: 'Pending', dot: 'var(--amber)' },
                    { key: 'completed', label: 'Completed', dot: 'var(--green)' },
                  ].map((sec) => {
                    const items = columnTasks(sec.key);
                    if (items.length === 0) return null;
                    return (
                      <section key={sec.key} className="status-section">
                        <div className="status-section-head">
                          <span className="dot" style={{ background: sec.dot }} />
                          <h3>{sec.label}</h3>
                          <span className="count">{items.length}</span>
                        </div>
                        <div className={viewMode === 'grid' ? 'task-grid' : 'task-list-stack'}>
                          {items.map((t) => (
                            <TaskCard
                              key={t.id}
                              task={t}
                              interactive
                              compact={viewMode === 'list'}
                              onUpdateStatus={handleUpdate}
                              onAddRemark={tenantFeatures.remarks !== false ? handleAddRemark : undefined}
                              busy={busyId === t.id}
                              viewingDate={date}
                            />
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </main>

        {tenantFeatures.routines !== false && (
          <RoutineSidebar
            routines={routines}
            currentUser={session.user}
            canAssign={false}
            onToggleRoutine={handleToggleRoutine}
          />
        )}
      </div>
    </div>
  );
}
