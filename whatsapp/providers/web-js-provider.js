'use strict';

/**
 * ============================================================
 * web-js-provider.js — مزوّد whatsapp-web.js (Puppeteer)
 * ============================================================
 */

const BaseWhatsAppProvider = require('./base-provider');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');

// ── القوالب الافتراضية للرسائل النصية ──
const DEFAULT_TEMPLATES = {
  invoiceConfirm: `أهلاً {customerName} 🤍\n\nطلبك اتسجل عندنا في {shopName} 📸\n📋 تفاصيل الفاتورة:\nرقم الفاتورة: {invoiceNumber}\nتاريخ الاستلام: {date} {time}\nالمسؤول: {sellerName}\nالإجمالي: {total} جنيه\nالمدفوع: {paid} جنيه\nالباقي: {remaining} جنيه\n📸 ميعاد الاستلام المتوقع للصور/الألبومات: سيتم إشعاركم فور الجاهزية\nنتشرف بخدمتكم وتخليد أجمل لحظاتكم 🤍\n{shopName}\n📍 {address}\n📞 {contactPhone}`,

  orderReady: `أهلاً {customerName} 🤍\n\nطلبك جاهز عندنا في {shopName} 📸\nتم تجهيز طلبك بفاتورة رقم {invoiceNumber} وفي انتظار استلامك في أقرب فرصة.\nنتمنى نكون عند حسن ظنك 🤍\n\n{shopName}\n📍 {address}\n📞 {contactPhone}`,

  delivered: `أهلاً {customerName} 🤍\n\nشكراً لاستلامك طلبك من {shopName} 📸\nفاتورة رقم {invoiceNumber} — تم التسليم بنجاح ✅\n\nنتشرف بخدمتك دايماً وفي انتظار زيارتك القادمة 🤍\n\n{shopName}\n📍 {address}\n📞 {contactPhone}`,

  fullPayment: `أهلاً {customerName} 🤍\n\nتم استلام دفعتك، وفاتورتك رقم {invoiceNumber} مسددة بالكامل ✅\n💵 المبلغ المدفوع: {paid} جنيه\n💳 طريقة الدفع: {paymentMethod}\n\nشكرًا لثقتك في {shopName} 🤍 نتشرف بزيارتك دايمًا\n📞 {contactPhone}`,

  partialPayment: `أهلاً {customerName} 🤍\n\nتم استلام دفعتك بنجاح في {shopName} 📸\n🧾 فاتورة رقم {invoiceNumber}\n💵 المبلغ المدفوع الآن: {paidNow} جنيه\n💳 طريقة الدفع: {paymentMethod}\n📊 إجمالي المدفوع لحد دلوقتي: {totalPaid} جنيه\n📌 الباقي: {remaining} جنيه\n\nشكرًا لثقتك في {shopName} 🤍\n📞 {contactPhone}`,
};

class WebJSProvider extends BaseWhatsAppProvider {
  constructor() {
    super();
    this.client = null;
    this.clientReady = false;
    this.currentQR = null;
    this.mainWindowRef = null;
    this.initTimeout = null;
    this._statusLabel = 'جاري التهيئة...';
    this.messageQueue = [];
    this.isProcessingQueue = false;
  }

  // ─── تسجيل الأخطاء على سطح المكتب ────────────────────────────────────────
  _log(msg) {
    try {
      const os = require('os');
      const logPath = require('path').join(os.homedir(), 'Desktop', 'photostudio-error.txt');
      fs.appendFileSync(logPath, `\n[WebJS ${new Date().toISOString()}] ${msg}`);
    } catch (e) {}
    console.log('[WebJS]', msg);
  }

  // ──────────────────────────────────────────────
  // تهيئة المزوّد
  // ──────────────────────────────────────────────
  async initialize(config) {
    this.mainWindowRef = config.mainWindow;
    const userDataPath = config.sessionPath;

    const browserPath = this._getBrowserPath();
    if (!browserPath) {
      this.clientReady = false;
      this._statusLabel = '❌ متصفح Chrome غير متوفر';
      this._sendToRenderer('whatsapp:error', 'عفواً، يتطلب البرنامج وجود متصفح Google Chrome مثبتاً على جهازك.');
      this._log('❌ لم يُعثر على متصفح Chrome/Edge/Supermium');
      return;
    }

    this._log(`✅ المتصفح: ${browserPath}`);

    const clientId = config.clientId || 'photostudio-whatsapp';
    const sessionDir = path.join(userDataPath, 'whatsapp-sessions', 'session-' + clientId);
    this._sessionDir = sessionDir;

    // تنظيف أي عمليات سابقة معلقة أو ملفات قفل تمنع كروم من الفتح
    this._cleanupOrphanedProcessesAndLocks(sessionDir);

    const cacheDir = path.join(userDataPath, 'wwebjs_cache');
    try { fs.mkdirSync(cacheDir, { recursive: true }); } catch (e) {}

    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId,
        dataPath: path.join(userDataPath, 'whatsapp-sessions'),
      }),
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      webVersionCache: {
        type: 'local',
        path: cacheDir,
      },
      puppeteer: {
        headless: false,  // المتصفح ظاهر دائماً أمام المستخدم لضمان أقصى سرعة واستقرار
        executablePath: browserPath,
        timeout: 120000,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--no-first-run',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--window-size=1024,768',
        ],
      }
    });

    // ── Timeout: 3 دقائق للتهيئة ──
    const startTimeout = () => {
      clearTimeout(this.initTimeout);
      this.initTimeout = setTimeout(() => {
        if (!this.clientReady) {
          this._statusLabel = '⚠️ انتهت مهلة الاتصال\nجاري الاتصال... أو متوقف مؤقتاً';
          this._log('⚠️ انتهت مهلة الاتصال (3 دقائق) ولم يتم تسجيل الدخول بالكامل.');
        }
      }, 180000); // 3 دقائق
    };
    startTimeout();
    this._startTimeout = startTimeout;

    // ── ربط الأحداث ──
    this.client.on('loading_screen', (percent) => {
      this._statusLabel = `جاري تحميل واتساب... ${percent}%`;
      this._sendToRenderer('whatsapp:loading', percent);
    });

    this.client.on('qr', async (qr) => {
      if (this._startTimeout) this._startTimeout();
      this.currentQR = qr;
      this.clientReady = false;
      this._statusLabel = '📱 في انتظار مسح QR Code';
      this._log('📱 ظهر QR Code جديد');
      try {
        const qrImage = await qrcode.toDataURL(qr, { width: 256, margin: 2 });
        this._sendToRenderer('whatsapp:qr', qrImage);
      } catch (e) {
        this._sendToRenderer('whatsapp:qr', null);
      }
    });

    this.client.on('authenticated', () => {
      if (this._startTimeout) this._startTimeout();
      this.currentQR = null;
      this._statusLabel = 'جاري التحقق من الجلسة...';
      this._sendToRenderer('whatsapp:authenticated');
      this._log('✅ تم المصادقة — في انتظار جاهزية واتساب (ready)');

      // ── فحص احتياطي: التحقق الدوري مع التأكد التام من حقن WWebJS ──
      if (this._stateCheckInterval) clearInterval(this._stateCheckInterval);
      this._stateCheckInterval = setInterval(async () => {
        if (this.clientReady) {
          clearInterval(this._stateCheckInterval);
          return;
        }
        try {
          if (this.client) {
            const state = await this.client.getState().catch(() => null);
            if (state === 'CONNECTED') {
              const isReady = await this._ensureWWebJS();
              if (isReady) {
                clearInterval(this._stateCheckInterval);
                this.clientReady = true;
                this._statusLabel = '✅ متصل — جلسة واتساب نشطة';
                this._sendToRenderer('whatsapp:ready');
                this._log('✅ تم التأكد من الاتصال وجاهزية WWebJS بنجاح!');
                if (this.messageQueue.length > 0) {
                  this._processQueue();
                }
              } else {
                this._log('⏳ متصفح واتساب متصل وجاري استكمال حقن WWebJS...');
              }
            }
          }
        } catch (e) {}
      }, 3000);

      // إيقاف الفحص بعد دقيقتين تجنباً لاستنزاف الموارد
      setTimeout(() => {
        if (this._stateCheckInterval) clearInterval(this._stateCheckInterval);
      }, 120000);
    });

    this.client.on('auth_failure', (msg) => {
      this.clientReady = false;
      this._statusLabel = '❌ فشل التحقق من الجلسة';
      this._sendToRenderer('whatsapp:error', msg);
      this._log(`❌ auth_failure: ${msg}`);
    });

    this.client.on('ready', async () => {
      await this._ensureWWebJS();
      this.clientReady = true;
      this.currentQR = null;
      this._statusLabel = '✅ متصل — جلسة واتساب نشطة';
      this._sendToRenderer('whatsapp:ready');
      this._log('✅ جاهز للإرسال — ready event fired');
      // لو في رسائل معلقة، ابدأ الإرسال
      if (this.messageQueue.length > 0) {
        this._processQueue();
      }
    });

    this.client.on('disconnected', (reason) => {
      this.clientReady = false;
      this.currentQR = null;
      this._statusLabel = '🔴 غير متصل';
      this._sendToRenderer('whatsapp:disconnected', reason);
      this._log(`🔴 انقطع الاتصال: ${reason}`);
    });

    this.client.initialize().catch(err => {
      this._log(`❌ خطأ في التهيئة: ${err.message}`);
      this._statusLabel = `⚠️ خطأ: ${err.message}`;
      this._sendToRenderer('whatsapp:error', err.message);
    });
  }

  // ──────────────────────────────────────────────
  // التأكد من حقن window.WWebJS وحمايته من السقوط
  // ──────────────────────────────────────────────
  async _ensureWWebJS() {
    if (!this.client || !this.client.pupPage || this.client.pupPage.isClosed()) {
      return false;
    }
    try {
      const isReady = await this.client.pupPage.evaluate(() => {
        return typeof window.WWebJS !== 'undefined' && typeof window.WWebJS.getChat === 'function';
      }).catch(() => false);
      if (isReady) return true;

      this._log('🔄 جاري فحص وحقن window.WWebJS (LoadUtils)...');
      const { LoadUtils } = require('whatsapp-web.js/src/util/Injected/Utils');
      await this.client.pupPage.evaluate(LoadUtils).catch(e => {
        this._log(`⚠️ خطأ أثناء evaluate LoadUtils: ${e.message}`);
      });

      for (let i = 0; i < 15; i++) {
        const ready = await this.client.pupPage.evaluate(() => {
          return typeof window.WWebJS !== 'undefined' && typeof window.WWebJS.getChat === 'function';
        }).catch(() => false);
        if (ready) {
          this._log('✅ تم التحقق من حقن window.WWebJS بنجاح');
          return true;
        }
        await new Promise(r => setTimeout(r, 200));
      }
      return false;
    } catch (e) {
      this._log(`⚠️ _ensureWWebJS exception: ${e.message}`);
      return false;
    }
  }

  // ──────────────────────────────────────────────
  // حالة المزوّد
  // ──────────────────────────────────────────────
  async getStatus() {
    if (this.clientReady) {
      return {
        ready: true,
        statusType: 'connected',
        label: '✅ متصل — جلسة واتساب نشطة',
        needsQR: false,
        qrImage: null,
        provider: 'web_js',
      };
    }

    if (this.currentQR) {
      let qrImage = null;
      try {
        qrImage = await qrcode.toDataURL(this.currentQR, { width: 256, margin: 2 });
      } catch (e) {}
      return {
        ready: false,
        statusType: 'qr_pending',
        label: '📱 في انتظار مسح QR Code',
        needsQR: true,
        qrImage,
        provider: 'web_js',
      };
    }

    return {
      ready: false,
      statusType: 'disconnected',
      label: this._statusLabel || '🔴 غير متصل — جاري الاتصال...',
      needsQR: false,
      qrImage: null,
      provider: 'web_js',
    };
  }

  // ──────────────────────────────────────────────
  // إرسال رسالة
  // ──────────────────────────────────────────────
  sendMessage({ type, phone, payload, settings }) {
    if (!this.clientReady || !this.client) {
      this._log(`⚠️ محاولة إرسال لـ ${phone} لكن clientReady=${this.clientReady}`);
      return Promise.resolve({ success: false, error: 'واتساب غير متصل — يرجى فتح واتساب ومسح رمز QR من الإعدادات' });
    }
    if (!phone || String(phone).trim() === '') {
      return Promise.resolve({ success: false, error: 'رقم الهاتف غير موجود للعميل' });
    }

    return new Promise((resolve) => {
      this._log(`📤 إضافة رسالة للطابور (${type}) لـ ${phone}`);
      this.messageQueue.push({ type, phone: String(phone).trim(), payload, settings, resolve });
      this._processQueue();
    });
  }

  // للتوافق مع whatsapp-manager
  enqueue(phone, type, payload, settings, manualPriority = false) {
    return this.sendMessage({ type, phone, payload, settings });
  }

  async sendTextMessage(phone, text) {
    return await this.sendMessage({ type: 'free_text', phone, payload: { text, message: text } });
  }

  // ── معالجة الطابور ──────────────────────────────────────────────────────────
  async _processQueue() {
    if (this.isProcessingQueue || this.messageQueue.length === 0) return;
    this.isProcessingQueue = true;

    while (this.messageQueue.length > 0) {
      const msg = this.messageQueue.shift();

      if (!this.clientReady || !this.client) {
        this._log(`⚠️ الـ client غير جاهز — تم رفض رسالة لـ ${msg.phone}`);
        if (msg.resolve) msg.resolve({ success: false, error: 'انقطع اتصال واتساب أثناء الإرسال' });
        continue;
      }

      try {
        const formatted = this.formatEgyptianPhone(msg.phone);
        if (!formatted || formatted.length < 10) {
          this._log(`❌ رقم الهاتف غير صالح: ${msg.phone}`);
          if (msg.resolve) msg.resolve({ success: false, error: `رقم الهاتف "${msg.phone}" غير صالح` });
          continue;
        }

        const chatId = `${formatted}@c.us`;
        const message = this._buildMessage(msg.type, msg.payload, msg.settings);

        if (!message) {
          this._log(`⚠️ لم يُبنَ نص الرسالة من النوع "${msg.type}" لـ ${msg.phone}`);
          if (msg.resolve) msg.resolve({ success: false, error: 'فشل بناء محتوى الرسالة' });
          continue;
        }

        this._log(`📨 جاري إرسال الرسالة لـ ${msg.phone} (${chatId})...`);

        // التأكد من جاهزية WWebJS وحقنها إن لزم
        let ready = await this._ensureWWebJS();
        if (!ready && this.client.pupBrowser) {
          try {
            const pages = await this.client.pupBrowser.pages();
            if (pages.length > 0 && !pages[0].isClosed()) {
              this.client.pupPage = pages[0];
              ready = await this._ensureWWebJS();
            }
          } catch (pErr) {}
        }

        // محاكاة كتابة سريعة وواقعية (1.2 ثانية) مع حماية ضد أي خطأ
        try {
          if (this.client.sendPresenceAvailable) {
            await this.client.sendPresenceAvailable().catch(() => {});
          }
          const chat = await this.client.getChatById(chatId).catch(() => null);
          if (chat && typeof chat.sendStateTyping === 'function') {
            await chat.sendStateTyping().catch(() => {});
            await new Promise(r => setTimeout(r, 1200));
          }
        } catch (_) {}

        // إرسال الرسالة
        let sendResult = null;
        try {
          sendResult = await this.client.sendMessage(chatId, message);
        } catch (sendErr) {
          // التعامل مع مشكلة detached Frame واستعادة الصفحة
          if (sendErr.message && (sendErr.message.includes('detached Frame') || sendErr.message.includes('Execution context was destroyed'))) {
            this._log('🔄 تم اكتشاف detached Frame — محاولة استعادة الصفحة والـ Frame...');
            if (this.client.pupBrowser) {
              const pages = await this.client.pupBrowser.pages();
              if (pages.length > 0 && !pages[0].isClosed()) {
                this.client.pupPage = pages[0];
                await this._ensureWWebJS();
                sendResult = await this.client.sendMessage(chatId, message);
              } else {
                throw sendErr;
              }
            } else {
              throw sendErr;
            }
          } else {
            throw sendErr;
          }
        }

        this._log(`✅ تم الإرسال لـ ${msg.phone} بنجاح`);
        if (msg.resolve) msg.resolve({ success: true, messageId: sendResult?.id?.id || null });

      } catch (err) {
        this._log(`❌ فشل إرسال رسالة لـ ${msg.phone}: ${err.message}`);
        let friendlyErr = err.message;
        if (err.message && err.message.includes('getChat')) {
          friendlyErr = 'جلسة واتساب لا تزال قيد التحميل في المتصفح، يرجى الانتظار بضع ثوانٍ وإعادة المحاولة';
        } else if (err.message && err.message.includes('detached Frame')) {
          friendlyErr = 'حدث تحديث لصفحة واتساب، يرجى إعادة المحاولة الآن';
        }
        if (msg.resolve) msg.resolve({ success: false, error: friendlyErr });
      }

      // تأخير بسيط لمنع الحظر
      await new Promise(r => setTimeout(r, 1500));
    }

    this.isProcessingQueue = false;
  }

  async sendFile(phone, caption, filePath) {
    if (!this.clientReady || !this.client) return { success: false, error: 'واتساب غير متصل' };
    try {
      await this._ensureWWebJS();
      const { MessageMedia } = require('whatsapp-web.js');
      const formatted = this.formatEgyptianPhone(phone);
      const chatId = `${formatted}@c.us`;
      const media = MessageMedia.fromFilePath(filePath);
      await this.client.sendMessage(chatId, media, { caption });
      this._log(`✅ تم إرسال الملف لـ ${phone} بنجاح`);
      return { success: true };
    } catch (e) {
      this._log(`❌ فشل إرسال الملف لـ ${phone}: ${e.message}`);
      return { success: false, error: e.message };
    }
  }

  // ──────────────────────────────────────────────
  // تدمير المزوّد
  // ──────────────────────────────────────────────
  async destroy() {
    this.clientReady = false;
    this.currentQR = null;
    if (this.initTimeout) clearTimeout(this.initTimeout);
    if (this._stateCheckInterval) clearInterval(this._stateCheckInterval);

    if (this.client) {
      try {
        await this.client.destroy();
        this._log('✅ تم إغلاق Puppeteer بنجاح');
      } catch (e) {
        this._log(`⚠️ destroy() فشل: ${e.message}`);
        try { await this.client.logout(); } catch {}
        try { await this.client.destroy(); } catch {}
      }
      this.client = null;
    }

    if (this._sessionDir) {
      this._cleanupOrphanedProcessesAndLocks(this._sessionDir);
    }
  }

  // ──────────────────────────────────────────────
  // تنظيف العمليات المعلقة وملفات القفل
  // ──────────────────────────────────────────────
  _cleanupOrphanedProcessesAndLocks(sessionDir) {
    try {
      if (process.platform === 'win32') {
        const { execSync } = require('child_process');
        try {
          execSync(
            `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name = 'chrome.exe' OR Name = 'msedge.exe'\\" | Where-Object { \\$_.CommandLine -like '*session-photostudio-whatsapp*' } | ForEach-Object { Stop-Process -Id \\$_.ProcessId -Force }"`,
            { stdio: 'ignore', timeout: 5000 }
          );
        } catch (e) {}
      }

      if (fs.existsSync(sessionDir)) {
        const lockFiles = ['lockfile', 'SingletonLock', 'SingletonCookie', 'SingletonSocket', 'DevToolsActivePort'];
        for (const file of lockFiles) {
          const fullPath = path.join(sessionDir, file);
          if (fs.existsSync(fullPath)) {
            try {
              fs.unlinkSync(fullPath);
              this._log(`🧹 تم إزالة ملف القفل: ${file}`);
            } catch (e) {}
          }
        }
      }
    } catch (e) {
      this._log(`⚠️ تنبيه أثناء فحص الجلسة السابقة: ${e.message}`);
    }
  }

  // ──────────────────────────────────────────────
  // بناء نص الرسالة
  // ──────────────────────────────────────────────
  _buildMessage(type, payload, settings) {
    const s = settings || {};
    const shopName = s.company_name || payload.shopName || 'المحل';
    const address = s.address || payload.address || '';
    const contactPhone = s.wa_phone1 || s.phone || payload.contactPhone || '';

    const applyTpl = (tpl, vars) => {
      let result = tpl;
      for (const [key, value] of Object.entries(vars)) {
        result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value ?? '');
      }
      return result;
    };

    const paymentMethodLabel = (method) =>
      method === 'فودافون كاش' ? 'تحويل' : 'نقدي';

    const commonVars = {
      customerName: this.formatCustomerName(payload.customerName),
      invoiceNumber: payload.invoiceNumber || '—',
      shopName, address, contactPhone,
    };

    switch (type) {
      case 'invoice_confirm': {
        const tpl = (s.wa_tpl_invoice_confirm) || DEFAULT_TEMPLATES.invoiceConfirm;
        return applyTpl(tpl, {
          ...commonVars,
          total:      payload.total ?? '',
          paid:       payload.paid ?? '',
          remaining:  payload.remaining ?? '',
          sellerName: payload.sellerName || payload.employeeName || 'غير محدد',
          date:       payload.date || '',
          time:       payload.time || '',
        });
      }

      case 'order_ready': {
        const tpl = (s.wa_tpl_order_ready) || DEFAULT_TEMPLATES.orderReady;
        return applyTpl(tpl, commonVars);
      }

      case 'order_delivered': {
        const tpl = (s.wa_tpl_delivered) || DEFAULT_TEMPLATES.delivered;
        return applyTpl(tpl, commonVars);
      }

      case 'full_payment': {
        const tpl = (s.wa_tpl_full_payment) || DEFAULT_TEMPLATES.fullPayment;
        return applyTpl(tpl, {
          ...commonVars,
          paid:          payload.paid || payload.paidNow || '0',
          paymentMethod: paymentMethodLabel(payload.paymentMethod),
        });
      }

      case 'partial_payment': {
        const tpl = (s.wa_tpl_partial_payment) || DEFAULT_TEMPLATES.partialPayment;
        return applyTpl(tpl, {
          ...commonVars,
          paidNow:       payload.paidNow ?? '',
          totalPaid:     payload.totalPaid ?? '',
          remaining:     payload.remaining ?? '',
          paymentMethod: paymentMethodLabel(payload.paymentMethod),
        });
      }

      case 'custom':
      case 'free_text':
        return payload.text || payload.customText || payload.message || (typeof payload === 'string' ? payload : '');

      default:
        return null;
    }
  }

  // ──────────────────────────────────────────────
  // مساعدات داخلية
  // ──────────────────────────────────────────────
  _sendToRenderer(channel, data) {
    if (this.mainWindowRef && !this.mainWindowRef.isDestroyed()) {
      this.mainWindowRef.webContents.send(channel, data);
    }
  }

  _getBrowserPath() {
    const localAppData    = process.env.LOCALAPPDATA          || '';
    const programFiles    = process.env['ProgramFiles']       || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

    const paths = [
      path.join(programFiles,    'Supermium\\supermium.exe'),
      path.join(programFilesX86, 'Supermium\\supermium.exe'),
      path.join(programFiles,    'Supermium\\Application\\supermium.exe'),
      path.join(programFilesX86, 'Supermium\\Application\\supermium.exe'),
      path.join(programFiles,    'Google\\Chrome\\Application\\chrome.exe'),
      path.join(programFilesX86, 'Google\\Chrome\\Application\\chrome.exe'),
      localAppData ? path.join(localAppData, 'Google\\Chrome\\Application\\chrome.exe') : '',
      path.join(programFiles,    'Microsoft\\Edge\\Application\\msedge.exe'),
      path.join(programFilesX86, 'Microsoft\\Edge\\Application\\msedge.exe'),
    ];

    for (const p of paths) {
      if (p && fs.existsSync(p)) {
        this._log(`المتصفح المستخدم: ${p}`);
        return p;
      }
    }
    return null;
  }
}

module.exports = WebJSProvider;


