const bcrypt = require('bcryptjs');
const db = require('../db');

function isUniqueViolation(err) {
  return err && err.code === '23505';
}

// List all companies on the platform with user/task/routine metrics and their admins.
async function listTenants(req, res) {
  try {
    const { rows } = await db.query(
      `SELECT c.id, c.name, c.slug, c.active, c.features, c.task_seq, c.created_at,
              COUNT(DISTINCT u.id)::int AS total_users,
              COUNT(DISTINCT u.id) FILTER (WHERE u.active = true)::int AS active_users,
              COUNT(DISTINCT t.id)::int AS total_tasks,
              COUNT(DISTINCT r.id)::int AS total_routines,
              COALESCE(
                (
                  SELECT json_agg(
                    json_build_object(
                      'id', au.id,
                      'name', au.name,
                      'username', au.username,
                      'phone', au.phone,
                      'role', au.role,
                      'roleLabel', au.role_label,
                      'active', au.active
                    )
                    ORDER BY au.id ASC
                  )
                  FROM users au
                  WHERE au.company_id = c.id AND au.role IN ('super_admin', 'admin', 'MD')
                ),
                '[]'::json
              ) AS admins
       FROM companies c
       LEFT JOIN users u ON u.company_id = c.id
       LEFT JOIN tasks t ON t.company_id = c.id
       LEFT JOIN routine_tasks r ON r.company_id = c.id
       GROUP BY c.id
       ORDER BY c.id ASC`
    );

    return res.json({ tenants: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Could not load tenant companies.' });
  }
}

// Commission a new company on the go + provision its initial Company Admin atomically.
async function createTenant(req, res) {
  let {
    companyName,
    companySlug,
    adminName,
    adminUsername,
    adminPhone,
    adminPassword,
    features,
  } = req.body;

  companyName = (companyName || '').trim();
  companySlug = (companySlug || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]/g, '');
  adminName = (adminName || '').trim();
  adminUsername = (adminUsername || '').toLowerCase().trim();
  adminPhone = (adminPhone || '').trim();

  if (!companyName || !companySlug || !adminName || !adminUsername || !adminPhone || !adminPassword) {
    return res.status(400).json({
      error: 'Company name, company code, admin name, username, phone number, and password are required.',
    });
  }
  if (!/^[a-z0-9_-]{2,50}$/.test(companySlug)) {
    return res.status(400).json({
      error: 'Company code must be 2–50 characters: lowercase letters, numbers, "-" or "_" only.',
    });
  }
  if (!/^[a-z0-9_.]{3,50}$/.test(adminUsername)) {
    return res.status(400).json({
      error: 'Admin username must be 3+ characters: lowercase letters, numbers, "." or "_" only.',
    });
  }
  if (!/^[0-9+\-\s()]{7,20}$/.test(adminPhone)) {
    return res.status(400).json({ error: 'Please enter a valid admin phone number (7–20 digits).' });
  }
  if (adminPassword.length < 6) {
    return res.status(400).json({ error: 'Admin password must be at least 6 characters.' });
  }

  const normalizedFeatures = {
    whatsapp: features?.whatsapp !== false,
    routines: features?.routines !== false,
    remarks: features?.remarks !== false,
    team_management: features?.team_management !== false,
  };

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const companyRes = await client.query(
      `INSERT INTO companies (name, slug, active, features, task_seq)
       VALUES ($1, $2, true, $3::jsonb, 0)
       RETURNING id, name, slug, active, features, created_at`,
      [companyName, companySlug, JSON.stringify(normalizedFeatures)]
    );
    const company = companyRes.rows[0];

    const passwordHash = await bcrypt.hash(adminPassword, 10);
    const adminRes = await client.query(
      `INSERT INTO users (company_id, name, username, phone, password_hash, role, role_label, active)
       VALUES ($1, $2, $3, $4, $5, 'admin', 'Company Admin', true)
       RETURNING id, company_id, name, username, phone, role, role_label, active`,
      [company.id, adminName, adminUsername, adminPhone, passwordHash]
    );

    await client.query('COMMIT');
    return res.status(201).json({
      tenant: {
        ...company,
        total_users: 1,
        active_users: 1,
        total_tasks: 0,
        total_routines: 0,
        admins: [adminRes.rows[0]],
      },
      admin: adminRes.rows[0],
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (isUniqueViolation(err)) {
      return res.status(409).json({ error: 'That company code (slug) is already in use.' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Could not commission the new company.' });
  } finally {
    client.release();
  }
}

// Update tenant status (active/suspended), name, or feature permissions.
async function updateTenant(req, res) {
  const tenantId = Number(req.params.id);
  const { name, active, features } = req.body;

  try {
    const existing = await db.query(`SELECT * FROM companies WHERE id = $1`, [tenantId]);
    if (existing.rowCount === 0) {
      return res.status(404).json({ error: 'Company not found.' });
    }
    const current = existing.rows[0];

    const nextName = name ? name.trim() : current.name;
    const nextActive = typeof active === 'boolean' ? active : current.active;
    const nextFeatures = features
      ? { ...(current.features || {}), ...features }
      : current.features;

    const { rows } = await db.query(
      `UPDATE companies
       SET name = $1, active = $2, features = $3::jsonb
       WHERE id = $4
       RETURNING id, name, slug, active, features, created_at`,
      [nextName, nextActive, JSON.stringify(nextFeatures), tenantId]
    );

    return res.json({ tenant: rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Could not update the company settings.' });
  }
}

// Add an additional Company Admin to any existing tenant company.
async function createTenantAdmin(req, res) {
  const tenantId = Number(req.params.id);
  let { name, username, phone, password, roleLabel } = req.body;

  name = (name || '').trim();
  username = (username || '').toLowerCase().trim();
  phone = (phone || '').trim();
  roleLabel = (roleLabel || '').trim() || 'Company Admin';

  if (!name || !username || !phone || !password) {
    return res.status(400).json({ error: 'Name, username, phone, and password are required.' });
  }
  if (!/^[a-z0-9_.]{3,50}$/.test(username)) {
    return res.status(400).json({
      error: 'Username must be 3+ characters: lowercase letters, numbers, "." or "_" only.',
    });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      `INSERT INTO users (company_id, name, username, phone, password_hash, role, role_label, active)
       VALUES ($1, $2, $3, $4, $5, 'admin', $6, true)
       RETURNING id, company_id, name, username, phone, role, role_label, active`,
      [tenantId, name, username, phone, passwordHash, roleLabel]
    );
    return res.status(201).json({ admin: rows[0] });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({ error: 'That username already exists in this company.' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Could not create the company admin.' });
  }
}

module.exports = {
  listTenants,
  createTenant,
  updateTenant,
  createTenantAdmin,
};
