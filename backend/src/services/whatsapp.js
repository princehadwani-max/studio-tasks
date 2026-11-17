const path = require('path');
const os = require('os');
const fs = require('fs');

const BASE_AUTH_DIR = path.join(os.homedir(), '.studio_tasks_whatsapp_auth');

// Per-tenant WhatsApp session map: Map<number, { sock, status, qrDataUrl, connectedPhone, initializing }>
const tenantSessions = new Map();

function getTenantAuthDir(tenantId) {
  return path.join(BASE_AUTH_DIR, `company_${Number(tenantId) || 1}`);
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
      initializing: false,
    });
  }
  return tenantSessions.get(id);
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
  };
}

async function initWhatsAppClient(tenantId = 1, forceNew = false) {
  const id = Number(tenantId) || 1;
  const session = getOrCreateSessionState(id);

  if (session.initializing) return getWhatsAppStatus(id);
  if (session.status === 'connected' && session.sock && !forceNew) {
    return getWhatsAppStatus(id);
  }

  session.initializing = true;
  session.status = 'connecting';

  try {
    const baileys = await import('@whiskeysockets/baileys');
    const makeWASocket = baileys.default?.default || baileys.default || baileys.makeWASocket;
    const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = baileys;
    const QRCode = require('qrcode');
    const pino = require('pino');

    const authDir = getTenantAuthDir(id);
    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    let version;
    try {
      const latest = await fetchLatestBaileysVersion();
      version = latest.version;
    } catch {
      version = undefined;
    }

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      browser: [`Company-${id}`, 'Chrome', '1.0.0'],
    });

    session.sock = sock;
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          session.qrDataUrl = await QRCode.toDataURL(qr, { margin: 2, width: 240 });
          session.status = 'qr_ready';
        } catch (err) {
          console.error(`[Tenant ${id}] QR generation failed:`, err.message);
        }
      }

      if (connection === 'open') {
        session.status = 'connected';
        session.qrDataUrl = null;
        const userJid = sock?.user?.id || '';
        session.connectedPhone = userJid.split(':')[0].split('@')[0] || 'Linked';
        console.log(`✔ [Tenant ${id}] WhatsApp connected (${session.connectedPhone})`);
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        session.qrDataUrl = null;
        session.connectedPhone = null;

        if (loggedOut) {
          session.status = 'disconnected';
          session.sock = null;
          try {
            fs.rmSync(authDir, { recursive: true, force: true });
          } catch {}
        } else {
          session.status = 'connecting';
          setTimeout(() => {
            session.initializing = false;
            initWhatsAppClient(id, true);
          }, 3000);
        }
      }
    });
  } catch (err) {
    console.error(`[Tenant ${id}] WhatsApp client init error:`, err.message);
    session.status = 'disconnected';
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
      session.sock = null;
    }
  } finally {
    session.status = 'disconnected';
    session.qrDataUrl = null;
    session.connectedPhone = null;
    session.initializing = false;
    try {
      fs.rmSync(authDir, { recursive: true, force: true });
    } catch {}
  }
  return getWhatsAppStatus(id);
}

// Reconnect only tenants that already have saved WhatsApp credentials on disk
async function initAllSavedWhatsAppClients() {
  migrateLegacyAuthIfNeeded();
  if (!fs.existsSync(BASE_AUTH_DIR)) return;

  try {
    const entries = fs.readdirSync(BASE_AUTH_DIR);
    for (const entry of entries) {
      if (!entry.startsWith('company_')) continue;
      const tenantId = Number(entry.replace('company_', ''));
      const credsFile = path.join(BASE_AUTH_DIR, entry, 'creds.json');
      if (tenantId && fs.existsSync(credsFile)) {
        initWhatsAppClient(tenantId).catch((err) =>
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
