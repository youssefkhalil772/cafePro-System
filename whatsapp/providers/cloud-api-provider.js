'use strict';

/**
 * ============================================================
 * cloud-api-provider.js — مزوّد Meta WhatsApp Cloud API
 * ============================================================
 * يُطبّق عقد BaseWhatsAppProvider باستخدام Meta Cloud API الرسمي.
 *
 * مفهوم "جاهز" هنا: الإعدادات صحيحة ومتحقَّق منها (لا يوجد
 * "اتصال حي" مثل web.js — كل رسالة هي HTTP request مستقل).
 *
 * يستخدم https المدمج في Node — لا حاجة لـ axios أو node-fetch.
 */

const BaseWhatsAppProvider = require('./base-provider');
const https = require('https');
const fs = require('fs');
const path = require('path');

/**
 * ترجمة أكواد أخطاء Meta إلى رسائل عربية واضحة
 */
function translateMetaError(errorObj) {
  // errorObj قد يكون string أو object من Meta API
  const code  = errorObj?.code  || errorObj?.error_code || null;
  const msg   = errorObj?.message || String(errorObj);

  const translations = {
    132001: 'اسم القالب أو كود اللغة غير مطابق لما هو مسجّل على حساب واتساب. تحقق من إعدادات "ربط القوالب" وتأكد أن الاسم واللغة (مثلاً ar_EG) مطابقان تماماً لما هو مسجّل على Meta.',
    132000: 'عدد المتغيرات المرسلة لا يطابق القالب المسجّل على Meta. تحقق من عدد الحقول {{1}} {{2}} ... في القالب.',
    132005: 'ترويسة القالب غير متطابقة: يجب أن يكون نوع الترويسة في القالب Document (مستند).',
    131051: 'فشل في رفع ملف التقرير إلى سيرفرات Meta.',
    131052: 'فشل في معالجة ملف المستند من سيرفرات Meta.',
    131053: 'حجم ملف الـ PDF يتجاوز الحد الأقصى المسموح به من Meta.',
    132015: 'رقم الهاتف المرسَل إليه محظور أو غير صالح على منصة Meta.',
    132016: 'الرسالة إلى هذا المستلم محظورة حالياً من قِبَل Meta.',
    130472: 'رقم الهاتف المستلِم غير مسجّل على واتساب.',
    130429: 'تم تجاوز الحد المسموح به من الرسائل — حاول مرة أخرى لاحقاً.',
    131026: 'رقم الهاتف غير صالح أو بصيغة غير معتمدة.',
    131047: 'القالب لم يُراجَع بعد أو تم رفضه من Meta. تحقق من حالة القالب في Meta Business Suite.',
    131030: 'رقم الـ Phone Number ID الذي أدخلته غير مربوط بهذا الـ Access Token.',
    190:    'التوكن (Access Token) غير صالح أو منتهي الصلاحية. أعِد توليد Access Token جديد من Meta Business Suite وأدخله في الإعدادات.',
    200:    'صلاحيات الـ Access Token غير كافية. تأكد من منح صلاحيات whatsapp_business_messaging.',
    4:     'تم تجاوز حد الاستدعاءات (Rate Limit). انتظر بضع دقائق وأعِد المحاولة.',
    10:    'صلاحيات الـ Access Token غير كافية لهذه العملية.',
    100:   'معامِل خاطئ أو مفقود في الطلب المرسَل إلى Meta.',
  };

  if (code && translations[code]) {
    return `[كود ${code}] ${translations[code]}`;
  }

  // محاولة استخراج كود من النص نفسه (مثلاً "(#132001) Template...")
  if (msg) {
    const match = msg.match(/#(\d+)/);
    if (match) {
      const extractedCode = parseInt(match[1]);
      if (translations[extractedCode]) {
        return `[كود ${extractedCode}] ${translations[extractedCode]}`;
      }
    }
  }

  return msg; // إذا لم نجد ترجمة، نرجع الرسالة الأصلية
}

class CloudAPIProvider extends BaseWhatsAppProvider {
  constructor() {
    super();
    this.config = null;
    this.isConfigured = false; // true بعد اختبار ناجح للإعدادات
    this._templateMap = {};    // { logical_key: { actual_template_name, language_code } }
  }

  // ──────────────────────────────────────────────
  // تهيئة المزوّد
  // ──────────────────────────────────────────────
  async initialize(config) {
    if (!config.phoneNumberId || !config.accessToken) {
      throw new Error('Meta Cloud API يتطلب Phone Number ID و Access Token');
    }

    this.config = {
      phoneNumberId:     config.phoneNumberId,
      accessToken:       config.accessToken,
      businessAccountId: config.businessAccountId || null,
      apiVersion:        config.apiVersion || 'v20.0',
    };

    this._templateMap = config.templateMap || {};

    // التحقق من صحة الإعدادات عند التهيئة (بدون إرسال رسالة)
    try {
      await this._verifyCredentials();
      this.isConfigured = true;
      console.log('[CloudAPI] ✅ الإعدادات صحيحة وجاهزة');

      // ربط حساب واتساب التجاري (WABA) بالـ Webhook تلقائياً لاستقبال رسائل العملاء
      if (this.config.businessAccountId) {
        this._subscribeWabaToApp().catch(e => console.warn('[CloudAPI] WABA subscription warning:', e.message));
      }
    } catch (err) {
      this.isConfigured = false;
      // نرمي الخطأ للـ manager ليتعامل معه (Rollback)
      throw new Error(`فشل التحقق من إعدادات Meta Cloud API: ${err.message}`);
    }
  }

  /**
   * ربط حساب واتساب للأعمال (WABA) بتطبيق الـ Webhook حتى تحوّل ميتا رسائل العملاء إلى السيرفر
   */
  async _subscribeWabaToApp() {
    if (!this.config?.businessAccountId || !this.config?.accessToken) return;
    const apiPath = `/${this.config.apiVersion || 'v20.0'}/${this.config.businessAccountId}/subscribed_apps`;
    return new Promise((resolve) => {
      const req = https.request({
        hostname: 'graph.facebook.com',
        path: apiPath,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json'
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            console.log('[CloudAPI] ✅ WABA subscribed_apps result:', parsed);
            resolve(parsed);
          } catch(e) { resolve(null); }
        });
      });
      req.on('error', (e) => {
        console.warn('[CloudAPI] Failed to call subscribed_apps:', e.message);
        resolve(null);
      });
      req.end();
    });
  }

  /**
   * مزامنة وتحديث رابط الـ Webhook الجديد تلقائياً في Meta WABA دون تدخل يدوي
   * @param {string} webhookUrl رابط الـ Webhook الجديد المولد من النفق
   * @param {string} verifyToken رمز التحقق السري
   */
  async syncWebhookUrlToMeta(webhookUrl, verifyToken = 'photostudio_wa_token') {
    if (!this.config?.accessToken || !this.config?.businessAccountId) {
      return { success: false, error: 'Access Token أو WABA ID غير متوفر' };
    }

    if (!webhookUrl || !webhookUrl.startsWith('https://')) {
      return { success: false, error: 'رابط Webhook غير صالح' };
    }

    const wabaId = this.config.businessAccountId;
    const version = this.config.apiVersion || 'v20.0';
    const apiPath = `/${version}/${wabaId}/subscribed_apps`;

    const body = JSON.stringify({
      override_callback_uri: webhookUrl,
      verify_token: verifyToken
    });

    console.log(`[CloudAPI] 🔄 جاري مزامنة رابط الـ Webhook الجديد تلقائياً في Meta (${wabaId})...`);

    return new Promise((resolve) => {
      const req = https.request({
        hostname: 'graph.facebook.com',
        path: apiPath,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.success) {
              console.log('[CloudAPI] 🎯 تم تحديث رابط الـ Webhook في Meta بنجاح تام! 🎉');
              resolve({ success: true, data: parsed });
            } else if (parsed.error) {
              console.warn('[CloudAPI] ⚠️ تنبيه من Meta عند المزامنة:', parsed.error.message);
              resolve({ success: false, error: parsed.error.message });
            } else {
              resolve({ success: true, data: parsed });
            }
          } catch (e) {
            resolve({ success: false, error: 'استجابة غير صالحة من Meta' });
          }
        });
      });

      req.on('error', (err) => {
        console.warn('[CloudAPI] ❌ خطأ في شبكة Meta:', err.message);
        resolve({ success: false, error: err.message });
      });

      req.setTimeout(12000, () => {
        req.destroy();
        resolve({ success: false, error: 'انتهت مهلة الاتصال بـ Meta' });
      });

      req.write(body);
      req.end();
    });
  }

  // ──────────────────────────────────────────────
  // حالة المزوّد
  // ──────────────────────────────────────────────
  async getStatus() {
    if (!this.config) {
      return {
        ready: false,
        statusType: 'unconfigured',
        label: '⚙️ يحتاج إعداد Token و Phone Number ID من الإعدادات',
        needsQR: false,
        qrImage: null,
        provider: 'cloud_api',
      };
    }

    if (this.isConfigured) {
      return {
        ready: true,
        statusType: 'configured',
        label: '✅ إعدادات Meta Cloud API صحيحة ونشطة',
        needsQR: false,
        qrImage: null,
        provider: 'cloud_api',
      };
    }

    return {
      ready: false,
      statusType: 'unconfigured',
      label: '⚠️ الإعدادات موجودة لكن التحقق فشل — راجع الـ Token',
      needsQR: false,
      qrImage: null,
      provider: 'cloud_api',
    };
  }

  // ──────────────────────────────────────────────
  // إرسال رسالة عبر Cloud API
  // ──────────────────────────────────────────────
  async sendMessage({ type, phone, payload, settings }) {
    if (!this.isConfigured || !this.config) {
      return { success: false, error: 'Meta Cloud API غير مُهيَّأ — راجع الإعدادات' };
    }
    if (!phone || phone.trim() === '') {
      return { success: false, error: 'رقم الهاتف غير موجود' };
    }

    if (type === 'free_text' || type === 'custom') {
      const text = typeof payload === 'string' ? payload : (payload?.customText || payload?.message || payload?.text || '');
      return await this.sendTextMessage(phone, text);
    }

    try {
      const formattedPhone = this.formatEgyptianPhone(phone);
      const templateInfo = this._resolveTemplate(type);

      if (!templateInfo) {
        return {
          success: false,
          error: `لم يتم ربط نوع الرسالة "${type}" بقالب Meta — راجع إعدادات القوالب`,
        };
      }

      const bodyParams = this._buildTemplateParams(type, payload, settings);
      const body = this._buildRequestBody(formattedPhone, templateInfo, bodyParams);

      const res = await this._sendRequest(body);
      console.log(`[CloudAPI] ✅ إرسال (${type}) لـ ${phone} بقالب "${templateInfo.actual_template_name}"`);
      return { success: true, messageId: res?.messages?.[0]?.id };

    } catch (err) {
      console.error(`[CloudAPI] ❌ فشل الإرسال لـ ${phone}:`, err.message);
      return { success: false, error: err.message };
    }
  }

  // ──────────────────────────────────────────────
  // إرسال رسالة نصية حرة (ضمن نافذة الـ 24 ساعة للمحادثة)
  // ──────────────────────────────────────────────
  async sendTextMessage(phone, text) {
    if (!this.isConfigured || !this.config) {
      return { success: false, error: 'Meta Cloud API غير مُهيَّأ — راجع الإعدادات' };
    }
    if (!phone || String(phone).trim() === '') {
      return { success: false, error: 'رقم الهاتف غير موجود' };
    }
    if (!text || String(text).trim() === '') {
      return { success: false, error: 'نص الرسالة فارغ' };
    }

    try {
      const formattedPhone = this.formatEgyptianPhone(phone);
      const body = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedPhone,
        type: 'text',
        text: {
          preview_url: false,
          body: String(text).trim()
        }
      };

      const result = await this._sendRequest(body);
      console.log(`[CloudAPI] ✅ إرسال رسالة نصية حرة لـ ${phone}`);
      const waMessageId = result?.messages?.[0]?.id || null;
      return { success: true, messageId: waMessageId };
    } catch (err) {
      console.error(`[CloudAPI] ❌ فشل إرسال رسالة نصية حرة لـ ${phone}:`, err.message);
      return { success: false, error: err.message };
    }
  }

  // ──────────────────────────────────────────────
  // تعليم الرسالة كمقروءة على Meta
  // ──────────────────────────────────────────────
  async markAsReadOnMeta(messageId) {
    if (!this.isConfigured || !this.config || !messageId) return { success: false };
    try {
      const body = {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId
      };
      await this._sendRequest(body);
      return { success: true };
    } catch (err) {
      console.warn(`[CloudAPI] تعذر تعليم الرسالة كمقروءة على Meta:`, err.message);
      return { success: false, error: err.message };
    }
  }

  // ──────────────────────────────────────────────
  // رفع ملف وسائط (PDF / صورة / مستند) إلى Meta
  // ──────────────────────────────────────────────
  async uploadMedia(filePath, mimeType = 'application/pdf') {
    if (!this.isConfigured || !this.config) {
      throw new Error('Meta Cloud API غير مهيأ — راجع الإعدادات');
    }
    if (!fs.existsSync(filePath)) {
      throw new Error(`ملف المستند غير موجود: ${filePath}`);
    }

    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    const blob = new Blob([fileBuffer], { type: mimeType });

    const formData = new FormData();
    formData.append('messaging_product', 'whatsapp');
    formData.append('file', blob, fileName);
    formData.append('type', mimeType);

    const url = `https://graph.facebook.com/${this.config.apiVersion}/${this.config.phoneNumberId}/media`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.accessToken}`,
      },
      body: formData,
    });

    const data = await response.json();
    if (data.error) {
      throw new Error(translateMetaError(data.error));
    }
    if (!data.id) {
      throw new Error('فشل رفع الملف إلى Meta — لم يتم استلام Media ID');
    }
    return data.id;
  }

  // ──────────────────────────────────────────────
  // إرسال ملف PDF (التقرير اليومي) مع قالب Document أو نافذة 24 ساعة
  // ──────────────────────────────────────────────
  async sendFile(phone, caption, filePath, extraData = {}) {
    if (!this.isConfigured || !this.config) {
      return { success: false, error: 'Meta Cloud API غير مهيأ — راجع الإعدادات' };
    }
    if (!phone || phone.trim() === '') {
      return { success: false, error: 'رقم هاتف الإدارة غير موجود' };
    }
    if (!fs.existsSync(filePath)) {
      return { success: false, error: `ملف التقرير غير موجود: ${filePath}` };
    }

    try {
      const formattedPhone = this.formatEgyptianPhone(phone);
      console.log(`[CloudAPI] 📤 جاري رفع ملف التقرير إلى سيرفرات Meta: ${filePath}`);
      const mediaId = await this.uploadMedia(filePath, 'application/pdf');
      console.log(`[CloudAPI] ✅ تم رفع الملف بنجاح — Media ID: ${mediaId}`);

      const templateInfo = this._resolveTemplate('daily_report') || {
        actual_template_name: 'daily_report',
        language_code: 'ar'
      };

      const fileName = path.basename(filePath) || `تقرير-${extraData.date || 'اليوم'}.pdf`;

      // المتغيرات الـ 12 المطابقة لقالب daily_report المعتمد على Meta:
      // {{1}}: اسم المحل
      // {{2}}: التاريخ
      // {{3}}: إجمالي دخل اليوم
      // {{4}}: مصروفات اليوم
      // {{5}}: سلف ورواتب اليوم
      // {{6}}: صافي اليوم العام
      // {{7}}: نقدية (اليوم)
      // {{8}}: فودافون كاش (اليوم)
      // {{9}}: إنستا باي (اليوم)
      // {{10}}: كاش حالي (الرصيد الفعلي بالخزينة الآن)
      // {{11}}: فودافون كاش حالي (الرصيد الفعلي الآن)
      // {{12}}: إنستا باي حالي (الرصيد الفعلي الآن)
      const p = [
        String(extraData.shopName || extraData.shop || 'المحل'),
        String(extraData.date || new Date().toISOString().slice(0, 10)),
        String(extraData.totInc ?? '0'),
        String(extraData.totExp ?? '0'),
        String(extraData.totAdv ?? '0'),
        String(extraData.net ?? '0'),
        String(extraData.netCash ?? '0'),
        String(extraData.netVodafone ?? '0'),
        String(extraData.netInstapay ?? '0'),
        String(extraData.curCash ?? '0'),
        String(extraData.curVodafone ?? '0'),
        String(extraData.curInstapay ?? '0')
      ];

      const bodyParams = p.map(textVal => ({
        type: 'text',
        text: textVal
      }));

      const templatePayload = {
        messaging_product: 'whatsapp',
        to: formattedPhone,
        type: 'template',
        template: {
          name: templateInfo.actual_template_name,
          language: { code: templateInfo.language_code || 'ar' },
          components: [
            {
              type: 'header',
              parameters: [
                {
                  type: 'document',
                  document: {
                    id: mediaId,
                    filename: fileName
                  }
                }
              ]
            },
            {
              type: 'body',
              parameters: bodyParams
            }
          ]
        }
      };

      try {
        await this._sendRequest(templatePayload);
        console.log(`[CloudAPI] ✅ تم إرسال قالب التقرير اليومي بنجاح إلى الإدارة (${phone})`);
        return { success: true };
      } catch (templateErr) {
        console.warn(`[CloudAPI] ⚠️ تعذر الإرسال بالقالب (${templateErr.message})، جاري محاولة الإرسال كمستند مباشر (نافذة 24 ساعة)...`);

        // محاولة بديلة: إرسال المستند كرسالة مباشرة إذا كانت نافذة الـ 24 ساعة مفتوحة
        const directPayload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: formattedPhone,
          type: 'document',
          document: {
            id: mediaId,
            caption: caption || `📊 تقرير يوم ${extraData.date || ''}`,
            filename: fileName
          }
        };

        try {
          await this._sendRequest(directPayload);
          console.log(`[CloudAPI] ✅ تم إرسال المستند بنجاح عبر نافذة الـ 24 ساعة إلى الإدارة (${phone})`);
          return { success: true };
        } catch (directErr) {
          // إذا فشلت الطريقتان، نعيد الخطأ التوضيحي الخاص بالقالب
          throw templateErr;
        }
      }

    } catch (err) {
      console.error(`[CloudAPI] ❌ فشل إرسال ملف التقرير لـ ${phone}:`, err.message);
      return { success: false, error: err.message };
    }
  }

  // ──────────────────────────────────────────────
  // تدمير المزوّد (Cloud API لا يحتاج cleanup معقّد)
  // ──────────────────────────────────────────────
  async destroy() {
    this.isConfigured = false;
    this.config = null;
    this._templateMap = {};
    console.log('[CloudAPI] تم إيقاف مزوّد Cloud API');
  }

  // ──────────────────────────────────────────────
  // اختبار الاتصال — GET request فقط (بدون إرسال رسالة)
  // ──────────────────────────────────────────────
  async testConnection(testConfig) {
    const cfg = testConfig || this.config;
    if (!cfg || !cfg.phoneNumberId || !cfg.accessToken) {
      return { success: false, error: 'يرجى إدخال Phone Number ID و Access Token' };
    }
    try {
      const info = await this._verifyCredentials(cfg);
      return {
        success: true,
        data: {
          displayPhoneNumber: info.display_phone_number || '',
          verifiedName:       info.verified_name || '',
          qualityRating:      info.quality_rating || '',
        },
        message: `✅ الاتصال نجح — الرقم: ${info.display_phone_number || 'غير معروف'}`,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ──────────────────────────────────────────────
  // تحديث خريطة القوالب
  // ──────────────────────────────────────────────
  updateTemplateMap(templateMap) {
    this._templateMap = templateMap || {};
  }

  // ──────────────────────────────────────────────
  // جلب قائمة القوالب من حساب WABA مباشرة
  // GET /{waba-id}/message_templates
  // ──────────────────────────────────────────────
  async fetchAccountTemplates(cfg) {
    const c = cfg || this.config;
    if (!c || !c.businessAccountId || !c.accessToken) {
      throw new Error('يلزم توفّر Business Account ID و Access Token لجلب القوالب');
    }

    const apiPath = `/${c.apiVersion || 'v20.0'}/${c.businessAccountId}/message_templates` +
      `?access_token=${c.accessToken}&fields=name,language,status,components&limit=100`;

    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'graph.facebook.com',
        path:     apiPath,
        method:   'GET',
        headers:  { 'Content-Type': 'application/json' },
      }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              reject(new Error(translateMetaError(parsed.error)));
            } else {
              resolve(parsed.data || []);
            }
          } catch (e) {
            reject(new Error('استجابة غير صالحة من Meta API'));
          }
        });
      });

      req.on('error', (err) => {
        reject(new Error(`خطأ في الشبكة: ${err.message}`));
      });

      req.setTimeout(12000, () => {
        req.destroy();
        reject(new Error('انتهت مهلة الاتصال بـ Meta API (12 ثانية)'));
      });

      req.end();
    });
  }

  // ──────────────────────────────────────────────
  // مساعدات داخلية
  // ──────────────────────────────────────────────

  /**
   * التحقق من صحة الإعدادات عبر GET request — بدون إرسال رسالة
   * يستعلم عن معلومات رقم الهاتف المُسجَّل على Meta
   */
  async _verifyCredentials(cfg) {
    const c = cfg || this.config;
    const apiPath = `/${c.apiVersion || 'v20.0'}/${c.phoneNumberId}?access_token=${c.accessToken}&fields=display_phone_number,verified_name,quality_rating`;

    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'graph.facebook.com',
        path: apiPath,
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              reject(new Error(parsed.error.message || 'خطأ من Meta API'));
            } else {
              resolve(parsed);
            }
          } catch (e) {
            reject(new Error('استجابة غير صالحة من Meta API'));
          }
        });
      });

      req.on('error', (err) => {
        reject(new Error(`خطأ في الشبكة: ${err.message}`));
      });

      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('انتهت مهلة الاتصال بـ Meta API (10 ثوانٍ)'));
      });

      req.end();
    });
  }

  /**
   * إرسال طلب POST لـ Cloud API
   */
  async _sendRequest(body) {
    const jsonBody = JSON.stringify(body);
    const apiPath = `/${this.config.apiVersion}/` +
                    `${this.config.phoneNumberId}/messages`;

    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'graph.facebook.com',
        path: apiPath,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`,
          'Content-Type':  'application/json',
          'Content-Length': Buffer.byteLength(jsonBody),
        },
      }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              // ترجمة رسالة الخطأ إلى العربية
              reject(new Error(translateMetaError(parsed.error)));
            } else {
              resolve(parsed);
            }
          } catch (e) {
            reject(new Error('استجابة غير صالحة من Meta API'));
          }
        });
      });

      req.on('error', (err) => {
        reject(new Error(`خطأ في الشبكة: ${err.message}`));
      });

      req.setTimeout(15000, () => {
        req.destroy();
        reject(new Error('انتهت مهلة إرسال الرسالة (15 ثانية)'));
      });

      req.write(jsonBody);
      req.end();
    });
  }

  /**
   * حل اسم القالب الفعلي من المفتاح المنطقي
   */
  _resolveTemplate(logicalKey) {
    return this._templateMap[logicalKey] || null;
  }

  /**
   * بناء body الـ POST request لإرسال Template
   */
  _buildRequestBody(phone, templateInfo, bodyParams) {
    const body = {
      messaging_product: 'whatsapp',
      to:                phone,
      type:              'template',
      template: {
        name:     templateInfo.actual_template_name,
        language: { code: templateInfo.language_code || 'ar' },
      },
    };

    // إضافة معامِلات القالب إن وُجدت
    if (bodyParams && bodyParams.length > 0) {
      body.template.components = [{
        type:       'body',
        parameters: bodyParams // _buildTemplateParams الآن يرجع مصفوفة الـ objects جاهزة
      }];
    }

    console.log('---[Meta API Debug]---');
    console.log('Template actual name:', templateInfo.actual_template_name);
    console.log('Raw bodyParams array length:', bodyParams ? bodyParams.length : 0);
    console.log('Raw bodyParams:', bodyParams);
    if (body.template.components) {
       console.log('Constructed parameters length:', body.template.components[0].parameters.length);
       console.log('Constructed parameters:', body.template.components[0].parameters);
    }
    console.log('Full Payload:', JSON.stringify(body, null, 2));
    console.log('----------------------');

    return body;
  }

  /**
   * بناء قائمة معامِلات القالب حسب نوع الرسالة (Named Variables)
   */
  _buildTemplateParams(type, payload, settings) {
    const s = settings || {};
    
    const DEFAULT_VALUES = {
      customer_name: 'عميلنا العزيز',
      shop_name: 'المحل',
      invoice_number: '—',
      total: '0',
      paid: '0',
      remaining: '0',
      seller_name: '—',
      phone: '—', // رقم المحل للتواصل (وليس رقم العميل المُرسل إليه)
      payment_method: 'غير محدد',
      paid_now: '0',
    };

    const paymentMethodLabel = (method) =>
      method === 'فودافون كاش' ? 'تحويل' : 'نقدي';

    // استخراج القيم الخام من الـ payload
    const rawValues = {
      customer_name:  this.formatCustomerName(payload.customerName),
      shop_name:      s.company_name || payload.shopName,
      invoice_number: payload.invoiceNumber,
      total:          payload.total,
      paid:           payload.paid,
      remaining:      payload.remaining,
      seller_name:    payload.sellerName || payload.employeeName || '—',
      phone:          s.wa_phone1 || s.phone || payload.contactPhone,
      payment_method: payload.paymentMethod ? paymentMethodLabel(payload.paymentMethod) : null,
      paid_now:       payload.paidNow || payload.paid,
    };

    // القوالب وترتيبها وأسماء المتغيرات (يطابق بالضبط ما هو مسجّل على Meta)
    const templates = {
      invoice_confirm: [
        'customer_name', 'shop_name', 'invoice_number', 'total', 'paid', 'remaining', 'seller_name', 'phone'
      ],
      order_ready: [
        'customer_name', 'invoice_number', 'shop_name', 'phone'
      ],
      order_delivered: [
        'customer_name', 'invoice_number', 'shop_name'
      ],
      full_payment: [
        'customer_name', 'invoice_number', 'paid', 'payment_method', 'shop_name'
      ],
      partial_payment: [
        'customer_name', 'invoice_number', 'paid_now', 'payment_method', 'remaining', 'shop_name'
      ]
    };

    const expectedKeys = templates[type] || [];
    
    return expectedKeys.map(paramName => {
      let val = rawValues[paramName];
      
      if (val === undefined || val === null || val === '') {
        // حقول لا تقبل قيماً افتراضية ويجب أن تفشل العملية إذا غابت
        if (paramName === 'invoice_number') {
          throw new Error(`حقل جوهري مفقود أو فارغ: رقم الفاتورة (${paramName})`);
        }
        
        // استخدام القيمة الافتراضية للحقول الأخرى
        val = DEFAULT_VALUES[paramName] ?? '—';
        console.warn(`[WhatsApp] القيمة الافتراضية استُخدمت للمتغير "${paramName}" لأن القيمة الأصلية كانت فارغة`);
      }
      
      return {
        type: 'text',
        parameter_name: paramName,
        text: String(val)
      };
    });
  }
}

module.exports = CloudAPIProvider;
