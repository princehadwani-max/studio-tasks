const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

async function login(req, res) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  try {
    const { rows } = await db.query(
      `SELECT id, name, username, password_hash, role, role_label FROM users WHERE username = $1`,
      [username.toLowerCase().trim()]
    );

    const user = rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Incorrect username or password.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Incorrect username or password.' });
    }

    if (!user.active) {
      return res.status(403).json({ error: 'This account has been deactivated. Contact your manager.' });
    }

    const payload = {
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      role_label: user.role_label,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '12h' });
    return res.json({ token, user: payload });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Could not sign in right now. Try again shortly.' });
  }
}

async function me(req, res) {
  return res.json({ user: req.user });
}

module.exports = { login, me };
