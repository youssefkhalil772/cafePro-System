'use strict';

let activePhone = null;
let activeName = null;
let conversations = [];
let currentTunnelUrl = null;

// ─── Web Audio API Notification Chime (Loud & Clear 2-tone Chime) ────────────
function playNotificationChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const now = ctx.currentTime;

    // النغمة الأولى (A5 - 880Hz) نغمة رنانة وواضحة
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);
    osc1.frequency.exponentialRampToValueAtTime(1046.5, now + 0.12);

    gain1.gain.setValueAtTime(0.9, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.35);

    // النغمة الثانية (E6 - 1318Hz) عالية ومبهجة ونافذة جداً في المكان
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(1318.51, now + 0.14);

    gain2.gain.setValueAtTime(0, now);
    gain2.gain.setValueAtTime(1.0, now + 0.14);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    osc2.start(now + 0.14);
    osc2.stop(now + 0.7);
  } catch (e) {
    console.warn('Audio chime failed:', e);
  }
}

let searchDebounceTimer = null;

// ─── Initialize ───────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadWebhookStatus();
  await loadConversations();
  updateTotalUnreadBadge();

  if (window.whatsapp && typeof window.whatsapp.onNewMessage === 'function') {
    window.whatsapp.onNewMessage(handleIncomingMessage);
  }

  if (window.whatsapp && typeof window.whatsapp.onTunnelStatus === 'function') {
    window.whatsapp.onTunnelStatus(updateTunnelUI);
  }

  if (window.whatsapp && typeof window.whatsapp.onMetaSynced === 'function') {
    window.whatsapp.onMetaSynced((data) => {
      if (data && data.success) {
        setMetaBadgeSuccess();
      } else {
        setMetaBadgeError(data ? data.error : null);
      }
    });
  }

  setInterval(loadConversations, 15000);

  // إعادة فحص حالة النفق تلقائياً كل ثانيتين حتى يكتمل الربط ويظهر الرابط
  const tunnelPoll = setInterval(async () => {
    if (currentTunnelUrl) {
      clearInterval(tunnelPoll);
      return;
    }
    await loadWebhookStatus();
  }, 2000);
});

function navigate(page) {
  if (window.electron && typeof window.electron.navigate === 'function') {
    window.electron.navigate(page);
  } else {
    window.location.href = page;
  }
}

// فتح إعدادات الواتساب مباشرة داخل صفحة الإعدادات
function openMetaSettings() {
  sessionStorage.setItem('settings_target_section', 'whatsapp');
  navigate('settings.html');
}

function setMetaBadgeSuccess() {
  const badge = document.getElementById('metaSyncBadge');
  if (!badge) return;
  badge.dataset.synced = '1';
  badge.style.display = 'inline-flex';
  badge.style.background = '#E6FFFA';
  badge.style.color = '#234E52';
  badge.style.borderColor = '#B2F5EA';
  badge.style.cursor = 'default';
  badge.onclick = null;
  badge.innerHTML = 'متزامن ومربوط مع Meta تلقائياً ';
}

function setMetaBadgeError(errMsg) {
  const badge = document.getElementById('metaSyncBadge');
  if (!badge) return;
  badge.dataset.synced = '';
  badge.style.display = 'inline-flex';
  badge.style.background = '#FEE2E2';
  badge.style.color = '#991B1B';
  badge.style.borderColor = '#FCA5A5';
  badge.style.cursor = 'pointer';
  badge.onclick = () => retryMetaSync();
  badge.innerHTML = 'تعذرت مزامنة Meta تلقائياً — اضغط للمحاولة ';
  badge.title = errMsg || 'فشل التحقق من الرابط في Meta';
}

async function retryMetaSync() {
  if (!currentTunnelUrl) return;
  const badge = document.getElementById('metaSyncBadge');
  if (badge) {
    badge.style.background = '#FEFCBF';
    badge.style.color = '#744210';
    badge.style.borderColor = '#F6E05E';
    badge.innerHTML = '⏳ جاري إعادة المزامنة مع Meta...';
  }
  try {
    const res = await window.whatsapp.syncMetaWebhook(currentTunnelUrl);
    if (res && res.success) {
      setMetaBadgeSuccess();
      Swal.fire({
        icon: 'success',
        title: 'تمت المزامنة بنجاح!',
        text: 'تم ربط رابط الـ Webhook الجديد في Meta WhatsApp بنجاح تام ',
        timer: 2000,
        showConfirmButton: false
      });
    } else {
      setMetaBadgeError(res ? res.error : null);
      Swal.fire({
        icon: 'warning',
        title: 'تنبيه',
        text: res ? res.error : 'فشلت المزامنة مع خوادم Meta'
      });
    }
  } catch (err) {
    setMetaBadgeError(err.message);
  }
}

// ─── Webhook & Tunnel Status ──────────────────────────────────────────────────
async function loadWebhookStatus() {
  try {
    if (!window.whatsapp || !window.whatsapp.getWebhookInfo) return;
    const res = await window.whatsapp.getWebhookInfo();
    if (res.success && res.data) {
      updateTunnelUI(res.data.tunnel, res.data.server);
    }
  } catch (e) {
    console.error('Failed to get webhook info:', e);
  }
}

function updateTunnelUI(tunnel, server) {
  const pill = document.getElementById('webhookPill');
  const text = document.getElementById('webhookStatusText');
  const urlText = document.getElementById('tunnelUrlText');
  const copyBtn = document.getElementById('copyUrlBtn');
  const metaBadge = document.getElementById('metaSyncBadge');

  if (tunnel && tunnel.status === 'connected' && tunnel.webhookUrl) {
    currentTunnelUrl = tunnel.webhookUrl;
    pill.className = 'status-pill online';
    text.textContent = 'استقبال الرسائل نشط (Webhook متصل)';
    urlText.textContent = tunnel.webhookUrl;
    copyBtn.style.display = 'inline-block';

    if (metaBadge) {
      metaBadge.style.display = 'inline-flex';
      if (!metaBadge.dataset.synced) {
        metaBadge.style.background = '#FEFCBF';
        metaBadge.style.color = '#744210';
        metaBadge.style.borderColor = '#F6E05E';
        metaBadge.innerHTML = '⏳ جاري مزامنة الرابط مع Meta...';
      }
    }

    // مزامنة تلقائية مع Meta Graph API فور استقرار النفق
    if (window.whatsapp && typeof window.whatsapp.syncMetaWebhook === 'function' && !metaBadge?.dataset?.synced) {
      window.whatsapp.syncMetaWebhook(tunnel.webhookUrl).then((syncRes) => {
        if (syncRes && syncRes.success) {
          setMetaBadgeSuccess();
        } else {
          setMetaBadgeError(syncRes?.error);
        }
      }).catch(err => setMetaBadgeError(err.message));
    }
  } else if (server && server.isRunning) {
    pill.className = 'status-pill online';
    text.textContent = 'السيرفر المحلي نشط (Port ' + server.port + ') — جاري ربط النفق';
    urlText.textContent = '';
    copyBtn.style.display = 'none';
    if (metaBadge) metaBadge.style.display = 'none';
  } else {
    pill.className = 'status-pill offline';
    text.textContent = 'استقبال الرسائل متوقف';
    urlText.textContent = '';
    copyBtn.style.display = 'none';
    if (metaBadge) metaBadge.style.display = 'none';
  }
}

function copyWebhookUrl() {
  if (!currentTunnelUrl) return;
  navigator.clipboard.writeText(currentTunnelUrl).then(() => {
    Swal.fire({
      icon: 'success',
      title: 'تم النسخ!',
      text: 'تم نسخ رابط الـ Webhook بنجاح.',
      timer: 1800,
      showConfirmButton: false
    });
  });
}

// ─── Conversations List ───────────────────────────────────────────────────────
async function loadConversations(searchQuery = '') {
  try {
    const res = await window.db.getWhatsAppConversations(searchQuery);
    if (!res.success) return;

    conversations = res.data || [];
    renderConversationsList();
  } catch (e) {
    console.error('Failed to load conversations:', e);
  }
}

function renderConversationsList() {
  const listEl = document.getElementById('conversationsList');
  if (!listEl) return;

  if (conversations.length === 0) {
    listEl.innerHTML = '<div style="padding:40px 20px; text-align:center; color:var(--text-muted); font-size:13px;">لا توجد محادثات حتى الآن</div>';
    return;
  }

  listEl.innerHTML = conversations.map(c => {
    const isActive = activePhone && normalize(activePhone) === normalize(c.phone);
    const initial = (c.display_name || c.phone || '؟').trim().charAt(0);
    const timeFormatted = formatTime(c.last_time);
    const hasUnread = Number(c.unread_count) > 0;
    const displayName = c.display_name || c.phone;

    return '<li class="conversation-item ' + (isActive ? 'active' : '') + '" onclick="selectConversation(\'' + escapeHtml(c.phone) + '\', \'' + escapeHtml(displayName) + '\')">' +
      '<div class="conversation-avatar">' + escapeHtml(initial) + '</div>' +
      '<div class="conversation-info">' +
        '<div class="conversation-top">' +
          '<span class="conversation-name">' + escapeHtml(displayName) + '</span>' +
          '<span class="conversation-time">' + timeFormatted + '</span>' +
        '</div>' +
        '<div class="conversation-bottom">' +
          '<span class="conversation-last-msg">' + escapeHtml(c.last_message || '') + '</span>' +
          (hasUnread ? '<span class="conversation-unread-badge">' + c.unread_count + '</span>' : '') +
        '</div>' +
      '</div>' +
      '<button class="conversation-delete-btn" onclick="deleteConversationItem(\'' + escapeHtml(c.phone) + '\', \'' + escapeHtml(displayName) + '\', event)" title="حذف المحادثة"> حذف</button>' +
    '</li>';
  }).join('');
}

function handleSearch(val) {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    loadConversations(val);
  }, 200);
}

// ─── Select & Load Conversation ───────────────────────────────────────────────
async function selectConversation(phone, name) {
  activePhone = phone;
  activeName = name || phone;

  document.getElementById('chatEmptyState').style.display = 'none';
  const chatWrapper = document.getElementById('activeChatWrapper');
  chatWrapper.style.display = 'flex';

  document.getElementById('activeChatName').textContent = activeName;
  document.getElementById('activeChatPhone').textContent = phone;
  document.getElementById('activeChatAvatar').textContent = activeName.trim().charAt(0);

  renderConversationsList();
  await loadMessagesForActiveChat();
  await window.db.markWhatsAppConversationAsRead(activePhone);
  updateTotalUnreadBadge();

  const input = document.getElementById('chatInput');
  if (input) {
    input.focus();
  }
}

async function loadMessagesForActiveChat() {
  if (!activePhone) return;

  const messagesArea = document.getElementById('chatMessagesArea');
  const res = await window.db.getWhatsAppMessages(activePhone);

  if (!res.success || !res.data || res.data.length === 0) {
    messagesArea.innerHTML = '<div style="margin:auto; color:var(--text-muted); font-size:12px; background:rgba(255,255,255,0.7); padding:8px 16px; border-radius:12px; border:1px solid var(--border);">لا توجد رسائل سابقة مع هذا العميل. اكتب رسالة للبدء.</div>';
    return;
  }

  const messages = res.data;
  messagesArea.innerHTML = messages.map(m => {
    const isInbound = m.direction === 'inbound';
    const bubbleClass = isInbound ? 'inbound' : 'outbound';
    const time = formatTime(m.created_at);
    const msgType = (m.message_type || 'text').toLowerCase();

    // ─── عرض التسجيل الصوتي ─────────────────────────────────────────────────
    let bodyHtml;
    if (msgType === 'audio' || msgType === 'voice') {
      const hasMedia = m.media_url && m.media_url.trim() !== '';
      const mediaId  = hasMedia ? escapeHtml(m.media_url) : '';
      const playerId = 'audio-player-' + m.id;

      if (hasMedia) {
        // زر تشغيل يجيب الصوت من Meta عند الضغط
        bodyHtml =
          '<div style="display:flex; align-items:center; gap:10px; padding:4px 2px; min-width:220px;">' +
            '<button id="playBtn-' + m.id + '" ' +
              'onclick="playAudioMessage(\'' + mediaId + '\', ' + m.id + ')" ' +
              'style="width:42px; height:42px; border-radius:50%; background:var(--wa-green); border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:background 0.15s;" ' +
              'title="تشغيل التسجيل">' +
              '<svg width="18" height="18" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21"/></svg>' +
            '</button>' +
            '<div style="flex:1;">' +
              '<div id="' + playerId + '">' +
                '<div style="font-weight:700; font-size:13px; color:var(--text-primary);">تسجيل صوتي</div>' +
                '<div style="font-size:11px; color:var(--text-muted); margin-top:2px;">اضغط ▶ للاستماع</div>' +
              '</div>' +
            '</div>' +
          '</div>';
      } else {
        // لا يوجد media_id مخزون (رسائل قديمة)
        bodyHtml =
          '<div style="display:flex; align-items:center; gap:10px; padding:4px 2px;">' +
            '<span style="font-size:22px;"></span>' +
            '<div>' +
              '<div style="font-weight:700; font-size:13px; color:var(--text-primary);">تسجيل صوتي</div>' +
              '<div style="font-size:11px; color:var(--text-muted); margin-top:2px;">لا يمكن التشغيل — الملف غير محفوظ</div>' +
            '</div>' +
          '</div>';
      }

    // ─── عرض الـ Reaction ────────────────────────────────────────────────────
    } else if (msgType === 'reaction') {
      const body = m.message_body || '';
      const emojiMatch = body.match(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})/u);
      const emoji = emojiMatch ? emojiMatch[0] : '';
      bodyHtml =
        '<div style="display:flex; align-items:center; gap:8px;">' +
          '<span style="font-size:28px; line-height:1; filter:drop-shadow(0 1px 2px rgba(0,0,0,0.15));">' + emoji + '</span>' +
          '<span style="font-size:11px; color:var(--text-muted);">reaction</span>' +
        '</div>';

    // ─── الرسائل العادية ─────────────────────────────────────────────────────
    } else {
      bodyHtml = '<div style="white-space:pre-wrap;">' + escapeHtml(m.message_body || '') + '</div>';
    }

    return '<div class="message-bubble ' + bubbleClass + '">' +
      '<button class="msg-delete-btn" onclick="deleteSingleMessage(' + m.id + ', event)" title="حذف هذه الرسالة">✕</button>' +
      bodyHtml +
      '<div class="message-meta">' +
        '<span>' + time + '</span>' +
        (!isInbound ? '<span class="message-status-check">✓✓</span>' : '') +
      '</div>' +
    '</div>';
  }).join('');

  messagesArea.scrollTo({ top: messagesArea.scrollHeight, behavior: 'smooth' });
}

// ─── تشغيل التسجيل الصوتي من Meta ────────────────────────────────────────────
async function playAudioMessage(mediaId, msgId) {
  const playBtn   = document.getElementById('playBtn-' + msgId);
  const playerDiv = document.getElementById('audio-player-' + msgId);
  if (!playBtn || !playerDiv) return;

  // تغيير الزر لـ loading
  playBtn.disabled = true;
  playBtn.style.background = '#94A3B8';
  playBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="white"><circle cx="12" cy="12" r="9" stroke="white" stroke-width="2" fill="none" stroke-dasharray="28" stroke-dashoffset="28"><animate attributeName="stroke-dashoffset" from="28" to="0" dur="0.8s" repeatCount="indefinite"/></circle></svg>';

  try {
    const res = await window.whatsapp.fetchAudio(mediaId);

    if (!res.success) {
      playBtn.style.background = '#DC2626';
      playBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="white"><line x1="18" y1="6" x2="6" y2="18" stroke="white" stroke-width="2"/><line x1="6" y1="6" x2="18" y2="18" stroke="white" stroke-width="2"/></svg>';
      playerDiv.innerHTML = '<div style="font-size:11px; color:#DC2626; margin-top:2px;">' + escapeHtml(res.error || 'تعذر تحميل الصوت') + '</div>';
      return;
    }

    // إنشاء audio player مع الـ base64
    const mimeType = res.mimeType || 'audio/ogg';
    const audioSrc = 'data:' + mimeType + ';base64,' + res.base64;

    playerDiv.innerHTML =
      '<audio controls style="width:100%; max-width:260px; border-radius:8px; height:36px; margin-top:2px;" src="' + audioSrc + '" autoplay>' +
        '<source src="' + audioSrc + '" type="' + escapeHtml(mimeType) + '">' +
      '</audio>';

    // إخفاء زر التشغيل بعد تحميل الصوت
    playBtn.style.display = 'none';

  } catch (err) {
    playBtn.disabled = false;
    playBtn.style.background = '#DC2626';
    playBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21"/></svg>';
    playerDiv.innerHTML = '<div style="font-size:11px; color:#DC2626;">خطأ: ' + escapeHtml(err.message) + '</div>';
  }
}


function refreshCurrentChat() {
  if (activePhone) {
    loadMessagesForActiveChat();
    loadConversations();
  }
}

// ─── Sending Message ──────────────────────────────────────────────────────────
async function sendMessage() {
  if (!activePhone) return;
  const input = document.getElementById('chatInput');
  const text = (input.value || '').trim();
  if (!text) return;

  const sendBtn = document.getElementById('sendBtn');
  sendBtn.disabled = true;

  try {
    const res = await window.whatsapp.sendChatMessage(activePhone, text);

    if (res.success) {
      input.value = '';
      input.style.height = 'auto';

      await loadMessagesForActiveChat();
      await loadConversations();
    } else {
      Swal.fire({
        icon: 'error',
        title: 'تعذر إرسال الرسالة',
        text: res.error || 'حدث خطأ أثناء إرسال الرسالة عبر الواتساب',
        confirmButtonText: 'حسناً',
        confirmButtonColor: 'var(--primary)'
      });
    }
  } catch (err) {
    Swal.fire({
      icon: 'error',
      title: 'خطأ',
      text: err.message,
      confirmButtonText: 'حسناً'
    });
  } finally {
    sendBtn.disabled = false;
    input.focus();
  }
}

function handleInputKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

// ─── Delete Actions ───────────────────────────────────────────────────────────
async function deleteActiveChat() {
  if (!activePhone) return;
  const result = await Swal.fire({
    title: 'حذف المحادثة بالكامل؟',
    text: `هل أنت متأكد من مسح جميع رسائل المحادثة مع "${activeName || activePhone}"؟ لا يمكن التراجع عن هذا الإجراء.`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#DC2626',
    cancelButtonColor: '#94A3B8',
    confirmButtonText: 'نعم، احذف المحادثة',
    cancelButtonText: 'إلغاء'
  });

  if (!result.isConfirmed) return;

  try {
    const res = await window.db.deleteWhatsAppConversation(activePhone);
    if (res.success) {
      Swal.fire({
        icon: 'success',
        title: 'تم الحذف',
        text: 'تم مسح المحادثة بنجاح',
        timer: 1500,
        showConfirmButton: false
      });
      activePhone = null;
      activeName = null;
      document.getElementById('activeChatWrapper').style.display = 'none';
      document.getElementById('chatEmptyState').style.display = 'flex';
      await loadConversations();
      updateTotalUnreadBadge();
    } else {
      Swal.fire('خطأ', res.error || 'تعذر حذف المحادثة', 'error');
    }
  } catch (err) {
    Swal.fire('خطأ', err.message, 'error');
  }
}

async function deleteConversationItem(phone, name, event) {
  if (event) event.stopPropagation();

  const result = await Swal.fire({
    title: 'حذف المحادثة؟',
    text: `هل تريد حذف محادثة "${name || phone}" نهائياً من السجل؟`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#DC2626',
    cancelButtonColor: '#94A3B8',
    confirmButtonText: 'حذف',
    cancelButtonText: 'إلغاء'
  });

  if (!result.isConfirmed) return;

  try {
    const res = await window.db.deleteWhatsAppConversation(phone);
    if (res.success) {
      if (activePhone && normalize(activePhone) === normalize(phone)) {
        activePhone = null;
        activeName = null;
        document.getElementById('activeChatWrapper').style.display = 'none';
        document.getElementById('chatEmptyState').style.display = 'flex';
      }
      await loadConversations();
      updateTotalUnreadBadge();
    }
  } catch (e) {
    console.error('Delete conversation error:', e);
  }
}

async function deleteSingleMessage(id, event) {
  if (event) event.stopPropagation();

  const result = await Swal.fire({
    title: 'حذف الرسالة؟',
    text: 'هل تريد حذف هذه الرسالة من السجل؟',
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#DC2626',
    cancelButtonColor: '#94A3B8',
    confirmButtonText: 'حذف',
    cancelButtonText: 'إلغاء'
  });

  if (!result.isConfirmed) return;

  try {
    const res = await window.db.deleteWhatsAppMessage(id);
    if (res.success) {
      await loadMessagesForActiveChat();
      await loadConversations();
    }
  } catch (e) {
    console.error('Delete message error:', e);
  }
}

// ─── Customer Invoices Modal ──────────────────────────────────────────────────
async function openCustomerInvoicesModal() {
  if (!activePhone) return;

  document.getElementById('customerInvoicesModal').classList.add('open');
  document.getElementById('chatCustInvoicesModalTitle').textContent = `فواتير ومستحقات العميل: ${activeName || activePhone}`;
  const tbody = document.getElementById('chatCustInvoicesTableBody');
  tbody.innerHTML = '<tr><td colspan="8" class="table-empty">جاري فحص فواتير العميل...</td></tr>';

  try {
    const clean = normalize(activePhone);
    const suffix = clean.length >= 9 ? clean.slice(-9) : clean;

    const custRes = await window.db.queryOne(
      `SELECT * FROM customers 
       WHERE phone = ? OR phone LIKE '%' || ? OR REPLACE(REPLACE(phone, ' ', ''), '+', '') = ? 
       LIMIT 1`,
      [activePhone, suffix, clean]
    );

    if (!custRes || !custRes.success || !custRes.data) {
      document.getElementById('chatCustInvCount').textContent = '0';
      document.getElementById('chatCustInvTotal').textContent = '0.00';
      document.getElementById('chatCustInvPaid').textContent = '0.00';
      document.getElementById('chatCustInvRemaining').textContent = '0.00';
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align:center; padding:35px 20px; color:var(--text-muted);">
            <div style="font-size:15px; font-weight:700; color:var(--text-primary); margin-bottom:8px;">
              رقم الهاتف (${escapeHtml(activePhone)}) غير مسجل كعميل في النظام حتى الآن
            </div>
            <div style="font-size:12px; margin-bottom:16px;">
              يمكنك تسجيله كعميل جديد في إدارة العملاء لربط فواتيره ومقاساته تلقائياً.
            </div>
            <button class="btn btn-primary btn-sm" onclick="goToCustomerPage()">
              تسجيل هذا الرقم كعميل جديد
            </button>
          </td>
        </tr>
      `;
      return;
    }

    const customer = custRes.data;
    const invRes = await window.db.query(
      `SELECT id, invoice_number, invoice_date, net_total, amount_paid, remaining, status 
       FROM invoices 
       WHERE customer_id = ? 
       ORDER BY id DESC`,
      [customer.id]
    );

    const invoices = (invRes && invRes.success && invRes.data) ? invRes.data : [];
    const totalSales = invoices.reduce((sum, inv) => sum + Number(inv.net_total || 0), 0);
    const totalPaid = invoices.reduce((sum, inv) => sum + Number(inv.amount_paid || 0), 0);
    const totalRem = Number(customer.current_balance || invoices.reduce((sum, inv) => sum + Number(inv.remaining || 0), 0));

    document.getElementById('chatCustInvCount').textContent = invoices.length;
    document.getElementById('chatCustInvTotal').textContent = Number(totalSales).toFixed(2);
    document.getElementById('chatCustInvPaid').textContent = Number(totalPaid).toFixed(2);
    document.getElementById('chatCustInvRemaining').textContent = Number(totalRem).toFixed(2);

    if (invoices.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="table-empty">لا توجد فواتير سابقة لهذا العميل</td></tr>';
      return;
    }

    tbody.innerHTML = invoices.map((inv, idx) => `
      <tr>
        <td style="color:var(--text-muted);">${idx + 1}</td>
        <td style="font-weight:700; font-family:monospace;">${escapeHtml(inv.invoice_number || '—')}</td>
        <td style="color:var(--text-muted); font-size:12px;">${escapeHtml(inv.invoice_date || '—')}</td>
        <td style="font-weight:700;">${Number(inv.net_total || 0).toFixed(2)}</td>
        <td style="color:var(--success);">${Number(inv.amount_paid || 0).toFixed(2)}</td>
        <td style="font-weight:700; color:${Number(inv.remaining) > 0 ? 'var(--danger)' : 'var(--primary)'};">${Number(inv.remaining || 0).toFixed(2)}</td>
        <td>
          <span class="badge ${inv.status === 'تم التسليم' ? 'badge-success' : inv.status === 'جاهز' ? 'badge-info' : 'badge-warning'}">
            ${escapeHtml(inv.status || 'تحت الشغل')}
          </span>
        </td>
        <td style="text-align:center;">
          <button class="btn btn-sm btn-outline" onclick="sendInvoiceSummaryToChat('${escapeHtml(inv.invoice_number || '')}', '${Number(inv.net_total || 0).toFixed(2)}', '${Number(inv.amount_paid || 0).toFixed(2)}', '${Number(inv.remaining || 0).toFixed(2)}', '${escapeHtml(inv.status || '')}')" title="تجهيز ملخص الفاتورة لإرساله في الشات">
            إرسال
          </button>
        </td>
      </tr>
    `).join('');

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" class="table-empty" style="color:var(--danger);">خطأ: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function closeChatInvoicesModal() {
  document.getElementById('customerInvoicesModal').classList.remove('open');
}

function goToCustomerPage() {
  closeChatInvoicesModal();
  if (activePhone) {
    sessionStorage.setItem('targetCustomerPhone', activePhone);
  }
  navigate('customers.html');
}

function sendInvoiceSummaryToChat(invNo, total, paid, rem, status) {
  closeChatInvoicesModal();
  const input = document.getElementById('chatInput');
  if (!input) return;

  const text = `تفاصيل فاتورتكم رقم #${invNo}:\n` +
               `• الإجمالي: ${total} ج.م\n` +
               `• المدفوع: ${paid} ج.م\n` +
               `• المتبقي: ${rem} ج.م\n` +
               `• الحالة: ${status}\n` +
               `شكراً لتعاملكم معنا! `;

  input.value = text;
  input.focus();
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 120) + 'px';
}

// ─── Handle Incoming Message Event ────────────────────────────────────────────
async function handleIncomingMessage(msg) {
  playNotificationChime();

  if (activePhone && normalize(activePhone) === normalize(msg.phone)) {
    await loadMessagesForActiveChat();
    await window.db.markWhatsAppConversationAsRead(activePhone);
  }

  await loadConversations();
  updateTotalUnreadBadge();
}

async function updateTotalUnreadBadge() {
  try {
    const res = await window.db.getWhatsAppUnreadTotal();
    const badge = document.getElementById('sidebarWaBadge');
    if (badge && res.success) {
      if (res.total > 0) {
        badge.textContent = res.total;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    }
  } catch (e) {}
}

// ─── Prompt New Chat ──────────────────────────────────────────────────────────
async function promptNewChat() {
  const { value: phone } = await Swal.fire({
    title: 'محادثة واتساب جديدة',
    input: 'text',
    inputLabel: 'أدخل رقم هاتف العميل (مثال: 01012345678):',
    inputPlaceholder: '01xxxxxxxxx',
    showCancelButton: true,
    confirmButtonText: 'فتح المحادثة',
    cancelButtonText: 'إلغاء',
    confirmButtonColor: 'var(--wa-green-dark)',
    inputValidator: (val) => {
      if (!val || val.trim().length < 8) {
        return 'يرجى إدخال رقم هاتف صحيح!';
      }
    }
  });

  if (phone) {
    selectConversation(phone.trim(), phone.trim());
  }
}

// ─── Test Webhook Ping ────────────────────────────────────────────────────────
async function sendTestPing() {
  try {
    const testPhone = activePhone || '201000000000';
    await window.whatsapp.testWebhookPing(testPhone);
    Swal.fire({
      icon: 'success',
      title: 'تم إرسال التجربة!',
      text: 'تم إرسال رسالة تجريبية محاكية وستظهر الآن في قائمة المحادثات ',
      timer: 1800,
      showConfirmButton: false
    });
  } catch (e) {
    Swal.fire({ icon: 'error', title: 'خطأ', text: e.message });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function normalize(p) {
  return String(p || '').replace(/[\s\+\-\(\)]/g, '').slice(-10);
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch {
    return '';
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}