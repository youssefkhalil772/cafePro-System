'use strict';

const http = require('http');
const url = require('url');

let server = null;
let currentPort = 3000;
let currentVerifyToken = 'photostudio_wa_token';
let mainWindowRef = null;
let dbSaveFn = null;
let isRunning = false;

/**
 * بدء خادم الـ Webhook
 */
function startWebhookServer({ port = 3000, verifyToken = 'photostudio_wa_token', mainWindow, saveMessageFn }) {
  if (isRunning && server) {
    if (currentPort === port && currentVerifyToken === verifyToken) {
      console.log('[WebhookServer] الخادم يعمل بالفعل على المنفذ ' + port);
      return Promise.resolve({ success: true, port: currentPort, alreadyRunning: true });
    }
    stopWebhookServer();
  }

  currentPort = Number(port) || 3000;
  currentVerifyToken = verifyToken || 'photostudio_wa_token';
  mainWindowRef = mainWindow || null;
  dbSaveFn = saveMessageFn || null;

  return new Promise((resolve) => {
    server = http.createServer(handleRequest);

    server.on('error', (err) => {
      console.error('[WebhookServer] خطأ في خادم الـ Webhook:', err.message);
      isRunning = false;
      resolve({ success: false, error: 'فشل تشغيل السيرفر على المنفذ ' + currentPort + ': ' + err.message });
    });

    server.listen(currentPort, '0.0.0.0', () => {
      isRunning = true;
      console.log('[WebhookServer] 🟢 سيرفر الـ Webhook يعمل بنجاح على المنفذ ' + currentPort);
      resolve({ success: true, port: currentPort });
    });
  });
}

/**
 * إيقاف خادم الـ Webhook
 */
function stopWebhookServer() {
  if (server) {
    try {
      server.close();
      console.log('[WebhookServer] 🔴 تم إيقاف سيرفر الـ Webhook');
    } catch (e) {
      console.warn('[WebhookServer] تحذير عند إيقاف السيرفر:', e.message);
    }
    server = null;
  }
  isRunning = false;
  return { success: true };
}

/**
 * الحصول على حالة الخادم
 */
function getWebhookServerStatus() {
  return {
    isRunning,
    port: currentPort,
    verifyToken: currentVerifyToken,
  };
}

/**
 * معالج الطلبات لـ HTTP Server
 */
function handleRequest(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 1. فحص الصحة / الصفحة الرئيسية
  if ((pathname === '/' || pathname === '/status') && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      status: 'online',
      app: 'Photography Studio System WhatsApp Webhook Server',
      version: '1.0.0',
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // 2. التحقق من الـ Webhook عبر Meta (Handshake Verification - GET)
  if (pathname === '/webhook' && req.method === 'GET') {
    const mode = parsedUrl.query['hub.mode'];
    const token = parsedUrl.query['hub.verify_token'];
    const challenge = parsedUrl.query['hub.challenge'];

    console.log('[WebhookServer] استلام طلب تحقق من Meta: mode=' + mode + ', token=' + token);

    if (mode === 'subscribe' && token === currentVerifyToken) {
      console.log('[WebhookServer] ✅ تم التحقق بنجاح من Verify Token!');
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(challenge);
    } else {
      console.warn('[WebhookServer] ❌ فشل التحقق: Token غير متطابق. المطلوب "' + currentVerifyToken + '" والمستلم "' + token + '"');
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Verification token mismatch');
    }
    return;
  }

  // 3. استقبال إشعارات الرسائل من Meta (POST /webhook)
  if (pathname === '/webhook' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      // الرد فوراً بـ 200 OK لـ Meta حتى لا تعيد المحاولة
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('EVENT_RECEIVED');

      try {
        const payload = JSON.parse(body);
        processIncomingWebhook(payload);
      } catch (err) {
        console.error('[WebhookServer] خطأ في قراءة JSON الخاص بـ Webhook:', err.message);
      }
    });
    return;
  }

  // أي مسار آخر
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
}

/**
 * معالجة الـ Payload الوارد من Meta
 */
function processIncomingWebhook(payload) {
  if (!payload || !payload.entry) return;

  for (const entry of payload.entry) {
    const changes = entry.changes || [];
    for (const change of changes) {
      if (change.field !== 'messages' || !change.value) continue;

      const value = change.value;
      const contacts = value.contacts || [];
      const messages = value.messages || [];

      // معالجة الرسائل الواردة
      for (const msg of messages) {
        const rawPhone = msg.from; // مثال: "201012345678"
        const contact = contacts.find(c => c.wa_id === rawPhone);
        const senderName = contact?.profile?.name || rawPhone;

        let messageText = '';
        let mediaId = null;
        const messageType = msg.type || 'text';

        if (msg.type === 'text') {
          messageText = msg.text?.body || '';
        } else if (msg.type === 'image') {
          messageText = msg.image?.caption || '📷 [صورة]';
          mediaId = msg.image?.id || null;
        } else if (msg.type === 'document') {
          messageText = msg.document?.caption || ('📄 [مستند: ' + (msg.document?.filename || '') + ']');
          mediaId = msg.document?.id || null;
        } else if (msg.type === 'audio' || msg.type === 'voice') {
          messageText = '🎤 [تسجيل صوتي]';
          mediaId = msg.audio?.id || msg.voice?.id || null;
        } else if (msg.type === 'video') {
          messageText = msg.video?.caption || '🎥 [فيديو]';
          mediaId = msg.video?.id || null;
        } else if (msg.type === 'location') {
          messageText = '📍 [موقع جغرافي: ' + (msg.location?.name || '') + ']';
        } else if (msg.type === 'button') {
          messageText = msg.button?.text || '🔘 [زر]';
        } else if (msg.type === 'interactive') {
          messageText = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '🔘 [رد تفاعلي]';
        } else {
          messageText = '[رسالة: ' + msg.type + ']';
        }

        console.log('[WebhookServer] 📩 رسالة واردة جديدة من ' + senderName + ' (' + rawPhone + '): "' + messageText + '"');

        // 1. الحفظ في قاعدة البيانات
        let savedRecord = null;
        if (typeof dbSaveFn === 'function') {
          try {
            savedRecord = dbSaveFn({
              wa_message_id: msg.id,
              phone: rawPhone,
              sender_name: senderName,
              direction: 'inbound',
              message_type: messageType,
              message_body: messageText,
              media_url: mediaId,   // حفظ الـ media_id لجلب الصوت لاحقاً
              status: 'received',
              is_read: 0
            });
          } catch (dbErr) {
            console.error('[WebhookServer] فشل حفظ الرسالة في قاعدة البيانات:', dbErr.message);
          }
        }

        // 2. إرسال إشعار لحظي للواجهة الأمامية
        if (mainWindowRef && !mainWindowRef.isDestroyed()) {
          mainWindowRef.webContents.send('whatsapp:new-message', {
            id: savedRecord?.id || null,
            wa_message_id: msg.id,
            phone: rawPhone,
            sender_name: senderName,
            message_body: messageText,
            message_type: messageType,
            direction: 'inbound',
            created_at: new Date().toISOString()
          });
        }
      }

      // معالجة تحديثات حالة الرسائل الصادرة (sent / delivered / read)
      if (value.statuses && Array.isArray(value.statuses)) {
        for (const st of value.statuses) {
          if (mainWindowRef && !mainWindowRef.isDestroyed()) {
            mainWindowRef.webContents.send('whatsapp:status-update', {
              wa_message_id: st.id,
              status: st.status,
              recipient_id: st.recipient_id,
              timestamp: st.timestamp
            });
          }
        }
      }
    }
  }
}

module.exports = {
  startWebhookServer,
  stopWebhookServer,
  getWebhookServerStatus,
  processIncomingWebhook,
};
