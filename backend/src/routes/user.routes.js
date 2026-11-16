const express = require('express');
const { listUsers, createUser, setActive, updatePhone, resetPassword } = require('../controllers/user.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

const DASHBOARD_ROLES = ['admin', 'MD', 'manager', 'sales manager', 'sales_manager'];

router.get('/', listUsers);
router.post('/', requireRole(...DASHBOARD_ROLES), createUser);
router.patch('/:id/active', requireRole(...DASHBOARD_ROLES), setActive);
router.patch('/:id/phone', requireRole(...DASHBOARD_ROLES), updatePhone);
router.patch('/:id/password', requireRole(...DASHBOARD_ROLES), resetPassword);

module.exports = router;
