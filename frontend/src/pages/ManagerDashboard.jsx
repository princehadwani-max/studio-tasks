import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api/client.js';
import TopBar from '../components/TopBar.jsx';
import RosterSidebar from '../components/RosterSidebar.jsx';
import TaskCard from '../components/TaskCard.jsx';
import AssignTaskForm from '../components/AssignTaskForm.jsx';
import ActivityLog from '../components/ActivityLog.jsx';
import TeamPanel from '../components/TeamPanel.jsx';
import RoutineSidebar from '../components/RoutineSidebar.jsx';

const todayStr = () => new Date().toISOString().slice(0, 10);

const COLUMNS = [
  { key: 'pending', label: 'Pending', dot: 'var(--amber)' },
  { key: 'in_progress', label: 'In progress', dot: 'var(--teal)' },
  { key: 'completed', label: 'Completed', dot: 'var(--green)' },
];

export default function ManagerDashboard() {
  const { session } = useAuth();
  const token = session.token;

  const [date, setDate] = useState(todayStr());
  const [tab, setTab] = useState('board');
  const [selectedUserId, setSelectedUserId] = useState(null);

  const [summary, setSummary] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [activity, setActivity] = useState([]);
  const [team, setTeam] = useState([]);
  const [routines, setRoutines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assignError, setAssignError] = useState('');
  const [assignSuccess, setAssignSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [busyTaskId, setBusyTaskId] = useState(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryRes, tasksRes, activityRes, teamRes, routinesRes] = await Promise.all([
        api.summary(token, date),
        api.listTasks(token, { date, userId: selectedUserId || undefined }),
        api.activity(token, date),
        api.listUsers(token),
        api.listRoutines(token, { userId: selectedUserId || undefined }),
      ]);
      setSummary(summaryRes.summary);
      setTasks(tasksRes.tasks);
      setActivity(activityRes.activity);
      setTeam(teamRes.users);
      setRoutines(routinesRes.routines);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [token, date, selectedUserId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleAssign = async (payload) => {
    setAssignError('');
    setAssignSuccess('');
    setSubmitting(true);
    try {
      const { task } = await api.createTask(token, payload);
      setAssignSuccess(`${task.code} assigned to ${task.assignedTo.name}.`);
      await loadAll();
      return true;
    } catch (err) {
      setAssignError(err.message);
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTask = async (id) => {
    setDeletingId(id);
    try {
      await api.deleteTask(token, id);
      await loadAll();
    } catch (err) {
      console.error(err);
      window.alert(err.message || 'Could not delete the task.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleCreateUser = async (payload) => {
    const { user } = await api.createUser(token, payload);
    await loadAll();
    return user;
  };

  const handleSetActive = async (id, active) => {
    await api.setUserActive(token, id, active);
    await loadAll();
  };

  const handleResetPassword = async (id, password) => {
    await api.resetPassword(token, id, password);
  };

  const handleUpdatePhone = async (id, phone) => {
    await api.updateUserPhone(token, id, phone);
    await loadAll();
  };

  const handleUpdateTaskStatus = async (id, payload) => {
    setBusyTaskId(id);
    try {
      await api.updateStatus(token, id, payload);
      await loadAll();
    } catch (err) {
      console.error(err);
    } finally {
      setBusyTaskId(null);
    }
  };

  const handleAddRemark = async (id, remark) => {
    await api.addTaskRemark(token, id, remark);
    await loadAll();
  };

  const handleCreateRoutine = async (payload) => {
    await api.createRoutine(token, payload);
    await loadAll();
  };

  const handleToggleRoutine = async (id) => {
    await api.toggleRoutine(token, id);
    await loadAll();
  };

  const handleDeleteRoutine = async (id) => {
    await api.deleteRoutine(token, id);
    await loadAll();
  };

  const assignableUsers = team
    .filter((u) => u.active && u.role !== 'admin')
    .map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role,
      roleLabel: u.role_label,
      role_label: u.role_label,
    }));

  const columnTasks = (statusKey) => tasks.filter((t) => t.status === statusKey);
  const carriedOverCount = tasks.filter((t) => t.taskDate && t.taskDate.slice(0, 10) < date).length;

  return (
    <div className="app-shell">
      <TopBar />
      <div className="main-layout">
        <RosterSidebar summary={summary} selectedUserId={selectedUserId} onSelect={setSelectedUserId} />

        <main className="content">
          <div className="content-header">
            <div>
              <h1>
                {selectedUserId
                  ? summary.find((p) => p.id === selectedUserId)?.name || 'Board'
                  : "Today's board"}
              </h1>
              <div className="subtitle">
                {tasks.length} task{tasks.length === 1 ? '' : 's'}
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

            <div className="tabs">
              <button className={`tab-btn ${tab === 'board' ? 'active' : ''}`} onClick={() => setTab('board')}>
                Board
              </button>
              <button className={`tab-btn ${tab === 'assign' ? 'active' : ''}`} onClick={() => setTab('assign')}>
                Assign work
              </button>
              <button
                className={`tab-btn ${tab === 'activity' ? 'active' : ''}`}
                onClick={() => setTab('activity')}
              >
                Activity log
              </button>
              <button className={`tab-btn ${tab === 'team' ? 'active' : ''}`} onClick={() => setTab('team')}>
                Team
              </button>
            </div>
          </div>

          {loading && <p style={{ color: 'var(--text-faint)' }}>Loading…</p>}

           {!loading && tab === 'board' && (
            <div className="board">
              {COLUMNS.map((col) => {
                const items = columnTasks(col.key);
                return (
                  <div key={col.key}>
                    <div className="board-col-head">
                      <span className="dot" style={{ background: col.dot }} />
                      <h3>{col.label}</h3>
                      <span className="count">{items.length}</span>
                    </div>
                    <div className="board-col-body">
                      {items.length === 0 && <div className="empty-col">No tasks here</div>}
                      {items.map((t) => (
                        <TaskCard
                          key={t.id}
                          task={t}
                          showAssignee
                          interactive={t.assignedTo?.id === session.user.id}
                          onUpdateStatus={handleUpdateTaskStatus}
                          onAddRemark={handleAddRemark}
                          busy={busyTaskId === t.id}
                          onDelete={handleDeleteTask}
                          deleting={deletingId === t.id}
                          viewingDate={date}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!loading && tab === 'assign' && (
            <AssignTaskForm
              team={assignableUsers}
              onSubmit={handleAssign}
              submitting={submitting}
              error={assignError}
              success={assignSuccess}
            />
          )}

          {!loading && tab === 'activity' && <ActivityLog activity={activity} />}
        
          {!loading && tab === 'team' && (
            <TeamPanel
              team={team}
              currentUserId={session.user.id}
              currentUserRole={session.user.role}
              onCreate={handleCreateUser}
              onSetActive={handleSetActive}
              onUpdatePhone={handleUpdatePhone}
              onResetPassword={handleResetPassword}
            />
          )}
        </main>

        <RoutineSidebar
          routines={routines}
          currentUser={session.user}
          canAssign
          assignableUsers={assignableUsers}
          selectedUserId={selectedUserId}
          onCreateRoutine={handleCreateRoutine}
          onToggleRoutine={handleToggleRoutine}
          onDeleteRoutine={handleDeleteRoutine}
        />
      </div>
    </div>
  );
}
