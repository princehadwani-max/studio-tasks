const express = require('express');
const {
  createTask,
  listTasks,
  dailySummary,
  activityFeed,
  updateStatus,
  addRemark,
  deleteTask,
} = require('../controllers/task.controller');
const { requireAuth, requireRole } = require('../middleware/auth');


const router = express.Router();

router.use(requireAuth);

const DASHBOARD_ROLES = ['admin', 'MD', 'manager', 'sales manager', 'sales_manager'];

router.get('/', listTasks);
router.post('/', requireRole(...DASHBOARD_ROLES), createTask);
router.get('/summary', requireRole(...DASHBOARD_ROLES), dailySummary);
router.get('/activity', requireRole(...DASHBOARD_ROLES), activityFeed);
router.patch('/:id/status', updateStatus);
router.post('/:id/remarks', addRemark);
router.delete('/:id', requireRole(...DASHBOARD_ROLES), deleteTask);

module.exports = router;
