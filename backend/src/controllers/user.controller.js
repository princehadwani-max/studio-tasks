const bcrypt = require('bcryptjs');
const db = require('../db');

const ROLES = [
  'super_admin',
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

const ADMIN_ROLES = ['super_admin', 'admin', 'MD'];

const ROLE_DEFAULT_LABEL = {
  super_admin: 'Super Admin',
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

// List the team roster for the active company workspace (req.tenantId).
async function listUsers(req, res) {
  try {
    const { rows } = await db.query(
      `SELECT id, company_id, name, username, phone, role, role_label, active
       FROM users
       WHERE company_id = $1
       ORDER BY
         CASE role
           WHEN 'super_admin' THEN 0
           WHEN 'admin' THEN 1
           WHEN 'MD' THEN 2
           WHEN 'manager' THEN 3
           WHEN 'sales manager' THEN 4
           WHEN 'sales_manager' THEN 4
           WHEN 'export_coordinator' THEN 5
           WHEN 'export coordinator' THEN 5
           WHEN 'designer' THEN 6
           ELSE 7
         END, name`,
      [req.tenantId]
    );
    return res.json({ users: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Could not load the team roster.' });
  }
}

// Admin, MD, or Manager adds a new team member within their company.
async function createUser(req, res) {
  if (req.tenant?.features?.team_management === false && req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Team management is disabled for your company.' });
  }

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
  if (role === 'super_admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Only the platform Super Admin can grant Super Admin rights.' });
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
      `INSERT INTO users (company_id, name, username, phone, password_hash, role, role_label)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, company_id, name, username, phone, role, role_label, active`,
      [req.tenantId, name, username, phone, passwordHash, role, roleLabel]
    );
    return res.status(201).json({ user: rows[0] });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({ error: 'That username is already taken in this company.' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Could not add the team member.' });
  }
}

// Remove or restore a team member within the company.
async function setActive(req, res) {
  if (req.tenant?.features?.team_management === false && req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Team management is disabled for your company.' });
  }

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
    const existing = await db.query(
      `SELECT id, role, active FROM users WHERE id = $1 AND company_id = $2`,
      [targetId, req.tenantId]
    );
    if (existing.rowCount === 0) {
      return res.status(404).json({ error: 'Team member not found.' });
    }
    const target = existing.rows[0];

    if (target.role === 'super_admin') {
      return res.status(403).json({ error: 'The platform Super Admin account cannot be deactivated.' });
    }

    const isAdminOrMD = ADMIN_ROLES.includes(req.user.role);
    if (ADMIN_ROLES.includes(target.role) && !isAdminOrMD) {
      return res.status(403).json({ error: 'Managers cannot remove or modify an Admin or MD account.' });
    }

    if (!active && ADMIN_ROLES.includes(target.role)) {
      const { rows } = await db.query(
        `SELECT COUNT(*)::int AS n FROM users WHERE company_id = $1 AND role = ANY($2) AND active = true`,
        [req.tenantId, ADMIN_ROLES]
      );
      if (rows[0].n <= 1) {
        return res.status(400).json({ error: 'You cannot remove the last active Admin/MD in this company.' });
      }
    }

    const { rows } = await db.query(
      `UPDATE users SET active = $1 WHERE id = $2 AND company_id = $3
       RETURNING id, company_id, name, username, phone, role, role_label, active`,
      [active, targetId, req.tenantId]
    );
    return res.json({ user: rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Could not update that team member.' });
  }
}

// Update a team member's phone number within the company.
async function updatePhone(req, res) {
  const { id } = req.params;
  const phone = (req.body.phone || '').trim();

  if (!phone || !/^[0-9+\-\s()]{7,20}$/.test(phone)) {
    return res.status(400).json({ error: 'Please enter a valid phone number (7–20 digits).' });
  }

  try {
    const { rows } = await db.query(
      `UPDATE users SET phone = $1 WHERE id = $2 AND company_id = $3
       RETURNING id, company_id, name, username, phone, role, role_label, active`,
      [phone, Number(id), req.tenantId]
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

// Admin, MD, or Manager sets a new password for an account in their company.
async function resetPassword(req, res) {
  const { id } = req.params;
  const { password } = req.body;

  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const targetId = Number(id);

  try {
    const existing = await db.query(
      `SELECT id, name, username, role FROM users WHERE id = $1 AND company_id = $2`,
      [targetId, req.tenantId]
    );
    if (existing.rowCount === 0) {
      return res.status(404).json({ error: 'Team member not found.' });
    }
    const target = existing.rows[0];

    if (target.role === 'super_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only the Super Admin can change the Super Admin password.' });
    }

    const isAdminOrMD = ADMIN_ROLES.includes(req.user.role);
    if (ADMIN_ROLES.includes(target.role) && !isAdminOrMD) {
      return res.status(403).json({ error: 'Only an Admin or MD can reset an Admin/MD password.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      `UPDATE users SET password_hash = $1 WHERE id = $2 AND company_id = $3 RETURNING id, name, username`,
      [passwordHash, targetId, req.tenantId]
    );
    return res.json({ ok: true, id: rows[0].id, name: rows[0].name });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Could not update the password.' });
  }
}

module.exports = { listUsers, createUser, setActive, updatePhone, resetPassword };
