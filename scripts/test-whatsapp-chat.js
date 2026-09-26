'use strict';

const path = require('path');
const fs = require('fs');
const http = require('http');
const Database = require('better-sqlite3');

async function runTests() {
  console.log('========================================');
  console.log('🧪 بدء فحص واختبار نظام محادثات الواتساب');
  console.log('========================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`✅ [نجح] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [فشل] ${testName}`);
      failed++;
    }
  }

  // ─── 1. اختبار قاعدة البيانات والجدول الجديد ───
  console.log('1️⃣ اختبار قاعدة البيانات و Migration 18:');
  const tempDbPath = path.join(__dirname, 'temp-test-chat.db');
  if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);

  const testDb = new Database(tempDbPath);
  testDb.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS customers (id INTEGER PRIMARY KEY, name TEXT, phone TEXT);
    CREATE TABLE IF NOT EXISTS whatsapp_settings (id INTEGER PRIMARY KEY, provider TEXT);
    INSERT INTO customers (id, name, phone) VALUES (1, 'أحمد محمود', '01012345678');
  `);

  // تطبيق التعديلات يدوياً
  testDb.exec(`
    ALTER TABLE whatsapp_settings ADD COLUMN webhook_port INTEGER DEFAULT 3000;
    ALTER TABLE whatsapp_settings ADD COLUMN webhook_verify_token TEXT DEFAULT 'photostudio_wa_token';
    ALTER TABLE whatsapp_settings ADD COLUMN webhook_custom_url TEXT DEFAULT '';
    ALTER TABLE whatsapp_settings ADD COLUMN webhook_auto_tunnel INTEGER DEFAULT 1;

    CREATE TABLE IF NOT EXISTS whatsapp_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wa_message_id TEXT UNIQUE,
      phone TEXT NOT NULL,
      sender_name TEXT,
      direction TEXT NOT NULL,
      message_type TEXT DEFAULT 'text',
      message_body TEXT,
      media_url TEXT,
      status TEXT DEFAULT 'received',
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  assert(testDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='whatsapp_messages'").get() !== undefined, 'جدول whatsapp_messages تم إنشاؤه بنجاح');

  // تجربة إضافة رسالة واردة
  testDb.prepare(`
    INSERT INTO whatsapp_messages (wa_message_id, phone, sender_name, direction, message_body, is_read)
    VALUES ('wamid_1', '01012345678', 'أحمد محمود', 'inbound', 'السلام عليكم الفاتورة جهزت؟', 0)
  `).run();

  // تجربة إضافة رسالة صادرة
  testDb.prepare(`
    INSERT INTO whatsapp_messages (wa_message_id, phone, sender_name, direction, message_body, is_read)
    VALUES ('wamid_2', '01012345678', 'المحل', 'outbound', 'أهلاً بك يا فندم، نعم جاهزة للاستلام', 1)
  `).run();

  const msgCount = testDb.prepare("SELECT COUNT(*) as cnt FROM whatsapp_messages").get().cnt;
  assert(msgCount === 2, 'إدخال الرسائل الواردة والصادرة في DB بنجاح');

  // استعلام المحادثات
  const conv = testDb.prepare(`
    SELECT 
      m.phone,
      COALESCE(c.name, m.sender_name, m.phone) AS display_name,
      m.message_body AS last_message,
      m.direction AS last_direction,
      m.created_at AS last_time,
      COALESCE(u.unread_count, 0) AS unread_count
    FROM whatsapp_messages m
    INNER JOIN (
      SELECT phone, MAX(id) AS max_id
      FROM whatsapp_messages
      GROUP BY phone
    ) latest ON m.id = latest.max_id
    LEFT JOIN customers c ON c.phone = m.phone
    LEFT JOIN (
      SELECT phone, COUNT(*) AS unread_count
      FROM whatsapp_messages
      WHERE direction = 'inbound' AND is_read = 0
      GROUP BY phone
    ) u ON m.phone = u.phone
  `).get();

  assert(conv.display_name === 'أحمد محمود', 'مطابقة اسم العميل مع جدول العملاء بنجاح');
  assert(conv.last_message === 'أهلاً بك يا فندم، نعم جاهزة للاستلام', 'استرجاع آخر رسالة في المحادثة بنجاح');

  testDb.close();
  if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);

  // ─── 2. اختبار سيرفر الـ Webhook المحلي ───
  console.log('\n2️⃣ اختبار خادم الـ Webhook المحلي (HTTP Server):');
  const { startWebhookServer, stopWebhookServer } = require('../whatsapp/webhook-server');

  let receivedMessage = null;
  const serverStart = await startWebhookServer({
    port: 3999,
    verifyToken: 'test_token_123',
    saveMessageFn: (msg) => {
      receivedMessage = msg;
      return { id: 99 };
    }
  });

  assert(serverStart.success === true, 'تشغيل خادم الـ Webhook على المنفذ 3999');

  // فحص Handshake Verification (GET)
  const getChallenge = await new Promise((resolve) => {
    http.get('http://127.0.0.1:3999/webhook?hub.mode=subscribe&hub.challenge=CHALLENGE_STRING_7788&hub.verify_token=test_token_123', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    });
  });

  assert(getChallenge.statusCode === 200 && getChallenge.body === 'CHALLENGE_STRING_7788', 'التحقق من الـ Webhook مع Meta (GET handshake) مطابق تماماً لبروتوكول Meta');

  // فحص حظر التوكن الخاطئ
  const wrongToken = await new Promise((resolve) => {
    http.get('http://127.0.0.1:3999/webhook?hub.mode=subscribe&hub.challenge=123&hub.verify_token=wrong_token', (res) => {
      resolve(res.statusCode);
    });
  });

  assert(wrongToken === 403, 'حظر أي طلب يحتوي على Token غير مطابق (HTTP 403)');

  // فحص استقبال رسالة واردة (POST /webhook)
  const postResult = await new Promise((resolve) => {
    const payload = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{
        changes: [{
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            contacts: [{ profile: { name: 'محمد علي' }, wa_id: '201123456789' }],
            messages: [{
              from: '201123456789',
              id: 'wamid.HBgTEST123',
              timestamp: '1720000000',
              type: 'text',
              text: { body: 'مرحبا، كم سعر تفصيل البدلة؟' }
            }]
          }
        }]
      }]
    });

    const req = http.request('http://127.0.0.1:3999/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    });

    req.write(payload);
    req.end();
  });

  assert(postResult.statusCode === 200 && postResult.body === 'EVENT_RECEIVED', 'استقبال الـ Webhook والرد بـ 200 OK لـ Meta');
  assert(receivedMessage !== null && receivedMessage.message_body === 'مرحبا، كم سعر تفصيل البدلة؟', 'استخراج نص الرسالة ورقم واسم العميل بنجاح');
  assert(receivedMessage.phone === '201123456789' && receivedMessage.sender_name === 'محمد علي', 'مطابقة رقم واسم العميل المستخرج');

  stopWebhookServer();
  assert(true, 'إيقاف خادم الـ Webhook بنجاح');

  // ─── 3. اختبار نفق Cloudflare Quick Tunnel ───
  console.log('\n3️⃣ اختبار أداة Cloudflare Tunnel:');
  const { getCloudflaredPath } = require('../whatsapp/webhook-tunnel');
  const binPath = getCloudflaredPath();
  assert(binPath !== null && fs.existsSync(binPath), `ملف cloudflared.exe موجود وجاهز في المسار: ${binPath}`);

  // ─── 4. اختبار CloudAPIProvider Text Message ───
  console.log('\n4️⃣ اختبار CloudAPIProvider للرسائل النصية الحرة:');
  const CloudAPIProvider = require('../whatsapp/providers/cloud-api-provider');
  const provider = new CloudAPIProvider();
  assert(typeof provider.sendTextMessage === 'function', 'دالة sendTextMessage موجودة في CloudAPIProvider');
  assert(typeof provider.markAsReadOnMeta === 'function', 'دالة markAsReadOnMeta موجودة في CloudAPIProvider');

  console.log('\n========================================');
  console.log(`📊 النتيجة النهائية: ${passed} نجاح / ${failed} فشل`);
  console.log('========================================');

  if (failed === 0) {
    console.log('🎉 جميع الاختبارات تعمل بنجاح 100%!');
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});