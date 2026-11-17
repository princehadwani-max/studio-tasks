const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  initWhatsAppClient,
  disconnectWhatsAppClient,
  getWhatsAppStatus,
} = require('../services/whatsapp');

const DASHBOARD_ROLES = ['super_admin', 'admin', 'MD', 'manager', 'sales manager', 'sales_manager'];

const router = express.Router();

router.use(requireAuth);
router.use(requireRole(...DASHBOARD_ROLES));

router.get('/status', (req, res) => {
  return res.json({
    ...getWhatsAppStatus(req.tenantId),
    companyName: req.tenant?.name || 'Workspace',
  });
});

router.post('/connect', async (req, res) => {
  if (req.tenant?.features?.whatsapp === false && req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'WhatsApp notifications are disabled for this company.' });
  }
  const status = await initWhatsAppClient(req.tenantId, true);
  return res.json({
    ...status,
    companyName: req.tenant?.name || 'Workspace',
  });
});

router.post('/disconnect', async (req, res) => {
  const status = await disconnectWhatsAppClient(req.tenantId);
  return res.json({
    ...status,
    companyName: req.tenant?.name || 'Workspace',
  });
});

module.exports = router;
