const jwt = require('jsonwebtoken');
const db = require('../db');

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing or malformed authorization header.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // Super Admin (Prince) is platform-wide and not bound to any single tenant
    if (payload.username === 'prince' || payload.role === 'super_admin') {
      payload.role = 'super_admin';
      payload.role_label = 'Super Admin';
      payload.companyId = null;
      payload.companySlug = null;
      payload.companyName = null;
    } else if (!payload.companyId) {
      // Backward-compatibility for existing tenant user sessions
      payload.companyId = 1;
      payload.companySlug = 'starco';
      payload.companyName = 'Starco Ceramics';
    }

    req.user = payload;

    // Super Admin can enter any tenant workspace via X-Company-Id header;
    // when calling platform-level routes without a header, defaults to tenant 1 if needed.
    const requestedTenantId = req.headers['x-company-id'] ? Number(req.headers['x-company-id']) : null;
    req.tenantId =
      payload.role === 'super_admin'
        ? requestedTenantId || 1
        : payload.companyId;

    // Check tenant active status & features
    const companyRes = await db.query(
      `SELECT id, name, slug, active, features FROM companies WHERE id = $1`,
      [req.tenantId]
    );
    const company = companyRes.rows[0];
    if (!company && payload.role !== 'super_admin') {
      return res.status(404).json({ error: 'Company workspace not found.' });
    }
    if (company && !company.active && payload.role !== 'super_admin') {
      return res.status(403).json({ error: 'This company workspace is currently suspended.' });
    }

    req.tenant = company || null;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(403).json({ error: 'You do not have permission to do that.' });
    }
    if (req.user.role === 'super_admin' || roles.includes(req.user.role)) {
      return next();
    }
    return res.status(403).json({ error: 'You do not have permission to do that.' });
  };
}

module.exports = { requireAuth, requireRole };
