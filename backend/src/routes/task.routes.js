const express = require('express');
const {
  createTask,
  listTasks,
  dailySummary,
  activityFeed,
  updateStatus,
} = require('../controllers/task.controller');
const { requireAuth, requireRole } = require('../middleware/auth');
const { verify } = require('jsonwebtoken');

const router = express.Router();

router.use(requireAuth);

router.get('/', listTasks);
router.post('/', requireRole('manager'), createTask);
router.get('/summary', requireRole('manager'), dailySummary);
router.get('/activity', requireRole('manager'), activityFeed);
router.patch('/:id/status', updateStatus);
// router.delete("/tasks/:id", verifyManager, async (req, res) => {
//  await pool.query(
  //  "DELETE FROM tasks WHERE id = $1",
  //  [req.params.id]
  //);

 // res.json({ message: "Task deleted successfully" });
//}); 

module.exports = router;
