const path = require('path');
const os = require('os');
const fs = require('fs');

function resolveWritableAuthBaseDir() {
  const candidates = [
    path.join(os.homedir(), '.studio_tasks_whatsapp_auth'),
    path.join(os.tmpdir(), '.studio_tasks_whatsapp_auth'),
  ];
  for (const dir of candidates) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
      return dir;
    } catch {}
  }
  return path.join(os.tmpdir(), '.studio_tasks_whatsapp_auth');
}

const BASE_AUTH_DIR = resolveWritableAuthBaseDir();

// Per-tenant WhatsApp session map:
// Map<number, { sock, status, qrDataUrl, connectedPhone, lastError, initializing, reconnectTimer }>
const tenantSessions = new Map();

function getTenantAuthDir(tenantId) {
  return path.join(BASE_AUTH_DIR, `company_${Number(tenantId) || 1}`);
}

function hasValidSavedPairing(authDir) {
  try {
    const credsPath = path.join(authDir, 'creds.json');
    if (!fs.existsSync(credsPath)) return false;
    const raw = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
    return Boolean(raw && raw.me && raw.me.id);
  } catch {
    return false;
  }
}

// Migrate any legacy root-level auth files into company_1 once so existing linked session isn't lost
function migrateLegacyAuthIfNeeded() {
  try {
    const legacyCreds = path.join(BASE_AUTH_DIR, 'creds.json');
    const company1Dir = getTenantAuthDir(1);
    if (fs.existsSync(legacyCreds) && !fs.existsSync(path.join(company1Dir, 'creds.json'))) {
      fs.mkdirSync(company1Dir, { recursive: true });
      for (const entry of fs.readdirSync(BASE_AUTH_DIR)) {
        if (entry.startsWith('company_')) continue;
        const src = path.join(BASE_AUTH_DIR, entry);
        const dest = path.join(company1Dir, entry);
        if (fs.statSync(src).isFile()) {
          fs.renameSync(src, dest);
        }
      }
    }
  } catch (err) {
    console.error('Legacy WhatsApp auth migration warning:', err.message);
  }
}

function getOrCreateSessionState(tenantId) {
  const id = Number(tenantId) || 1;
  if (!tenantSessions.has(id)) {
    tenantSessions.set(id, {
      sock: null,
      status: 'disconnected', // 'disconnected' | 'connecting' | 'qr_ready' | 'connected'
      qrDataUrl: null,
      connectedPhone: null,
      lastError: null,
      initializing: false,
      reconnectTimer: null,
    });
  }
  return tenantSessions.get(id);
}

function cleanupExistingSocket(session) {
  if (session.reconnectTimer) {
    clearTimeout(session.reconnectTimer);
    session.reconnectTimer = null;
  }
  if (session.sock) {
    try {
      session.sock.ev.removeAllListeners('connection.update');
      session.sock.ev.removeAllListeners('creds.update');
      session.sock.end(undefined);
    } catch {}
    session.sock = null;
  }
}

function normalizePhone(rawPhone) {
  if (!rawPhone) return '';
  const digits = String(rawPhone).replace(/\D/g, '');
  if (!digits) return '';
  const defaultCountryCode = process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || '91';
  if (digits.length === 10) {
    return `${defaultCountryCode}${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return `${defaultCountryCode}${digits.slice(1)}`;
  }
  return digits;
}

function buildTaskWhatsAppMessage(task, companyName = 'Starco Ceramics') {
  const dateStr = task.taskDate ? String(task.taskDate).slice(0, 10) : 'Today';
  const priorityStr = (task.priority || 'normal').toUpperCase();
  const lines = [
    `📋 *New Task Assigned — ${companyName}*`,
    `Hello *${task.assignedTo?.name || 'Team Member'}*, a new task has been assigned to you:`,
    ``,
    `*Code:* ${task.code}`,
    `*Task:* ${task.title}`,
  ];
  if (task.description) {
    lines.push(`*Details:* ${task.description}`);
  }
  lines.push(`*Priority:* ${priorityStr}`);
  lines.push(`*Date:* ${dateStr}`);
  if (task.assignedBy?.name) {
    lines.push(`*Assigned by:* ${task.assignedBy.name}`);
  }
  return lines.join('\n');
}

function buildRoutineWhatsAppMessage(routine, companyName = 'Starco Ceramics') {
  const freqLabel = routine.frequency === 'monthly' ? 'Monthly Routine' : 'Daily Routine';
  const lines = [
    `🔁 *New ${freqLabel} Assigned — ${companyName}*`,
    `Hello *${routine.assignedTo?.name || 'Team Member'}*, a new ${freqLabel.toLowerCase()} task has been assigned to you:`,
    ``,
    `*Task:* ${routine.title}`,
  ];
  if (routine.description) {
    lines.push(`*Details:* ${routine.description}`);
  }
  lines.push(`*Type:* ${freqLabel}`);
  if (routine.assignedBy?.name) {
    lines.push(`*Assigned by:* ${routine.assignedBy.name}`);
  }
  return lines.join('\n');
}

function buildWhatsAppUrl(rawPhone, message) {
  const phone = normalizePhone(rawPhone);
  if (!phone) return null;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

function getWhatsAppStatus(tenantId = 1) {
  const session = getOrCreateSessionState(tenantId);
  return {
    tenantId: Number(tenantId) || 1,
    status: session.status,
    qrDataUrl: session.qrDataUrl,
    connectedPhone: session.connectedPhone,
    error: session.lastError,
  };
}

async function initWhatsAppClient(tenantId = 1, forceNew = false) {
  const id = Number(tenantId) || 1;
  const session = getOrCreateSessionState(id);
  const authDir = getTenantAuthDir(id);

  if (session.status === 'connected' && session.sock && !forceNew) {
    return getWhatsAppStatus(id);
  }

  // If already QR-ready and user clicked Link WhatsApp again, return existing QR or force fresh one
  if (forceNew) {
    cleanupExistingSocket(session);
    session.initializing = false;
    session.qrDataUrl = null;
    session.lastError = null;
    // Clear any incomplete/unpaired auth state so a fresh QR is guaranteed to generate
    if (!hasValidSavedPairing(authDir)) {
      try {
        fs.rmSync(authDir, { recursive: true, force: true });
      } catch {}
    }
  } else if (session.initializing) {
    return getWhatsAppStatus(id);
  }

  session.initializing = true;
  session.status = 'connecting';
  session.lastError = null;

  try {
    const baileys = await import('@whiskeysockets/baileys');
    const makeWASocket = baileys.default?.default || baileys.default || baileys.makeWASocket;
    const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = baileys;
    const QRCode = require('qrcode');
    const pino = require('pino');

    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    let version;
    try {
      const latest = await Promise.race([
        fetchLatestBaileysVersion(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('version_timeout')), 2500)),
      ]);
      version = latest?.version;
    } catch {
      version = undefined;
    }

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      browser: [`StudioTasks-${id}`, 'Chrome', '1.0.0'],
      connectTimeoutMs: 20000,
    });

    session.sock = sock;
    sock.ev.on('creds.update', saveCreds);

    // Wait up to 8 seconds for the initial QR code or 'open' event before resolving HTTP connect call
    await new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve();
        }
      };
      const timer = setTimeout(finish, 8000);

      sock.ev.on('connection.update', async (update) => {
        if (session.sock !== sock) return; // Ignore events from a superseded socket
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          try {
            session.qrDataUrl = await QRCode.toDataURL(qr, { margin: 2, width: 240 });
            session.status = 'qr_ready';
            session.lastError = null;
            finish();
          } catch (err) {
            console.error(`[Tenant ${id}] QR generation failed:`, err.message);
            session.lastError = 'Failed to generate QR image.';
            finish();
          }
        }

        if (connection === 'open') {
          session.status = 'connected';
          session.qrDataUrl = null;
          session.lastError = null;
          const userJid = sock?.user?.id || '';
          session.connectedPhone = userJid.split(':')[0].split('@')[0] || 'Linked';
          console.log(`✔ [Tenant ${id}] WhatsApp connected (${session.connectedPhone})`);
          finish();
        }

        if (connection === 'close') {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const loggedOut = statusCode === DisconnectReason.loggedOut;
          const wasPaired = hasValidSavedPairing(authDir);

          session.qrDataUrl = null;
          session.connectedPhone = null;

          if (loggedOut || !wasPaired) {
            // Either explicitly logged out or an unpaired QR session closed/expired:
            // wipe stale auth files so the next click on "Link WhatsApp" starts fresh
            session.status = 'disconnected';
            session.sock = null;
            try {
              fs.rmSync(authDir, { recursive: true, force: true });
            } catch {}
            finish();
          } else {
            // A previously paired session dropped connection: reconnect in background
            session.status = 'connecting';
            session.reconnectTimer = setTimeout(() => {
              session.initializing = false;
              initWhatsAppClient(id, false).catch(() => {});
            }, 3000);
            finish();
          }
        }
      });
    });
  } catch (err) {
    console.error(`[Tenant ${id}] WhatsApp client init error:`, err.message);
    session.status = 'disconnected';
    session.lastError = err.message || 'Could not initialize WhatsApp client.';
  } finally {
    session.initializing = false;
  }

  return getWhatsAppStatus(id);
}

async function disconnectWhatsAppClient(tenantId = 1) {
  const id = Number(tenantId) || 1;
  const session = getOrCreateSessionState(id);
  const authDir = getTenantAuthDir(id);

  try {
    if (session.sock) {
      await session.sock.logout().catch(() => {});
    }
  } finally {
    cleanupExistingSocket(session);
    session.status = 'disconnected';
    session.qrDataUrl = null;
    session.connectedPhone = null;
    session.lastError = null;
    session.initializing = false;
    try {
      fs.rmSync(authDir, { recursive: true, force: true });
    } catch {}
  }
  return getWhatsAppStatus(id);
}

// Reconnect only tenants that already have a completed WhatsApp pairing on disk
async function initAllSavedWhatsAppClients() {
  migrateLegacyAuthIfNeeded();
  if (!fs.existsSync(BASE_AUTH_DIR)) return;

  try {
    const entries = fs.readdirSync(BASE_AUTH_DIR);
    for (const entry of entries) {
      if (!entry.startsWith('company_')) continue;
      const tenantId = Number(entry.replace('company_', ''));
      const authDir = path.join(BASE_AUTH_DIR, entry);
      if (tenantId && hasValidSavedPairing(authDir)) {
        initWhatsAppClient(tenantId, false).catch((err) =>
          console.error(`[Tenant ${tenantId}] Auto-reconnect error:`, err.message)
        );
      }
    }
  } catch (err) {
    console.error('WhatsApp saved sessions scan error:', err.message);
  }
}

// Send a WhatsApp message strictly using the specified tenant's linked session
async function sendWhatsAppNotification(tenantId, rawPhone, message) {
  const id = Number(tenantId) || 1;
  const phone = normalizePhone(rawPhone);
  const whatsappUrl = buildWhatsAppUrl(rawPhone, message);

  if (!phone) {
    return { sent: false, reason: 'missing_phone', whatsappUrl: null };
  }

  const session = getOrCreateSessionState(id);

  if (session.sock && session.status === 'connected') {
    try {
      let targetJid = `${phone}@s.whatsapp.net`;
      try {
        const [result] = await session.sock.onWhatsApp(phone);
        if (result?.exists && result?.jid) {
          targetJid = result.jid;
        }
      } catch {}

      await session.sock.sendMessage(targetJid, { text: message });
      return { sent: true, provider: 'whatsapp_direct', tenantId: id, whatsappUrl };
    } catch (err) {
      console.error(`[Tenant ${id}] Direct WhatsApp send error:`, err.message);
    }
  }

  return { sent: false, provider: 'not_connected', tenantId: id, whatsappUrl };
}

module.exports = {
  normalizePhone,
  buildTaskWhatsAppMessage,
  buildRoutineWhatsAppMessage,
  buildWhatsAppUrl,
  initWhatsAppClient,
  initAllSavedWhatsAppClients,
  disconnectWhatsAppClient,
  getWhatsAppStatus,
  sendWhatsAppNotification,
};
