const express = require('express');
const {
  listRoutines,
  createRoutine,
  toggleRoutine,
  deleteRoutine,
} = require('../controllers/routine.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

const DASHBOARD_ROLES = ['admin', 'MD', 'manager', 'sales manager', 'sales_manager'];

const router = express.Router();

router.use(requireAuth);

router.get('/', listRoutines);
router.post('/', requireRole(...DASHBOARD_ROLES), createRoutine);
router.patch('/:id/toggle', toggleRoutine);
router.delete('/:id', requireRole(...DASHBOARD_ROLES), deleteRoutine);

module.exports = router;
