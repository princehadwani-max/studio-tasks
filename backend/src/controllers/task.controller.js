const db = require('../db');
const {
  buildTaskWhatsAppMessage,
  buildWhatsAppUrl,
  sendWhatsAppNotification,
} = require('../services/whatsapp');

const DASHBOARD_ROLES = ['super_admin', 'admin', 'MD', 'manager', 'sales manager', 'sales_manager'];

const TASK_FIELDS = `
  t.id, t.code, t.title, t.description, t.task_date, t.status, t.priority,
  t.completion_note, t.created_at, t.updated_at, t.started_at, t.completed_at,
  au.id AS assigned_to_id, au.name AS assigned_to_name, au.phone AS assigned_to_phone, au.role_label AS assigned_to_role_label,
  ab.id AS assigned_by_id, ab.name AS assigned_by_name,
  COALESCE(
    (
      SELECT json_agg(
        json_build_object(
          'id', tr.id,
          'remark', tr.remark,
          'createdAt', tr.created_at,
          'author', json_build_object(
            'id', ru.id,
            'name', ru.name,
            'roleLabel', ru.role_label
          )
        )
        ORDER BY tr.created_at ASC
      )
      FROM task_remarks tr
      JOIN users ru ON ru.id = tr.user_id
      WHERE tr.task_id = t.id
    ),
    '[]'::json
  ) AS remarks
`;

const TASK_JOIN = `
  FROM tasks t
  JOIN users au ON au.id = t.assigned_to
  JOIN users ab ON ab.id = t.assigned_by
`;

function shapeTask(row) {
  const shaped = {
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description,
    taskDate: row.task_date,
    status: row.status,
    priority: row.priority,
    completionNote: row.completion_note,
    remarks: row.remarks || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    assignedTo: {
      id: row.assigned_to_id,
      name: row.assigned_to_name,
      phone: row.assigned_to_phone || '',
      roleLabel: row.assigned_to_role_label,
    },
    assignedBy: { id: row.assigned_by_id, name: row.assigned_by_name },
  };
  shaped.whatsappUrl = buildWhatsAppUrl(shaped.assignedTo.phone, buildTaskWhatsAppMessage(shaped));
  return shaped;
}

// Admin, MD, or Manager assigns a task to any active team member in their company.
async function createTask(req, res) {
  const { title, description, assignedTo, taskDate, priority } = req.body;

  if (!title || !assignedTo) {
    return res.status(400).json({ error: 'A title and an assignee are required.' });
  }

  try {
    const assignee = await db.query(
      `SELECT id, role, active FROM users WHERE id = $1 AND company_id = $2`,
      [assignedTo, req.tenantId]
    );
    if (assignee.rowCount === 0) {
      return res.status(404).json({ error: 'That team member does not exist in this company.' });
    }
    if (!assignee.rows[0].active) {
      return res.status(400).json({ error: "You can't assign work to a removed team member." });
    }

    // Generate per-company sequential task code (e.g. TSK-0001 per tenant)
    const seqRes = await db.query(
      `UPDATE companies
       SET task_seq = GREATEST(
         task_seq + 1,
         COALESCE((SELECT MAX(NULLIF(REGEXP_REPLACE(code, '[^0-9]', '', 'g'), '')::int) FROM tasks WHERE company_id = $1), 0) + 1
       )
       WHERE id = $1
       RETURNING task_seq`,
      [req.tenantId]
    );
    const code = `TSK-${String(seqRes.rows[0].task_seq).padStart(4, '0')}`;

    const { rows } = await db.query(
      `INSERT INTO tasks (company_id, code, title, description, assigned_to, assigned_by, task_date, priority)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, CURRENT_DATE), COALESCE($8, 'normal'))
       RETURNING id`,
      [req.tenantId, code, title, description || null, assignedTo, req.user.id, taskDate || null, priority || null]
    );

    const full = await db.query(`SELECT ${TASK_FIELDS} ${TASK_JOIN} WHERE t.id = $1`, [rows[0].id]);
    const task = shapeTask(full.rows[0]);
    const companyName = req.tenant?.name || 'Starco Ceramics';

    let whatsapp = { sent: false, provider: 'disabled', whatsappUrl: task.whatsappUrl };
    if (req.tenant?.features?.whatsapp !== false) {
      whatsapp = await sendWhatsAppNotification(
        req.tenantId,
        task.assignedTo.phone,
        buildTaskWhatsAppMessage(task, companyName)
      );
    }
    return res.status(201).json({ task, whatsapp });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Could not create the task.' });
  }
}

// List tasks scoped to the active company (req.tenantId).
async function listTasks(req, res) {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const requestedUserId = req.query.userId ? Number(req.query.userId) : null;
  const status = req.query.status || null;

  const isDashboardUser = DASHBOARD_ROLES.includes(req.user.role);
  const targetUserId = isDashboardUser ? requestedUserId : req.user.id;

  const clauses = [
    `t.company_id = $1`,
    `(t.task_date = $2
        OR (t.task_date < $2 AND t.status != 'completed')
        OR (t.status = 'completed' AND t.completed_at::date = $2))`,
  ];
  const params = [req.tenantId, date];

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

// Roster sidebar summary scoped to the active company (req.tenantId).
async function dailySummary(req, res) {
  const isDashboardUser = DASHBOARD_ROLES.includes(req.user.role);
  if (!isDashboardUser) {
    return res.status(403).json({ error: 'Only an Admin, MD, or Manager can view the team summary.' });
  }
  const date = req.query.date || new Date().toISOString().slice(0, 10);

  try {
    const { rows } = await db.query(
      `SELECT u.id, u.name, u.phone, u.role, u.role_label,
              COUNT(t.id) FILTER (WHERE t.status = 'pending' AND t.task_date <= $1) AS pending,
              COUNT(t.id) FILTER (WHERE t.status = 'in_progress' AND t.task_date <= $1) AS in_progress,
              COUNT(t.id) FILTER (
                WHERE t.status = 'completed' AND (t.completed_at::date = $1 OR t.task_date = $1)
              ) AS completed
       FROM users u
       LEFT JOIN tasks t ON t.assigned_to = u.id AND t.company_id = u.company_id
       WHERE u.company_id = $2 AND u.role NOT IN ('super_admin', 'admin') AND u.active = true
       GROUP BY u.id
       ORDER BY CASE u.role
         WHEN 'MD' THEN 0
         WHEN 'manager' THEN 1
         WHEN 'sales manager' THEN 2
         WHEN 'sales_manager' THEN 2
         WHEN 'export_coordinator' THEN 3
         WHEN 'export coordinator' THEN 3
         WHEN 'designer' THEN 4
         ELSE 5
       END, u.name`,
      [date, req.tenantId]
    );

    return res.json({
      summary: rows.map((r) => {
        const pending = Number(r.pending);
        const inProgress = Number(r.in_progress);
        const completed = Number(r.completed);
        return {
          id: r.id,
          name: r.name,
          phone: r.phone || '',
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

// Chronological activity feed for a day scoped to req.tenantId.
async function activityFeed(req, res) {
  const isDashboardUser = DASHBOARD_ROLES.includes(req.user.role);
  if (!isDashboardUser) {
    return res.status(403).json({ error: 'Only an Admin, MD, or Manager can view the activity feed.' });
  }
  const date = req.query.date || new Date().toISOString().slice(0, 10);

  try {
    const { rows } = await db.query(
      `SELECT ${TASK_FIELDS} ${TASK_JOIN}
       WHERE t.company_id = $2
         AND ((t.started_at IS NOT NULL AND t.started_at::date = $1)
           OR (t.completed_at IS NOT NULL AND t.completed_at::date = $1))
       ORDER BY COALESCE(t.completed_at, t.started_at) DESC`,
      [date, req.tenantId]
    );
    return res.json({ activity: rows.map(shapeTask) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Could not load the activity feed.' });
  }
}

// Update a task's status within the active company.
async function updateStatus(req, res) {
  const { id } = req.params;
  const { status, completionNote } = req.body;

  const allowed = ['pending', 'in_progress', 'completed'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: 'Status must be pending, in_progress, or completed.' });
  }

  try {
    const existing = await db.query(
      `SELECT * FROM tasks WHERE id = $1 AND company_id = $2`,
      [id, req.tenantId]
    );
    if (existing.rowCount === 0) {
      return res.status(404).json({ error: 'Task not found.' });
    }
    const task = existing.rows[0];

    const isOwner = task.assigned_to === req.user.id;
    const isDashboardUser = DASHBOARD_ROLES.includes(req.user.role);

    if (!isOwner && !isDashboardUser) {
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
       WHERE id = $5 AND company_id = $6
       RETURNING id`,
      [status, completionNote || null, setStarted, setCompleted, id, req.tenantId]
    );

    const full = await db.query(`SELECT ${TASK_FIELDS} ${TASK_JOIN} WHERE t.id = $1`, [rows[0].id]);
    return res.json({ task: shapeTask(full.rows[0]) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Could not update the task.' });
  }
}

// Any member in the company can add a remark to share info regarding a task.
async function addRemark(req, res) {
  if (req.tenant?.features?.remarks === false && req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Task remarks are disabled for your company.' });
  }

  const { id } = req.params;
  const remarkText = (req.body.remark || '').trim();

  if (!remarkText) {
    return res.status(400).json({ error: 'Remark text is required.' });
  }

  try {
    const existing = await db.query(
      `SELECT id FROM tasks WHERE id = $1 AND company_id = $2`,
      [id, req.tenantId]
    );
    if (existing.rowCount === 0) {
      return res.status(404).json({ error: 'Task not found.' });
    }

    await db.query(
      `INSERT INTO task_remarks (company_id, task_id, user_id, remark) VALUES ($1, $2, $3, $4)`,
      [req.tenantId, id, req.user.id, remarkText]
    );
    await db.query(`UPDATE tasks SET updated_at = NOW() WHERE id = $1 AND company_id = $2`, [id, req.tenantId]);

    const full = await db.query(`SELECT ${TASK_FIELDS} ${TASK_JOIN} WHERE t.id = $1`, [id]);
    return res.status(201).json({ task: shapeTask(full.rows[0]) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Could not add the remark.' });
  }
}

// Admin, MD, or Manager permanently deletes a task within their company.
async function deleteTask(req, res) {
  const { id } = req.params;

  try {
    const { rows } = await db.query(
      `DELETE FROM tasks WHERE id = $1 AND company_id = $2 RETURNING id, code`,
      [id, req.tenantId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Task not found.' });
    }
    return res.json({ deleted: true, id: rows[0].id, code: rows[0].code });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Could not delete the task.' });
  }
}

module.exports = { createTask, listTasks, dailySummary, activityFeed, updateStatus, addRemark, deleteTask };
