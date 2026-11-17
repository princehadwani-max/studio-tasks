const express = require('express');
const {
  listTenants,
  createTenant,
  updateTenant,
  createTenantAdmin,
} = require('../controllers/tenant.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);
router.use(requireRole('super_admin'));

router.get('/', listTenants);
router.post('/', createTenant);
router.patch('/:id', updateTenant);
router.post('/:id/admins', createTenantAdmin);

module.exports = router;
