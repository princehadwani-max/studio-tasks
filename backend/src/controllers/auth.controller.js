const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

async function login(req, res) {
  const { username, password, companySlug } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const normalizedUsername = username.toLowerCase().trim();
  const normalizedSlug = (companySlug || '').toLowerCase().trim();

  try {
    let candidates = [];

    if (normalizedSlug) {
      const slugAliases = normalizedSlug === 'studio' ? ['starco', 'studio'] : [normalizedSlug];
      const { rows } = await db.query(
        `SELECT u.id, u.company_id, u.name, u.username, u.phone, u.password_hash, u.role, u.role_label, u.active,
                c.name AS company_name, c.slug AS company_slug, c.active AS company_active, c.features AS company_features
         FROM users u
         LEFT JOIN companies c ON c.id = u.company_id
         WHERE u.username = $1 AND (u.role = 'super_admin' OR c.slug = ANY($2))`,
        [normalizedUsername, slugAliases]
      );
      candidates = rows;
    } else {
      const { rows } = await db.query(
        `SELECT u.id, u.company_id, u.name, u.username, u.phone, u.password_hash, u.role, u.role_label, u.active,
                c.name AS company_name, c.slug AS company_slug, c.active AS company_active, c.features AS company_features
         FROM users u
         LEFT JOIN companies c ON c.id = u.company_id
         WHERE u.username = $1
         ORDER BY CASE WHEN u.role = 'super_admin' THEN 0 WHEN u.company_id = 1 THEN 1 ELSE 2 END`,
        [normalizedUsername]
      );
      candidates = rows;
    }

    if (candidates.length === 0) {
      return res.status(401).json({ error: 'Incorrect username or password.' });
    }

    let matchedUser = null;
    for (const candidate of candidates) {
      const valid = await bcrypt.compare(password, candidate.password_hash);
      if (valid) {
        matchedUser = candidate;
        break;
      }
    }

    if (!matchedUser) {
      return res.status(401).json({ error: 'Incorrect username or password.' });
    }

    if (!matchedUser.active) {
      return res.status(403).json({ error: 'This account has been deactivated. Contact your admin.' });
    }

    const isSuperAdmin = matchedUser.role === 'super_admin';
    if (!isSuperAdmin && matchedUser.company_active === false) {
      return res.status(403).json({ error: 'This company workspace has been suspended.' });
    }

    const payload = {
      id: matchedUser.id,
      name: matchedUser.name,
      username: matchedUser.username,
      phone: matchedUser.phone || '',
      role: matchedUser.role,
      role_label: matchedUser.role_label,
      companyId: isSuperAdmin ? null : matchedUser.company_id,
      companyName: isSuperAdmin ? null : matchedUser.company_name,
      companySlug: isSuperAdmin ? null : matchedUser.company_slug,
      companyFeatures: isSuperAdmin ? {} : matchedUser.company_features || {},
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '12h' });
    return res.json({ token, user: payload });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Could not sign in right now. Try again shortly.' });
  }
}

async function me(req, res) {
  return res.json({
    user: {
      ...req.user,
      companyFeatures: req.tenant?.features || req.user.companyFeatures || {},
    },
    tenant: req.tenant,
  });
}

module.exports = { login, me };
