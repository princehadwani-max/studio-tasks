const db = require('../db');

const TASK_FIELDS = `
  t.id, t.code, t.title, t.description, t.task_date, t.status, t.priority,
  t.completion_note, t.created_at, t.updated_at, t.started_at, t.completed_at,
  au.id AS assigned_to_id, au.name AS assigned_to_name, au.role_label AS assigned_to_role_label,
  ab.id AS assigned_by_id, ab.name AS assigned_by_name
`;

const TASK_JOIN = `
  FROM tasks t
  JOIN users au ON au.id = t.assigned_to
  JOIN users ab ON ab.id = t.assigned_by
`;

function shapeTask(row) {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description,
    taskDate: row.task_date,
    status: row.status,
    priority: row.priority,
    completionNote: row.completion_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    assignedTo: { id: row.assigned_to_id, name: row.assigned_to_name, roleLabel: row.assigned_to_role_label },
    assignedBy: { id: row.assigned_by_id, name: row.assigned_by_name },
  };
}

// Manager assigns a task to a team member for a given day (defaults to today).
async function createTask(req, res) {
  const { title, description, assignedTo, taskDate, priority } = req.body;

  if (!title || !assignedTo) {
    return res.status(400).json({ error: 'A title and an assignee are required.' });
  }

  try {
    const assignee = await db.query(`SELECT id FROM users WHERE id = $1`, [assignedTo]);
    if (assignee.rowCount === 0) {
      return res.status(404).json({ error: 'That team member does not exist.' });
    }

    const codeRes = await db.query(`SELECT nextval('task_code_seq') AS n`);
    const code = `TSK-${String(codeRes.rows[0].n).padStart(4, '0')}`;

    const { rows } = await db.query(
      `INSERT INTO tasks (code, title, description, assigned_to, assigned_by, task_date, priority)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, CURRENT_DATE), COALESCE($7, 'normal'))
       RETURNING id`,
      [code, title, description || null, assignedTo, req.user.id, taskDate || null, priority || null]
    );

    const full = await db.query(`SELECT ${TASK_FIELDS} ${TASK_JOIN} WHERE t.id = $1`, [rows[0].id]);
    return res.status(201).json({ task: shapeTask(full.rows[0]) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Could not create the task.' });
  }
}

// List tasks. Managers may view anyone's day; everyone else only sees their own.
async function listTasks(req, res) {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const requestedUserId = req.query.userId ? Number(req.query.userId) : null;
  const status = req.query.status || null;

  const isManager = req.user.role === 'manager';
  const targetUserId = isManager ? requestedUserId : req.user.id;

  const clauses = [`t.task_date = $1`];
  const params = [date];

  if (targetUserId) {
    params.push(targetUserId);
    clauses.push(`t.assigned_to = $${params.length}`);
  }
  if (status) {
    params.push(status);
    clauses.push(`t.status = $${params.length}`);
  }

  try {
    const { rows } = await db.query(
      `SELECT ${TASK_FIELDS} ${TASK_JOIN} WHERE ${clauses.join(' AND ')} ORDER BY
         CASE t.status WHEN 'in_progress' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END, t.created_at`,
      params
    );
    return res.json({ tasks: rows.map(shapeTask) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Could not load tasks.' });
  }
}

// A rolled-up view for the manager: every team member's counts for the day,
// used to render the roster sidebar at a glance.
async function dailySummary(req, res) {
  if (req.user.role !== 'manager') {
    return res.status(403).json({ error: 'Only a manager can view the team summary.' });
  }
  const date = req.query.date || new Date().toISOString().slice(0, 10);

  try {
    const { rows } = await db.query(
      `SELECT u.id, u.name, u.role, u.role_label,
              COUNT(t.id) FILTER (WHERE t.task_date = $1) AS total,
              COUNT(t.id) FILTER (WHERE t.task_date = $1 AND t.status = 'pending') AS pending,
              COUNT(t.id) FILTER (WHERE t.task_date = $1 AND t.status = 'in_progress') AS in_progress,
              COUNT(t.id) FILTER (WHERE t.task_date = $1 AND t.status = 'completed') AS completed
       FROM users u
       LEFT JOIN tasks t ON t.assigned_to = u.id
       WHERE u.role != 'manager'
       GROUP BY u.id
       ORDER BY CASE u.role WHEN 'designer' THEN 0 ELSE 1 END, u.name`,
      [date]
    );
    return res.json({
      summary: rows.map((r) => ({
        id: r.id,
        name: r.name,
        role: r.role,
        roleLabel: r.role_label,
        total: Number(r.total),
        pending: Number(r.pending),
        inProgress: Number(r.in_progress),
        completed: Number(r.completed),
      })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Could not load the team summary.' });
  }
}

// Chronological activity feed for a day — "what happened, in order" —
// so the manager can see work completed throughout the day.
async function activityFeed(req, res) {
  if (req.user.role !== 'manager') {
    return res.status(403).json({ error: 'Only a manager can view the activity feed.' });
  }
  const date = req.query.date || new Date().toISOString().slice(0, 10);

  try {
    const { rows } = await db.query(
      `SELECT ${TASK_FIELDS} ${TASK_JOIN}
       WHERE t.task_date = $1 AND (t.started_at IS NOT NULL OR t.completed_at IS NOT NULL)
       ORDER BY COALESCE(t.completed_at, t.started_at) DESC`,
      [date]
    );
    return res.json({ activity: rows.map(shapeTask) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Could not load the activity feed.' });
  }
}

// Update a task's status. The assignee moves their own work along;
// a manager may also update any task (e.g. to reassign priority/status).
async function updateStatus(req, res) {
  const { id } = req.params;
  const { status, completionNote } = req.body;

  const allowed = ['pending', 'in_progress', 'completed'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: 'Status must be pending, in_progress, or completed.' });
  }

  try {
    const existing = await db.query(`SELECT * FROM tasks WHERE id = $1`, [id]);
    if (existing.rowCount === 0) {
      return res.status(404).json({ error: 'Task not found.' });
    }
    const task = existing.rows[0];

    const isOwner = task.assigned_to === req.user.id;
    const isManager = req.user.role === 'manager';
    if (!isOwner && !isManager) {
      return res.status(403).json({ error: 'You can only update your own tasks.' });
    }

    const setStarted = status === 'in_progress' && !task.started_at;
    const setCompleted = status === 'completed';

    const { rows } = await db.query(
      `UPDATE tasks SET
         status = $1,
         completion_note = COALESCE($2, completion_note),
         started_at = CASE WHEN $3 THEN NOW() ELSE started_at END,
         completed_at = CASE WHEN $4 THEN NOW() ELSE completed_at END,
         updated_at = NOW()
       WHERE id = $5
       RETURNING id`,
      [status, completionNote || null, setStarted, setCompleted, id]
    );

    const full = await db.query(`SELECT ${TASK_FIELDS} ${TASK_JOIN} WHERE t.id = $1`, [rows[0].id]);
    return res.json({ task: shapeTask(full.rows[0]) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Could not update the task.' });
  }
}

module.exports = { createTask, listTasks, dailySummary, activityFeed, updateStatus };
