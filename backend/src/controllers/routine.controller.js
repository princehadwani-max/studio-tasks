const db = require('../db');

const DASHBOARD_ROLES = ['admin', 'MD', 'manager', 'sales manager', 'sales_manager'];

const ROUTINE_FIELDS = `
  r.id, r.title, r.description, r.frequency, r.last_completed_at, r.created_at,
  CASE
    WHEN r.frequency = 'daily' THEN (r.last_completed_at IS NOT NULL AND r.last_completed_at::date = CURRENT_DATE)
    WHEN r.frequency = 'monthly' THEN (r.last_completed_at IS NOT NULL AND date_trunc('month', r.last_completed_at) = date_trunc('month', NOW()))
    ELSE false
  END AS completed_for_period,
  au.id AS assigned_to_id, au.name AS assigned_to_name, au.role AS assigned_to_role, au.role_label AS assigned_to_role_label,
  ab.id AS assigned_by_id, COALESCE(ab.name, 'Manager') AS assigned_by_name
`;

const ROUTINE_JOIN = `
  FROM routine_tasks r
  JOIN users au ON au.id = r.assigned_to
  LEFT JOIN users ab ON ab.id = r.assigned_by
`;

function shapeRoutine(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    frequency: row.frequency,
    completed: Boolean(row.completed_for_period),
    lastCompletedAt: row.last_completed_at,
    createdAt: row.created_at,
    assignedTo: {
      id: row.assigned_to_id,
      name: row.assigned_to_name,
      role: row.assigned_to_role,
      roleLabel: row.assigned_to_role_label,
    },
    assignedBy: {
      id: row.assigned_by_id,
      name: row.assigned_by_name,
    },
  };
}

// List routine tasks:
// - Admin, MD, and Managers see all routine tasks.
// - Employees see only their own routine tasks.
async function listRoutines(req, res) {
  const requestedUserId = req.query.userId ? Number(req.query.userId) : null;
  const frequency = req.query.frequency || null;

  const isDashboardUser = DASHBOARD_ROLES.includes(req.user.role);
  const targetUserId = isDashboardUser ? requestedUserId : req.user.id;

  const clauses = ['au.active = true'];
  const params = [];

  if (targetUserId) {
    params.push(targetUserId);
    clauses.push(`r.assigned_to = $${params.length}`);
  }

  if (frequency && ['daily', 'monthly'].includes(frequency)) {
    params.push(frequency);
    clauses.push(`r.frequency = $${params.length}`);
  }

  try {
    const { rows } = await db.query(
      `SELECT ${ROUTINE_FIELDS} ${ROUTINE_JOIN}
       WHERE ${clauses.join(' AND ')}
       ORDER BY au.name, r.created_at DESC`,
      params
    );
    return res.json({ routines: rows.map(shapeRoutine) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Could not load routine tasks.' });
  }
}

// Admin, MD, or Manager creates a Daily or Monthly routine task for an employee or manager.
async function createRoutine(req, res) {
  const { title, description, frequency, assignedTo } = req.body;

  if (!title || !assignedTo) {
    return res.status(400).json({ error: 'A task title and assignee are required.' });
  }
  const freq = frequency === 'monthly' ? 'monthly' : 'daily';

  try {
    const assignee = await db.query(`SELECT id, active FROM users WHERE id = $1`, [assignedTo]);
    if (assignee.rowCount === 0) {
      return res.status(404).json({ error: 'Team member not found.' });
    }
    if (!assignee.rows[0].active) {
      return res.status(400).json({ error: "You can't assign routines to a removed team member." });
    }

    const { rows } = await db.query(
      `INSERT INTO routine_tasks (title, description, frequency, assigned_to, assigned_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [title.trim(), description ? description.trim() : null, freq, assignedTo, req.user.id]
    );

    const full = await db.query(`SELECT ${ROUTINE_FIELDS} ${ROUTINE_JOIN} WHERE r.id = $1`, [rows[0].id]);
    return res.status(201).json({ routine: shapeRoutine(full.rows[0]) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Could not create the routine task.' });
  }
}

// Toggle routine completion for today (daily) or this month (monthly).
async function toggleRoutine(req, res) {
  const { id } = req.params;

  try {
    const existing = await db.query(
      `SELECT r.*, au.role AS assignee_role,
              CASE
                WHEN r.frequency = 'daily' THEN (r.last_completed_at IS NOT NULL AND r.last_completed_at::date = CURRENT_DATE)
                WHEN r.frequency = 'monthly' THEN (r.last_completed_at IS NOT NULL AND date_trunc('month', r.last_completed_at) = date_trunc('month', NOW()))
                ELSE false
              END AS completed_for_period
       FROM routine_tasks r
       JOIN users au ON au.id = r.assigned_to
       WHERE r.id = $1`,
      [id]
    );
    if (existing.rowCount === 0) {
      return res.status(404).json({ error: 'Routine task not found.' });
    }
    const routine = existing.rows[0];

    const isOwner = routine.assigned_to === req.user.id;
    const isDashboardUser = DASHBOARD_ROLES.includes(req.user.role);

    if (!isOwner && !isDashboardUser) {
      return res.status(403).json({ error: 'You do not have permission to update this routine.' });
    }

    const nextCompleted = !routine.completed_for_period;
    await db.query(
      `UPDATE routine_tasks
       SET last_completed_at = CASE WHEN $1 THEN NOW() ELSE NULL END
       WHERE id = $2`,
      [nextCompleted, id]
    );

    const full = await db.query(`SELECT ${ROUTINE_FIELDS} ${ROUTINE_JOIN} WHERE r.id = $1`, [id]);
    return res.json({ routine: shapeRoutine(full.rows[0]) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Could not update the routine task.' });
  }
}

// Delete a routine task.
async function deleteRoutine(req, res) {
  const { id } = req.params;

  try {
    const { rows } = await db.query(`DELETE FROM routine_tasks WHERE id = $1 RETURNING id`, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Routine task not found.' });
    }
    return res.json({ deleted: true, id: rows[0].id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Could not delete the routine task.' });
  }
}

module.exports = { listRoutines, createRoutine, toggleRoutine, deleteRoutine };
