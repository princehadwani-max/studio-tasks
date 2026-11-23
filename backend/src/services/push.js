const webpush = require('web-push');
const db = require('../db');
const { sendWhatsAppNotification } = require('./whatsapp');

function cleanEnv(val) {
  return String(val || '').trim().replace(/^["']|["']$/g, '');
}

const VAPID_PUBLIC_KEY = cleanEnv(process.env.VAPID_PUBLIC_KEY);
const VAPID_PRIVATE_KEY = cleanEnv(process.env.VAPID_PRIVATE_KEY);
const VAPID_SUBJECT = cleanEnv(process.env.VAPID_SUBJECT) || 'mailto:admin@studiotasks.com';

let vapidConfigured = false;
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    vapidConfigured = true;
  } catch (err) {
    console.error('[Push] Invalid VAPID configuration:', err.message);
  }
} else {
  console.warn('[Push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set in environment; Web Push disabled until configured.');
}

function getVapidPublicKey() {
  return vapidConfigured ? VAPID_PUBLIC_KEY : null;
}

async function savePushSubscription(userId, companyId, subscription) {
  const endpoint = subscription?.endpoint;
  const p256dh = subscription?.keys?.p256dh;
  const auth = subscription?.keys?.auth;

  if (!endpoint || !p256dh || !auth) {
    throw new Error('Invalid push subscription payload.');
  }

  const { rows } = await db.query(
    `INSERT INTO push_subscriptions (company_id, user_id, endpoint, p256dh, auth)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE
       SET user_id = EXCLUDED.user_id,
           company_id = EXCLUDED.company_id,
           p256dh = EXCLUDED.p256dh,
           auth = EXCLUDED.auth
     RETURNING id, user_id, endpoint`,
    [companyId || null, userId, endpoint, p256dh, auth]
  );
  return rows[0];
}

async function removePushSubscription(endpoint, userId) {
  if (!endpoint) return;
  await db.query(`DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2`, [
    endpoint,
    userId,
  ]);
}

async function sendPushToUser(userId, payload) {
  if (!userId || !vapidConfigured) return { sent: 0 };

  try {
    const { rows } = await db.query(
      `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1`,
      [userId]
    );
    if (rows.length === 0) return { sent: 0 };

    const message = JSON.stringify({
      title: payload.title || 'Studio Tasks',
      body: payload.body || '',
      tag: payload.tag || `task-${Date.now()}`,
      url: payload.url || '/',
      taskId: payload.taskId || null,
      requireInteraction: Boolean(payload.requireInteraction),
    });

    let sent = 0;
    await Promise.all(
      rows.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            message
          );
          sent += 1;
        } catch (err) {
          if (err.statusCode === 404 || err.statusCode === 410) {
            await db.query(`DELETE FROM push_subscriptions WHERE id = $1`, [sub.id]).catch(() => {});
          } else {
            console.error(`Web Push send error for user ${userId}:`, err.message);
          }
        }
      })
    );

    return { sent };
  } catch (err) {
    console.error('sendPushToUser query error:', err.message);
    return { sent: 0 };
  }
}

// Get current date (YYYY-MM-DD) and hour/minute in Asia/Kolkata (IST)
function getIstNowParts() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const map = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }
  const dateStr = `${map.year}-${map.month}-${map.day}`;
  const hour = Number(map.hour === '24' ? 0 : map.hour);
  const minute = Number(map.minute);
  return { dateStr, hour, minute };
}

let checkingReminders = false;

// Recurring 11:00 AM Sharp Reminder Engine:
// Fires for any unfinished task (status != 'completed') where reminder_interval_days = N (N > 0),
// every N days after task_date (days_elapsed >= N && days_elapsed % N === 0) at 11:00 AM IST.
async function checkAndSendDueTaskReminders(forceRun = false) {
  if (checkingReminders) return { triggered: 0 };
  checkingReminders = true;

  try {
    const { dateStr, hour } = getIstNowParts();

    // Only trigger scheduled reminders at or after 11:00 AM IST (unless forceRun is requested)
    if (!forceRun && hour < 11) {
      return { triggered: 0, dateStr, hour };
    }

    const { rows } = await db.query(
      `SELECT t.id, t.company_id, t.code, t.title, t.description, t.priority,
              t.assigned_to, t.task_date, t.reminder_interval_days,
              ($1::date - t.task_date::date)::int AS days_elapsed,
              au.name AS assignee_name, au.phone AS assignee_phone,
              ab.name AS assigner_name,
              c.name AS company_name, c.features AS company_features
       FROM tasks t
       JOIN users au ON au.id = t.assigned_to
       LEFT JOIN users ab ON ab.id = t.assigned_by
       LEFT JOIN companies c ON c.id = t.company_id
       WHERE t.status != 'completed'
         AND au.active = true
         AND t.reminder_interval_days IS NOT NULL
         AND t.reminder_interval_days > 0
         AND (t.last_reminder_sent_date IS NULL OR t.last_reminder_sent_date < $1::date)`,
      [dateStr]
    );

    let triggered = 0;

    for (const row of rows) {
      const interval = Number(row.reminder_interval_days);
      const elapsed = Number(row.days_elapsed);

      // Check if today is a multiple of `reminder_interval_days` after `task_date`
      const isDueToday = forceRun || (elapsed >= interval && elapsed % interval === 0);
      if (!isDueToday) continue;

      // Atomically mark reminder as sent for today so it never fires twice on the same day
      const updated = await db.query(
        `UPDATE tasks
         SET last_reminder_sent_date = $1::date
         WHERE id = $2 AND (last_reminder_sent_date IS NULL OR last_reminder_sent_date < $1::date)
         RETURNING id`,
        [dateStr, row.id]
      );
      if (updated.rowCount === 0) continue;

      triggered += 1;

      const pushTitle = `⏰ 11:00 AM Task Reminder (${row.code})`;
      const pushBody = `"${row.title}" is still pending (Every ${interval} day${
        interval === 1 ? '' : 's'
      } reminder · Assigned by ${row.assigner_name || 'Manager'}).`;

      await sendPushToUser(row.assigned_to, {
        title: pushTitle,
        body: pushBody,
        tag: `reminder-${row.code}-${dateStr}`,
        taskId: row.id,
        requireInteraction: true,
      });

      // Also send on WhatsApp if tenant has WhatsApp connected & enabled
      if (row.company_features?.whatsapp !== false && row.assignee_phone) {
        const waMsg = [
          `⏰ *11:00 AM Task Reminder — ${row.company_name || 'Studio Tasks'}*`,
          `Hello *${row.assignee_name}*, this is your ${interval}-day scheduled reminder for an open task:`,
          ``,
          `*Code:* ${row.code}`,
          `*Task:* ${row.title}`,
          row.description ? `*Details:* ${row.description}` : null,
          `*Assigned by:* ${row.assigner_name || 'Manager'}`,
          ``,
          `Please complete and mark this task as done.`,
        ]
          .filter(Boolean)
          .join('\n');

        try {
          await sendWhatsAppNotification(row.company_id, row.assignee_phone, waMsg);
        } catch {
          // Ignore WhatsApp errors during scheduled reminders
        }
      }
    }

    return { triggered, dateStr, hour };
  } catch (err) {
    console.error('Reminder scheduler error:', err.message);
    return { triggered: 0, error: err.message };
  } finally {
    checkingReminders = false;
  }
}

let schedulerTimer = null;

function startReminderScheduler() {
  if (schedulerTimer) return;
  // Check every 20 seconds so it fires at 11:00 AM sharp
  schedulerTimer = setInterval(() => {
    checkAndSendDueTaskReminders(false).catch(() => {});
  }, 20000);
  // Also run once shortly after boot
  setTimeout(() => {
    checkAndSendDueTaskReminders(false).catch(() => {});
  }, 4000);
}

module.exports = {
  getVapidPublicKey,
  savePushSubscription,
  removePushSubscription,
  sendPushToUser,
  checkAndSendDueTaskReminders,
  startReminderScheduler,
};
