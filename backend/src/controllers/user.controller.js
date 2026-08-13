const bcrypt = require('bcryptjs');
const db = require('../db');

const ROLES = ['manager', 'designer', 'operation_coordinator'];
const ROLE_DEFAULT_LABEL = {
  manager: 'Manager',
  designer: 'Designer',
  operation_coordinator: 'Operation Coordinator',
};

function isUniqueViolation(err) {
  return err && err.code === '23505';
}

// List the team roster (used by the manager to pick who to assign work to,
// and by everyone to render names/roles next to tasks). Includes removed
// (inactive) members too, so the manager's Team panel can restore them —
// the UI is responsible for filtering to active-only where that matters.
async function listUsers(req, res) {
  try {
    const { rows } = await db.query(
      `SELECT id, name, username, role, role_label, active FROM users ORDER BY
         CASE role WHEN 'manager' THEN 0 WHEN 'designer' THEN 1 ELSE 2 END, name`
    );
    return res.json({ users: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Could not load the team roster.' });
  }
}

// Manager adds a new team member with their own username/password.
async function createUser(req, res) {
  let { name, username, password, role, roleLabel } = req.body;

  name = (name || '').trim();
  username = (username || '').toLowerCase().trim();
  role = (role || '').trim();
  roleLabel = (roleLabel || '').trim();

  if (!name || !username || !password || !role) {
    return res.status(400).json({ error: 'Name, username, password, and role are required.' });
  }
  if (!ROLES.includes(role)) {
    return res.status(400).json({ error: 'Role must be manager, designer, or operation_coordinator.' });
  }
  if (!/^[a-z0-9_.]{3,50}$/.test(username)) {
    return res
      .status(400)
      .json({ error: 'Username must be 3+ characters: lowercase letters, numbers, "." or "_" only.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }
  if (!roleLabel) roleLabel = ROLE_DEFAULT_LABEL[role];

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      `INSERT INTO users (name, username, password_hash, role, role_label)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, username, role, role_label, active`,
      [name, username, passwordHash, role, roleLabel]
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

// Remove or restore a team member. This is a soft delete (active = false):
// the account can no longer log in and drops off the active roster, but
// their task history and activity log entries are kept intact. A manager
// can't deactivate their own account, and the last active manager can't be
// removed, so the team is never left without an admin.
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

    if (!active && target.role === 'manager') {
      const { rows } = await db.query(
        `SELECT COUNT(*)::int AS n FROM users WHERE role = 'manager' AND active = true`
      );
      if (rows[0].n <= 1) {
        return res.status(400).json({ error: 'You cannot remove the last manager on the team.' });
      }
    }

    const { rows } = await db.query(
      `UPDATE users SET active = $1 WHERE id = $2
       RETURNING id, name, username, role, role_label, active`,
      [active, targetId]
    );
    return res.json({ user: rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Could not update that team member.' });
  }
}

// Manager sets a new password for any account, including their own —
// a self-service replacement for editing the seed script by hand.
async function resetPassword(req, res) {
  const { id } = req.params;
  const { password } = req.body;

  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      `UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id, name, username`,
      [passwordHash, id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Team member not found.' });
    }
    return res.json({ ok: true, id: rows[0].id, name: rows[0].name });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Could not update the password.' });
  }
}

module.exports = { listUsers, createUser, setActive, resetPassword };
