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
import SuperAdminPanel from '../components/SuperAdminPanel.jsx';

const todayStr = () => new Date().toISOString().slice(0, 10);

const COLUMNS = [
  { key: 'pending', label: 'Pending', dot: 'var(--amber)' },
  { key: 'in_progress', label: 'In progress', dot: 'var(--teal)' },
  { key: 'completed', label: 'Completed', dot: 'var(--green)' },
];

export default function ManagerDashboard() {
  const { session, activeTenant, switchTenant } = useAuth();
  const token = session.token;
  const isSuperAdmin = session.user.role === 'super_admin';
  const inTenantWorkspace = !isSuperAdmin || Boolean(activeTenant);
  const tenantId = activeTenant?.id || session.user.companyId || 1;
  const tenantFeatures = activeTenant?.features || session.user.companyFeatures || {
    whatsapp: true,
    routines: true,
    remarks: true,
    team_management: true,
  };

  const [date, setDate] = useState(todayStr());
  const [tab, setTab] = useState(isSuperAdmin && !activeTenant ? 'saas' : 'board');
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'pending' | 'in_progress' | 'completed'
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'

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
  const [routineModalOpen, setRoutineModalOpen] = useState(false);

  const loadAll = useCallback(async () => {
    if (!inTenantWorkspace) {
      setLoading(false);
      return;
    }
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
  }, [token, date, selectedUserId, tenantId, inTenantWorkspace]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleAssign = async (payload) => {
    setAssignError('');
    setAssignSuccess('');
    setSubmitting(true);
    try {
      const { task, whatsapp } = await api.createTask(token, payload);
      if (whatsapp?.sent) {
        setAssignSuccess(
          `${task.code} assigned to ${task.assignedTo.name} · Sent to WhatsApp immediately!`
        );
      } else {
        setAssignSuccess(
          `${task.code} assigned to ${task.assignedTo.name}. (Link WhatsApp in Team tab for automatic background messages)`
        );
      }
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
    .filter((u) => u.active && !['super_admin', 'admin'].includes(u.role))
    .map((u) => ({
      id: u.id,
      name: u.name,
      phone: u.phone || '',
      role: u.role,
      roleLabel: u.role_label,
      role_label: u.role_label,
    }));

  const handleSelectTenantFromCommandCenter = (tenant, goToBoard = true) => {
    setSelectedUserId(null);
    switchTenant(tenant);
    if (goToBoard) {
      setTab('board');
    }
  };

  const filteredTasks = tasks.filter((t) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.title?.toLowerCase().includes(q) ||
      t.code?.toLowerCase().includes(q) ||
      t.description?.toLowerCase().includes(q) ||
      t.assignedTo?.name?.toLowerCase().includes(q)
    );
  });

  const columnTasks = (statusKey) => filteredTasks.filter((t) => t.status === statusKey);
  const visibleTasks =
    statusFilter === 'all' ? filteredTasks : filteredTasks.filter((t) => t.status === statusFilter);
  const carriedOverCount = tasks.filter(
    (t) => t.taskDate && t.taskDate.slice(0, 10) < date && t.status !== 'completed'
  ).length;

  const counts = {
    all: filteredTasks.length,
    in_progress: columnTasks('in_progress').length,
    pending: columnTasks('pending').length,
    completed: columnTasks('completed').length,
  };

  // When Super Admin is at the platform level (not inside any specific tenant workspace),
  // render the SaaS Command Center directly without any tenant sidebar.
  if (isSuperAdmin && !activeTenant) {
    return (
      <div className="app-shell">
        <TopBar />
        <div className="main-layout">
          <main className="content" style={{ maxWidth: 1080, margin: '0 auto', width: '100%' }}>
            <div className="content-header">
              <div>
                <h1>⚡ SaaS Command Center</h1>
                <div className="subtitle">
                  Global platform control · Select any tenant company below to enter its workspace.
                </div>
              </div>
            </div>
            <SuperAdminPanel
              token={token}
              activeTenant={activeTenant}
              onSelectTenant={handleSelectTenantFromCommandCenter}
            />
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <TopBar />
      <div className="main-layout">
        {tab !== 'saas' && (
          <RosterSidebar
            summary={summary}
            selectedUserId={selectedUserId}
            onSelect={setSelectedUserId}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
          />
        )}

        <main className="content">
          <div className="content-header">
            <div className="content-header-top">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                {tab !== 'saas' && sidebarCollapsed && (
                  <button
                    type="button"
                    className="sidebar-expand-btn"
                    onClick={() => setSidebarCollapsed(false)}
                    title="Show team sidebar"
                  >
                    » Team
                  </button>
                )}
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
              </div>

              {tenantFeatures.routines !== false && tab !== 'saas' && (
                <button
                  type="button"
                  className="routine-popup-trigger-btn"
                  onClick={() => setRoutineModalOpen(true)}
                >
                  Routine Tasks
                </button>
              )}
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
              {(tenantFeatures.team_management !== false || isSuperAdmin) && (
                <button className={`tab-btn ${tab === 'team' ? 'active' : ''}`} onClick={() => setTab('team')}>
                  Team
                </button>
              )}
              {isSuperAdmin && (
                <button
                  className={`tab-btn ${tab === 'saas' ? 'active' : ''}`}
                  onClick={() => setTab('saas')}
                  style={{ color: tab === 'saas' ? 'var(--amber)' : undefined }}
                >
                  ⚡ SaaS Command Center
                </button>
              )}
            </div>
          </div>

          {loading && <p style={{ color: 'var(--text-faint)' }}>Loading…</p>}

          {!loading && tab === 'board' && (
            <>
              {/* Command Filter & Search Bar */}
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
                    placeholder="Filter tasks or person…"
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
                  <h3>No tasks match this view</h3>
                  <p>
                    {searchQuery
                      ? 'Try clearing your search filter.'
                      : 'Assign a new task from the "Assign work" tab to get started.'}
                  </p>
                </div>
              ) : statusFilter !== 'all' ? (
                <div className={viewMode === 'grid' ? 'task-grid' : 'task-list-stack'}>
                  {visibleTasks.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      showAssignee
                      interactive
                      compact={viewMode === 'list'}
                      onUpdateStatus={handleUpdateTaskStatus}
                      onAddRemark={tenantFeatures.remarks !== false ? handleAddRemark : undefined}
                      busy={busyTaskId === t.id}
                      onDelete={handleDeleteTask}
                      deleting={deletingId === t.id}
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
                              showAssignee
                              interactive
                              compact={viewMode === 'list'}
                              onUpdateStatus={handleUpdateTaskStatus}
                              onAddRemark={tenantFeatures.remarks !== false ? handleAddRemark : undefined}
                              busy={busyTaskId === t.id}
                              onDelete={handleDeleteTask}
                              deleting={deletingId === t.id}
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
              token={token}
              companyName={activeTenant?.name || session.user.companyName || 'Starco Ceramics'}
              whatsappEnabled={tenantFeatures.whatsapp !== false}
              currentUserId={session.user.id}
              currentUserRole={session.user.role}
              onCreate={handleCreateUser}
              onSetActive={handleSetActive}
              onUpdatePhone={handleUpdatePhone}
              onResetPassword={handleResetPassword}
            />
          )}

          {!loading && tab === 'saas' && isSuperAdmin && (
            <SuperAdminPanel
              token={token}
              activeTenant={activeTenant}
              onSelectTenant={handleSelectTenantFromCommandCenter}
            />
          )}
        </main>

        {tenantFeatures.routines !== false && tab !== 'saas' && (
          <RoutineSidebar
            routines={routines}
            currentUser={session.user}
            canAssign
            assignableUsers={assignableUsers}
            selectedUserId={selectedUserId}
            onCreateRoutine={handleCreateRoutine}
            onToggleRoutine={handleToggleRoutine}
            onDeleteRoutine={handleDeleteRoutine}
            mobileOpen={routineModalOpen}
            onCloseMobile={() => setRoutineModalOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
