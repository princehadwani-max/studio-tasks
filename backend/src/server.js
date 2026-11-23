require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const db = require('./db');

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const taskRoutes = require('./routes/task.routes');
const routineRoutes = require('./routes/routine.routes');
const whatsappRoutes = require('./routes/whatsapp.routes');
const tenantRoutes = require('./routes/tenant.routes');
const pushRoutes = require('./routes/push.routes');
const { initAllSavedWhatsAppClients } = require('./services/whatsapp');
const { startReminderScheduler } = require('./services/push');

const app = express();

const configuredOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    // Allow non-browser requests (Vercel Cron, curl, server-to-server)
    if (!origin) return callback(null, true);
    if (configuredOrigins.includes('*') || configuredOrigins.includes(origin)) {
      return callback(null, true);
    }
    if (
      /^https:\/\/[a-zA-Z0-9-]+\.vercel\.app$/.test(origin) ||
      /^http:\/\/localhost:\d+$/.test(origin) ||
      /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)
    ) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Company-Id'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/routines', routineRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/push', pushRoutes);

// Fallback error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

const PORT = process.env.PORT || 4000;

if (require.main === module) {
  app.listen(PORT, async () => {
    console.log(`Studio Tasks API listening on port ${PORT}`);
    if (!process.env.VERCEL) {
      initAllSavedWhatsAppClients().catch((err) =>
        console.error('WhatsApp auto-init error:', err.message)
      );
      startReminderScheduler();
    }
    try {
      const schema = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
      await db.query(schema);
      // Ensure any existing users without a phone number receive a default fallback phone
      await db.query(`
        UPDATE users
        SET phone = '98765432' || LPAD(id::text, 2, '0')
        WHERE phone IS NULL OR TRIM(phone) = ''
      `);
    } catch (err) {
      console.error('Schema sync warning:', err.message);
    }
  });
}

// Export Express app for Vercel Serverless (@vercel/node)
module.exports = app;
