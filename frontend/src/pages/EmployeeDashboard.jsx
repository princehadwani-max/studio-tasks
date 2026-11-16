import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api/client.js';
import TopBar from '../components/TopBar.jsx';
import TaskCard from '../components/TaskCard.jsx';
import RoutineSidebar from '../components/RoutineSidebar.jsx';

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function EmployeeDashboard() {
  const { session } = useAuth();
  const token = session.token;

  const [date, setDate] = useState(todayStr());
  const [tasks, setTasks] = useState([]);
  const [routines, setRoutines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

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

  const todo = tasks.filter((t) => t.status !== 'completed');
  const done = tasks.filter((t) => t.status === 'completed');
  const isToday = date === todayStr();
  const carriedOverCount = todo.filter((t) => t.taskDate && t.taskDate.slice(0, 10) < date).length;

  return (
    <div className="app-shell">
      <TopBar />
      <div className="main-layout">
        <main className="content" style={{ maxWidth: 760, margin: '0 auto', width: '100%' }}>
          <div className="content-header">
            <div>
              <h1>{isToday ? "Today's call sheet" : 'Call sheet'}</h1>
              <div className="subtitle">
                {todo.length} to do
                {carriedOverCount > 0 && (
                  <>
                    {' '}
                    (<span style={{ color: 'var(--amber)' }}>{carriedOverCount} from before</span>)
                  </>
                )}{' '}
                · {done.length} done ·{' '}
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

          {!loading && tasks.length === 0 && (
            <div className="empty-state">
              <h3>Nothing assigned {isToday ? 'today' : 'for this day'}</h3>
              <p>When your manager assigns you work, it'll show up here.</p>
            </div>
          )}

         {!loading && todo.length > 0 && (
            <>
              <div className="board-col-head" style={{ marginTop: 4 }}>
                <span className="dot" style={{ background: 'var(--amber)' }} />
                <h3>To do</h3>
                <span className="count">{todo.length}</span>
              </div>
              <div className="board-col-body" style={{ marginBottom: 28 }}>
                {todo.map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    interactive
                    onUpdateStatus={handleUpdate}
                    onAddRemark={handleAddRemark}
                    busy={busyId === t.id}
                    viewingDate={date}
                  />
                ))}
              </div>
            </>
          )}

          {!loading && done.length > 0 && (
            <>
              <div className="board-col-head">
                <span className="dot" style={{ background: 'var(--green)' }} />
                <h3>Completed {isToday ? 'today' : ''}</h3>
                <span className="count">{done.length}</span>
              </div>
              <div className="board-col-body">
                {done.map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    interactive={false}
                    onAddRemark={handleAddRemark}
                  />
                ))}
              </div>
            </>
          )}
        </main>

        <RoutineSidebar
          routines={routines}
          currentUser={session.user}
          canAssign={false}
          onToggleRoutine={handleToggleRoutine}
        />
      </div>
    </div>
  );
}
