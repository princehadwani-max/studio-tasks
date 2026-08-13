const express = require('express');
const { listUsers, createUser, setActive, resetPassword } = require('../controllers/user.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.get('/', listUsers);
router.post('/', requireRole('manager'), createUser);
router.patch('/:id/active', requireRole('manager'), setActive);
router.patch('/:id/password', requireRole('manager'), resetPassword);

module.exports = router;
