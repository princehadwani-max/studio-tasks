const db = require('../db');

// List the team roster (used by the manager to pick who to assign work to,
// and by everyone to render names/roles next to tasks).
async function listUsers(req, res) {
  try {
    const { rows } = await db.query(
      `SELECT id, name, username, role, role_label FROM users ORDER BY
         CASE role WHEN 'manager' THEN 0 WHEN 'designer' THEN 1 ELSE 2 END, name`
    );
    return res.json({ users: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Could not load the team roster.' });
  }
}

module.exports = { listUsers };
