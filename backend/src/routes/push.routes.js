const express = require('express');
const { requireAuth } = require('../middleware/auth');
const {
  getVapidPublicKey,
  savePushSubscription,
  removePushSubscription,
  sendPushToUser,
  checkAndSendDueTaskReminders,
} = require('../services/push');

const router = express.Router();

router.get('/vapid-public-key', (req, res) => {
  return res.json({ publicKey: getVapidPublicKey() });
});

// Public cron trigger for Vercel Cron (05:30 UTC / 11:00 AM IST sharp) and external cron pingers
router.get('/cron-reminders', async (req, res) => {
  const result = await checkAndSendDueTaskReminders(false);
  return res.json({ ok: true, ...result });
});

router.post('/cron-reminders', async (req, res) => {
  const result = await checkAndSendDueTaskReminders(false);
  return res.json({ ok: true, ...result });
});

router.use(requireAuth);

router.post('/subscribe', async (req, res) => {
  try {
    const saved = await savePushSubscription(
      req.user.id,
      req.user.companyId || req.tenantId || null,
      req.body.subscription
    );
    return res.status(201).json({ ok: true, id: saved.id });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Could not save push subscription.' });
  }
});

router.post('/unsubscribe', async (req, res) => {
  try {
    await removePushSubscription(req.body.endpoint, req.user.id);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Could not remove push subscription.' });
  }
});

router.post('/test', async (req, res) => {
  const result = await sendPushToUser(req.user.id, {
    title: '🔔 Studio Tasks Push Active',
    body: `Hello ${req.user.name}, device push notifications with sound & vibration are active!`,
    tag: `test-${Date.now()}`,
    requireInteraction: false,
  });
  return res.json({ ok: true, sent: result.sent });
});

router.post('/run-reminders', async (req, res) => {
  const result = await checkAndSendDueTaskReminders(Boolean(req.body?.force));
  return res.json({ ok: true, ...result });
});

module.exports = router;
