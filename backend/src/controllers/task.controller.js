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
    if (!assignee.rows[0].active) {
      return res.status(400).json({ error: "You can't assign work to a removed team member." });
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

//  List tasks. Managers may view anyone's day; everyone else only sees their own.
// A day's list includes: that day's own tasks, PLUS anything still open
// (pending/in_progress) carried forward from earlier days, PLUS anything
// actually wrapped on that day even if it was assigned earlier — so
// unfinished work never quietly disappears, and finishing a carried-over
// task shows up as completed on the day it was actually finished.
async function listTasks(req, res) {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const requestedUserId = req.query.userId ? Number(req.query.userId) : null;
  const status = req.query.status || null;

  const isManager = req.user.role === 'manager';
  const targetUserId = isManager ? requestedUserId : req.user.id;

 const clauses = [
    `(t.task_date = $1
        OR (t.task_date < $1 AND t.status != 'completed')
        OR (t.status = 'completed' AND t.completed_at::date = $1))`,
  ];
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
// used to render the roster sidebar at a glance. "Pending"/"in progress"
// include anything still open from earlier days (carried forward), so the
// sidebar reflects what's genuinely outstanding today, not just what was
// newly assigned today. A task counts as "completed" for a given day if it
// was actually finished that day, OR it was originally assigned that day
// and has since been resolved — so a carried-over task shows as wrapped
// both on the day it was finished and, historically, on the day it was
// first assigned.
async function dailySummary(req, res) {
  if (req.user.role !== 'manager') {
    return res.status(403).json({ error: 'Only a manager can view the team summary.' });
  }
  const date = req.query.date || new Date().toISOString().slice(0, 10);

  try {
    const { rows } = await db.query(
      `SELECT u.id, u.name, u.role, u.role_label,
              COUNT(t.id) FILTER (WHERE t.status = 'pending' AND t.task_date <= $1) AS pending,
              COUNT(t.id) FILTER (WHERE t.status = 'in_progress' AND t.task_date <= $1) AS in_progress,
              COUNT(t.id) FILTER (
                WHERE t.status = 'completed' AND (t.completed_at::date = $1 OR t.task_date = $1)
              ) AS completed
       FROM users u
       LEFT JOIN tasks t ON t.assigned_to = u.id
       WHERE u.role != 'manager' AND u.active = true
       GROUP BY u.id
       ORDER BY CASE u.role WHEN 'designer' THEN 0 ELSE 1 END, u.name`,
      [date]
    );
    return res.json({
      summary: rows.map((r) => {
        const pending = Number(r.pending);
        const inProgress = Number(r.in_progress);
        const completed = Number(r.completed);
        return {
          id: r.id,
          name: r.name,
          role: r.role,
          roleLabel: r.role_label,
          total: pending + inProgress + completed,
          pending,
          inProgress,
          completed,
        };
      }),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Could not load the team summary.' });
  }
}

// Chronological activity feed for a day — "what happened, in order" —
// so the manager can see work started or completed throughout the day.
// Based on when the action actually happened, not the task's original
// assignment date, so working on a carried-over task today shows up in
// today's log (not buried under the day it was first assigned).
async function activityFeed(req, res) {
  if (req.user.role !== 'manager') {
    return res.status(403).json({ error: 'Only a manager can view the activity feed.' });
  }
  const date = req.query.date || new Date().toISOString().slice(0, 10);

  try {
    const { rows } = await db.query(
      `SELECT ${TASK_FIELDS} ${TASK_JOIN}
       WHERE (t.started_at IS NOT NULL AND t.started_at::date = $1)
          OR (t.completed_at IS NOT NULL AND t.completed_at::date = $1)
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

// Manager permanently deletes a task — e.g. one assigned by mistake.
// This also removes it from the activity log, since the log is derived
// directly from task rows.
async function deleteTask(req, res) {
  const { id } = req.params;

  try {
    const { rows } = await db.query(`DELETE FROM tasks WHERE id = $1 RETURNING id, code`, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Task not found.' });
    }
    return res.json({ deleted: true, id: rows[0].id, code: rows[0].code });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Could not delete the task.' });
  }
}

module.exports = { createTask, listTasks, dailySummary, activityFeed, updateStatus };
