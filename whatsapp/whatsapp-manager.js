'use strict';

/**
 * ============================================================
 * whatsapp-manager.js — المنسّق الرئيسي لخدمة الواتساب
 * ============================================================
 * هو نقطة الدخول الوحيدة التي يتعامل معها باقي النظام.
 * يقرأ إعدادات العميل من قاعدة البيانات ويحمّل المزوّد المناسب.
 *
 * آلية التبديل الآمن (Rollback):
 *   1. يحتفظ بالـ provider الحالي حتى يتأكد من نجاح الجديد
 *   2. إذا فشل تهيئة الجديد → يبقى القديم شغالاً
 *   3. إذا نجح → يُوقف القديم ويُشغّل الجديد
 */

const CloudAPIProvider = require('./providers/cloud-api-provider');
const WebJSProvider    = require('./providers/web-js-provider');

let activeProvider = null;
let mainWindowRef  = null;
let dbRef          = null;

// ──────────────────────────────────────────────
// تهيئة المدير عند بدء التطبيق
// ──────────────────────────────────────────────
async function initWhatsAppManager(db, mainWindow) {
  dbRef          = db;
  mainWindowRef  = mainWindow;

  const settings = getWhatsAppSettings(db);

  try {
    if (settings.provider === 'cloud_api') {
      const newProvider = new CloudAPIProvider();
      const templateMap = getTemplateMap(db);
      await newProvider.initialize({
        phoneNumberId:     settings.wa_phone_number_id,
        accessToken:       settings.wa_access_token_plain, // مفكوك مسبقاً
        businessAccountId: settings.wa_business_account_id,
        apiVersion:        settings.wa_api_version || 'v20.0',
        templateMap,
      });
      activeProvider = newProvider;
      console.log('[Manager] ✅ تم تشغيل Cloud API Provider');

    } else {
      // web_js هو الافتراضي (للعملاء الحاليين وعند عدم وجود إعدادات)
      if (activeProvider && activeProvider instanceof WebJSProvider && (activeProvider.client || activeProvider.clientReady)) {
        console.log('[Manager] ✅ Web.js Provider يعمل بالفعل');
        return activeProvider;
      }
      const newProvider = new WebJSProvider();
      await newProvider.initialize({
        mainWindow,
        sessionPath: mainWindow.webContents.getOwnerBrowserWindow()
          ? require('electron').app.getPath('userData')
          : settings.web_session_path,
        clientId: settings.web_session_client_id || 'photostudio-whatsapp',
      });
      activeProvider = newProvider;
      console.log('[Manager] ✅ تم تشغيل Web.js Provider');
    }

  } catch (err) {
    console.error('[Manager] ❌ فشل تشغيل المزوّد:', err.message);
    activeProvider = null;
    sendToRenderer('whatsapp:error', `فشل تشغيل مزوّد الواتساب: ${err.message}`);
  }

  return activeProvider;
}

// ──────────────────────────────────────────────
// تهيئة المدير لـ Web.js (مُبسَّطة — تُستدعى من main.js مع app)
// ──────────────────────────────────────────────
async function initWhatsAppManagerWithApp(db, mainWindow, app) {
  dbRef         = db;
  mainWindowRef = mainWindow;

  const settings = getWhatsAppSettings(db);

  try {
    if (settings.provider === 'cloud_api') {
      const newProvider = new CloudAPIProvider();
      const templateMap = getTemplateMap(db);
      await newProvider.initialize({
        phoneNumberId:     settings.wa_phone_number_id,
        accessToken:       settings.wa_access_token_plain,
        businessAccountId: settings.wa_business_account_id,
        apiVersion:        settings.wa_api_version || 'v20.0',
        templateMap,
      });
      activeProvider = newProvider;
      console.log('[Manager] ✅ Cloud API Provider نشط');

    } else {
      if (activeProvider && activeProvider instanceof WebJSProvider && (activeProvider.client || activeProvider.clientReady)) {
        console.log('[Manager] ✅ Web.js Provider يعمل بالفعل');
        return activeProvider;
      }
      const newProvider = new WebJSProvider();
      await newProvider.initialize({
        mainWindow,
        sessionPath: app.getPath('userData'),
        clientId:    settings.web_session_client_id || 'photostudio-whatsapp',
      });
      activeProvider = newProvider;
      console.log('[Manager] ✅ Web.js Provider نشط');
    }

  } catch (err) {
    console.error('[Manager] ❌ فشل التشغيل:', err.message);
    activeProvider = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('whatsapp:error', `فشل تشغيل الواتساب: ${err.message}`);
    }
  }

  return activeProvider;
}

// ──────────────────────────────────────────────
// التبديل بين المزوّدين — مع Rollback آمن
// ──────────────────────────────────────────────
async function switchProvider(newProviderType, newConfig, db, app) {
  const oldProvider = activeProvider;
  const oldSettings = getWhatsAppSettings(db);

  console.log(`[Manager] 🔄 التبديل من "${oldSettings.provider}" إلى "${newProviderType}"`);

  // إيقاف المزوّد القديم أولاً لتفريغ المنافذ وقفل متصفح كروم
  if (oldProvider) {
    try {
      await oldProvider.destroy();
      console.log('[Manager] ✅ تم إيقاف المزوّد القديم بنجاح');
    } catch (e) {
      console.warn('[Manager] تحذير أثناء إيقاف المزوّد القديم:', e.message);
    }
  }

  let newProvider = null;

  try {
    if (newProviderType === 'cloud_api') {
      newProvider = new CloudAPIProvider();
      const templateMap = getTemplateMap(db);
      await newProvider.initialize({
        phoneNumberId:     newConfig.wa_phone_number_id,
        accessToken:       newConfig.wa_access_token_plain,
        businessAccountId: newConfig.wa_business_account_id,
        apiVersion:        newConfig.wa_api_version || 'v20.0',
        templateMap,
      });

    } else if (newProviderType === 'web_js') {
      newProvider = new WebJSProvider();
      await newProvider.initialize({
        mainWindow: mainWindowRef,
        sessionPath: app ? app.getPath('userData') : newConfig.web_session_path,
        clientId:    newConfig.web_session_client_id || 'photostudio-whatsapp',
      });

    } else {
      throw new Error(`نوع مزوّد غير معروف: ${newProviderType}`);
    }

    activeProvider = newProvider;
    console.log(`[Manager] ✅ تم التبديل بنجاح إلى "${newProviderType}"`);
    return { success: true };

  } catch (err) {
    console.error(`[Manager] ❌ فشل التبديل إلى "${newProviderType}":`, err.message);

    // ❌ فشل — نُبقي المزوّد القديم شغالاً
    if (newProvider) {
      try { await newProvider.destroy(); } catch {}
    }

    activeProvider = oldProvider; // Rollback
    return {
      success: false,
      error: `فشل التبديل إلى ${newProviderType === 'cloud_api' ? 'Meta Cloud API' : 'WhatsApp Web'}: ${err.message}`,
    };
  }
}

// ──────────────────────────────────────────────
// الحصول على المزوّد النشط
// ──────────────────────────────────────────────
async function enqueueMessage(phone, type, payload, manualPriority = false) {
  if (!activeProvider) return { success: false, error: 'خدمة الواتساب غير مهيأة' };
  
  const settings = getWhatsAppSettings(dbRef);
  if (typeof activeProvider.enqueue === 'function') {
    return await activeProvider.enqueue(phone, type, payload, settings, manualPriority);
  }
  const text = payload.customText || payload.text || payload.message || '';
  return await activeProvider.sendMessage({
    type: type === 'custom' ? 'free_text' : type,
    phone,
    payload: { ...payload, text, message: text },
    settings
  });
}

async function sendFile(phone, caption, filePath, extraData = {}) {
  if (!activeProvider) return { success: false, error: 'Provider not initialized' };
  if (typeof activeProvider.sendFile !== 'function') {
    return { success: false, error: 'Current provider does not support sending files directly' };
  }
  return await activeProvider.sendFile(phone, caption, filePath, extraData);
}

// ──────────────────────────────────────────────
// إرسال رسالة نصية حرة (للمحادثات والردود المباشرة)
// ──────────────────────────────────────────────
async function sendTextMessage(phone, text) {
  if (!activeProvider) return { success: false, error: 'خدمة الواتساب غير مهيأة' };
  
  let result = null;
  if (typeof activeProvider.sendTextMessage === 'function') {
    result = await activeProvider.sendTextMessage(phone, text);
  } else if (typeof activeProvider.sendMessage === 'function') {
    const settings = getWhatsAppSettings(dbRef);
    result = await activeProvider.sendMessage({ type: 'free_text', phone, payload: { message: text }, settings });
  } else {
    return { success: false, error: 'المزوّد الحالي لا يدعم إرسال الرسائل النصية' };
  }

  // حفظ الرسالة كـ outbound عند النجاح
  if (result && result.success && dbRef) {
    try {
      const { saveWhatsAppMessage } = require('../database/db');
      saveWhatsAppMessage({
        wa_message_id: result.messageId || null,
        phone,
        direction: 'outbound',
        message_type: 'text',
        message_body: text,
        status: 'sent',
        is_read: 1
      });
    } catch (e) {
      console.warn('[Manager] فشل حفظ الرسالة الصادرة في قاعدة البيانات:', e.message);
    }
  }

  return result;
}

// ──────────────────────────────────────────────
// حالة الاتصال والـ QR
// ──────────────────────────────────────────────
function getActiveProvider() {
  if (!activeProvider) {
    throw new Error('خدمة الواتساب غير مهيأة — راجع إعدادات الواتساب');
  }
  return activeProvider;
}

function getActiveProviderSafe() {
  return activeProvider; // بدون رمي خطأ
}

// ──────────────────────────────────────────────
// قراءة وكتابة إعدادات الواتساب من DB
// ──────────────────────────────────────────────
function getWhatsAppSettings(db) {
  try {
    const row = db.prepare(`
      SELECT * FROM whatsapp_settings WHERE id = 1
    `).get();

    if (!row) {
      // قيمة افتراضية: web_js
      return { provider: 'web_js', web_session_client_id: 'photostudio-whatsapp' };
    }

    // فكّ تشفير الـ Access Token إن كان موجوداً
    let accessTokenPlain = null;
    if (row.wa_access_token) {
      try {
        const { safeStorage } = require('electron');
        if (safeStorage.isEncryptionAvailable()) {
          const buffer = Buffer.from(row.wa_access_token, 'base64');
          accessTokenPlain = safeStorage.decryptString(buffer);
        }
      } catch (e) {
        console.warn('[Manager] فشل فكّ تشفير Access Token:', e.message);
      }
    }

    return { ...row, wa_access_token_plain: accessTokenPlain };
  } catch (e) {
    console.error('[Manager] خطأ في قراءة إعدادات الواتساب:', e.message);
    return { provider: 'web_js', web_session_client_id: 'photostudio-whatsapp' };
  }
}

function saveWhatsAppSettings(db, settings) {
  // تشفير الـ Access Token إن كان موجوداً
  let encryptedToken = null;
  if (settings.wa_access_token_plain) {
    try {
      const { safeStorage } = require('electron');
      if (safeStorage.isEncryptionAvailable()) {
        encryptedToken = safeStorage.encryptString(settings.wa_access_token_plain).toString('base64');
      } else {
        // fallback: تخزين بدون تشفير مع تحذير
        console.warn('[Manager] safeStorage غير متاح — الـ Token سيُخزَّن بدون تشفير');
        encryptedToken = Buffer.from(settings.wa_access_token_plain).toString('base64');
      }
    } catch (e) {
      console.error('[Manager] فشل تشفير Access Token:', e.message);
    }
  }

  const existing = db.prepare('SELECT id FROM whatsapp_settings WHERE id = 1').get();

  const data = {
    provider:               settings.provider || 'web_js',
    wa_phone_number_id:     settings.wa_phone_number_id || null,
    wa_access_token:        encryptedToken,
    wa_business_account_id: settings.wa_business_account_id || null,
    wa_api_version:         settings.wa_api_version || 'v20.0',
    web_session_client_id:  settings.web_session_client_id || 'photostudio-whatsapp',
    web_session_path:       settings.web_session_path || null,
    webhook_port:           settings.webhook_port !== undefined ? Number(settings.webhook_port) : 3000,
    webhook_verify_token:   settings.webhook_verify_token || 'photostudio_wa_token',
    webhook_custom_url:     settings.webhook_custom_url || '',
    webhook_auto_tunnel:    settings.webhook_auto_tunnel !== undefined ? (settings.webhook_auto_tunnel ? 1 : 0) : 1
  };

  if (existing) {
    db.prepare(`
      UPDATE whatsapp_settings SET
        provider               = @provider,
        wa_phone_number_id     = @wa_phone_number_id,
        wa_access_token        = @wa_access_token,
        wa_business_account_id = @wa_business_account_id,
        wa_api_version         = @wa_api_version,
        web_session_client_id  = @web_session_client_id,
        web_session_path       = @web_session_path,
        webhook_port           = @webhook_port,
        webhook_verify_token   = @webhook_verify_token,
        webhook_custom_url     = @webhook_custom_url,
        webhook_auto_tunnel    = @webhook_auto_tunnel,
        updated_at             = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run(data);
  } else {
    db.prepare(`
      INSERT INTO whatsapp_settings
        (id, provider, wa_phone_number_id, wa_access_token, wa_business_account_id,
         wa_api_version, web_session_client_id, web_session_path,
         webhook_port, webhook_verify_token, webhook_custom_url, webhook_auto_tunnel)
      VALUES
        (1, @provider, @wa_phone_number_id, @wa_access_token, @wa_business_account_id,
         @wa_api_version, @web_session_client_id, @web_session_path,
         @webhook_port, @webhook_verify_token, @webhook_custom_url, @webhook_auto_tunnel)
    `).run(data);
  }
}

// ──────────────────────────────────────────────
// خريطة القوالب
// ──────────────────────────────────────────────
function getTemplateMap(db) {
  try {
    const rows = db.prepare('SELECT logical_key, actual_template_name, language_code FROM whatsapp_template_map').all();
    const map = {};
    for (const row of rows) {
      map[row.logical_key] = {
        actual_template_name: row.actual_template_name,
        language_code:        row.language_code || 'ar',
      };
    }
    return map;
  } catch (e) {
    console.error('[Manager] خطأ في قراءة خريطة القوالب:', e.message);
    return {};
  }
}

function saveTemplateMap(db, templateMap) {
  const upsert = db.prepare(`
    INSERT INTO whatsapp_template_map (logical_key, actual_template_name, language_code)
    VALUES (@logical_key, @actual_template_name, @language_code)
    ON CONFLICT(logical_key) DO UPDATE SET
      actual_template_name = excluded.actual_template_name,
      language_code        = excluded.language_code
  `);

  const tx = db.transaction((entries) => {
    for (const entry of entries) {
      upsert.run(entry);
    }
  });

  const entries = Object.entries(templateMap).map(([key, val]) => ({
    logical_key:          key,
    actual_template_name: typeof val === 'string' ? val : val.actual_template_name,
    language_code:        typeof val === 'object' ? (val.language_code || 'ar') : 'ar',
  }));

  tx(entries);
}

// ──────────────────────────────────────────────
// مساعد: إرسال للـ renderer
// ──────────────────────────────────────────────
function sendToRenderer(channel, data) {
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send(channel, data);
  }
}

const https = require('https');

async function waitForTunnelReady(webhookUrl, verifyToken, maxAttempts = 7) {
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      const probeUrl = `${webhookUrl}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(verifyToken)}&hub.challenge=probe_${Date.now()}`;
      const ok = await new Promise((resolve) => {
        const req = https.get(probeUrl, { timeout: 4000 }, (res) => {
          if (res.statusCode === 200) resolve(true);
          else resolve(false);
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => { req.destroy(); resolve(false); });
      });
      if (ok) {
        console.log(`[Manager] 🟢 النفق جاهز ومستقر عبر الإنترنت بعد ${i} محاولة فحص`);
        return true;
      }
    } catch(e) {}
    await new Promise(r => setTimeout(r, 2000));
  }
  console.warn('[Manager] ⚠️ استغرق فحص النفق وقتاً، سيتم تجربة المزامنة مع Meta مباشرة');
  return false;
}

/**
 * مزامنة رابط النفق تلقائياً مع Meta
 */
async function syncTunnelUrlWithMeta(webhookUrl) {
  if (!dbRef) {
    try {
      const { getDb } = require('../database/db');
      const { app } = require('electron');
      if (app) dbRef = getDb(app);
    } catch(e){}
  }
  const settings = dbRef ? getWhatsAppSettings(dbRef) : {};
  const verifyToken = settings.webhook_verify_token || 'photostudio_wa_token';

  // أولاً: التأكد من انتشار رابط النفق في خوادم Cloudflare واستجابته
  await waitForTunnelReady(webhookUrl, verifyToken);

  let provider = activeProvider;
  if (!provider || typeof provider.syncWebhookUrlToMeta !== 'function') {
    if (settings.wa_phone_number_id && settings.wa_access_token_plain && settings.wa_business_account_id) {
      try {
        const p = new CloudAPIProvider();
        await p.initialize({
          phoneNumberId:     settings.wa_phone_number_id,
          accessToken:       settings.wa_access_token_plain,
          businessAccountId: settings.wa_business_account_id,
          apiVersion:        settings.wa_api_version || 'v20.0',
        });
        activeProvider = p;
        provider = p;
      } catch (err) {
        return { success: false, error: err.message };
      }
    } else {
      return { success: false, error: 'بيانات Meta Cloud API غير مكتملة للمزامنة' };
    }
  }

  // محاولة المزامنة مع Meta مع إعادة المحاولة الذكية إذا كانت شبكة Meta تتأخر
  let res = await provider.syncWebhookUrlToMeta(webhookUrl, verifyToken);
  if (!res.success && res.error && (res.error.includes('502') || res.error.includes('resolve host') || res.error.includes('ECONNRESET'))) {
    console.log('[Manager] ⏳ إعادة محاولة المزامنة مع Meta بعد 3 ثوان...');
    await new Promise(r => setTimeout(r, 3000));
    res = await provider.syncWebhookUrlToMeta(webhookUrl, verifyToken);
  }

  return res;
}


// ──────────────────────────────────────────────────────────────────────────────
// جلب التسجيل الصوتي من Meta Graph API وتحويله لـ base64 للتشغيل مباشرةً
// ──────────────────────────────────────────────────────────────────────────────
async function fetchAudioAsBase64(mediaId) {
  // نجيب الـ access token من الإعدادات المحفوظة
  let settings;
  try {
    if (!dbRef) {
      const { getDb } = require('../database/db');
      const { app } = require('electron');
      if (app) dbRef = getDb(app);
    }
    settings = dbRef ? getWhatsAppSettings(dbRef) : {};
  } catch (e) {
    return { success: false, error: 'تعذر قراءة إعدادات Meta: ' + e.message };
  }

  const accessToken = settings.wa_access_token_plain;
  const apiVersion  = settings.wa_api_version || 'v20.0';

  if (!accessToken) {
    return { success: false, error: 'لم يتم ضبط Access Token في إعدادات Meta' };
  }

  // الخطوة 1: جلب رابط الميديا من Meta
  let mediaUrl, mimeType;
  try {
    const metaInfoRaw = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'graph.facebook.com',
        path: `/${apiVersion}/${mediaId}`,
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.end();
    });
    const info = JSON.parse(metaInfoRaw);
    if (info.error) return { success: false, error: `Meta API: ${info.error.message}` };
    mediaUrl = info.url;
    mimeType = info.mime_type || 'audio/ogg';
  } catch (e) {
    return { success: false, error: 'فشل جلب رابط الصوت من Meta: ' + e.message };
  }

  // الخطوة 2: تحميل الملف الصوتي
  try {
    const audioBuffer = await new Promise((resolve, reject) => {
      const parsedUrl = new URL(mediaUrl);
      const reqOpts = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      };
      const req = https.request(reqOpts, (res) => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      });
      req.on('error', reject);
      req.end();
    });
    const base64Audio = audioBuffer.toString('base64');
    return { success: true, base64: base64Audio, mimeType };
  } catch (e) {
    return { success: false, error: 'فشل تحميل الملف الصوتي: ' + e.message };
  }
}

module.exports = {
  initWhatsAppManager,
  initWhatsAppManagerWithApp,
  switchProvider,
  getActiveProvider,
  getActiveProviderSafe,
  enqueueMessage,
  sendFile,
  sendTextMessage,
  getWhatsAppSettings,
  saveWhatsAppSettings,
  getTemplateMap,
  saveTemplateMap,
  syncTunnelUrlWithMeta,
  fetchAudioAsBase64,
};
