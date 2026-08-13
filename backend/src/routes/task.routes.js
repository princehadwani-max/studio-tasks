const express = require('express');
const {
  createTask,
  listTasks,
  dailySummary,
  activityFeed,
  updateStatus,
  deleteTask,
} = require('../controllers/task.controller');
const { requireAuth, requireRole } = require('../middleware/auth');


const router = express.Router();

router.use(requireAuth);

router.get('/', listTasks);
router.post('/', requireRole('manager'), createTask);
router.get('/summary', requireRole('manager'), dailySummary);
router.get('/activity', requireRole('manager'), activityFeed);
router.patch('/:id/status', updateStatus);
router.delete('/:id', requireRole('manager'), deleteTask);

module.exports = router;
