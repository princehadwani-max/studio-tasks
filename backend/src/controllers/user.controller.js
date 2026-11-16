const bcrypt = require('bcryptjs');
const db = require('../db');

const ROLES = [
  'admin',
  'MD',
  'manager',
  'sales manager',
  'sales_manager',
  'designer',
  'operation_coordinator',
  'export coordinator',
  'export_coordinator',
];

const ADMIN_ROLES = ['admin', 'MD'];

const ROLE_DEFAULT_LABEL = {
  admin: 'Admin',
  MD: 'MD',
  manager: 'Manager',
  'sales manager': 'Sales Manager',
  sales_manager: 'Sales Manager',
  designer: 'Designer',
  operation_coordinator: 'Operation Coordinator',
  'export coordinator': 'Export Coordinator',
  export_coordinator: 'Export Coordinator',
};

function isUniqueViolation(err) {
  return err && err.code === '23505';
}

// List the team roster (used by admin/MD/manager to pick who to assign work to,
// manage the team, and restore removed members).
async function listUsers(req, res) {
  try {
    const { rows } = await db.query(
      `SELECT id, name, username, phone, role, role_label, active FROM users ORDER BY
         CASE role
           WHEN 'admin' THEN 0
           WHEN 'MD' THEN 1
           WHEN 'manager' THEN 2
           WHEN 'sales manager' THEN 3
           WHEN 'sales_manager' THEN 3
           WHEN 'export_coordinator' THEN 4
           WHEN 'export coordinator' THEN 4
           WHEN 'designer' THEN 5
           ELSE 6
         END, name`
    );
    return res.json({ users: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Could not load the team roster.' });
  }
}

// Admin, MD, or Manager adds a new team member with their own username/password/phone.
async function createUser(req, res) {
  let { name, username, phone, password, role, roleLabel } = req.body;

  name = (name || '').trim();
  username = (username || '').toLowerCase().trim();
  phone = (phone || '').trim();
  role = (role || '').trim();
  roleLabel = (roleLabel || '').trim();

  if (!name || !username || !phone || !password || !role) {
    return res.status(400).json({ error: 'Name, username, phone number, password, and role are required.' });
  }
  if (!/^[0-9+\-\s()]{7,20}$/.test(phone)) {
    return res.status(400).json({ error: 'Please enter a valid phone number (7–20 digits).' });
  }
  if (!ROLES.includes(role)) {
    return res.status(400).json({ error: 'Invalid role selected.' });
  }
  const isAdminOrMD = ADMIN_ROLES.includes(req.user.role);
  if (!isAdminOrMD && ADMIN_ROLES.includes(role)) {
    return res.status(403).json({ error: 'Only an Admin or MD can create an Admin or MD account.' });
  }
  if (!/^[a-z0-9_.]{3,50}$/.test(username)) {
    return res
      .status(400)
      .json({ error: 'Username must be 3+ characters: lowercase letters, numbers, "." or "_" only.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }
  if (!roleLabel) roleLabel = ROLE_DEFAULT_LABEL[role] || role;

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      `INSERT INTO users (name, username, phone, password_hash, role, role_label)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, username, phone, role, role_label, active`,
      [name, username, phone, passwordHash, role, roleLabel]
    );
    return res.status(201).json({ user: rows[0] });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({ error: 'That username is already taken.' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Could not add the team member.' });
  }
}

// Remove or restore a team member (soft delete: active = false).
// Admin, MD, and Manager can remove/restore team members.
async function setActive(req, res) {
  const { id } = req.params;
  const { active } = req.body;

  if (typeof active !== 'boolean') {
    return res.status(400).json({ error: 'active must be true or false.' });
  }

  const targetId = Number(id);

  if (!active && targetId === req.user.id) {
    return res.status(400).json({ error: "You can't remove your own account while signed in." });
  }

  try {
    const existing = await db.query(`SELECT id, role, active FROM users WHERE id = $1`, [targetId]);
    if (existing.rowCount === 0) {
      return res.status(404).json({ error: 'Team member not found.' });
    }
    const target = existing.rows[0];
    const isAdminOrMD = ADMIN_ROLES.includes(req.user.role);

    if (ADMIN_ROLES.includes(target.role) && !isAdminOrMD) {
      return res.status(403).json({ error: 'Managers cannot remove or modify an Admin or MD account.' });
    }

    if (!active && ADMIN_ROLES.includes(target.role)) {
      const { rows } = await db.query(
        `SELECT COUNT(*)::int AS n FROM users WHERE role = ANY($1) AND active = true`,
        [ADMIN_ROLES]
      );
      if (rows[0].n <= 1) {
        return res.status(400).json({ error: 'You cannot remove the last active Admin/MD.' });
      }
    }

    const { rows } = await db.query(
      `UPDATE users SET active = $1 WHERE id = $2
       RETURNING id, name, username, phone, role, role_label, active`,
      [active, targetId]
    );
    return res.json({ user: rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Could not update that team member.' });
  }
}

// Update a team member's phone number.
async function updatePhone(req, res) {
  const { id } = req.params;
  const phone = (req.body.phone || '').trim();

  if (!phone || !/^[0-9+\-\s()]{7,20}$/.test(phone)) {
    return res.status(400).json({ error: 'Please enter a valid phone number (7–20 digits).' });
  }

  try {
    const { rows } = await db.query(
      `UPDATE users SET phone = $1 WHERE id = $2
       RETURNING id, name, username, phone, role, role_label, active`,
      [phone, Number(id)]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Team member not found.' });
    }
    return res.json({ user: rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Could not update the phone number.' });
  }
}

// Admin, MD, or Manager sets a new password for an account.
async function resetPassword(req, res) {
  const { id } = req.params;
  const { password } = req.body;

  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const targetId = Number(id);

  try {
    const existing = await db.query(`SELECT id, name, username, role FROM users WHERE id = $1`, [targetId]);
    if (existing.rowCount === 0) {
      return res.status(404).json({ error: 'Team member not found.' });
    }
    const target = existing.rows[0];
    const isAdminOrMD = ADMIN_ROLES.includes(req.user.role);

    if (ADMIN_ROLES.includes(target.role) && !isAdminOrMD) {
      return res.status(403).json({ error: 'Only an Admin or MD can reset an Admin/MD password.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      `UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id, name, username`,
      [passwordHash, targetId]
    );
    return res.json({ ok: true, id: rows[0].id, name: rows[0].name });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Could not update the password.' });
  }
}

module.exports = { listUsers, createUser, setActive, updatePhone, resetPassword };
