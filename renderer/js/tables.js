'use strict';

let allTables = [];
let currentStatusFilter = 'all';

document.addEventListener('DOMContentLoaded', async () => {
  enforceAdminUI();
  await loadShopName();
  await loadTables();
});

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function loadShopName() {
  try {
    const res = await window.db.getSettings();
    if (res?.success && res.data?.company_name) {
      const el = document.getElementById('sidebarShopName');
      if (el) el.textContent = res.data.company_name;
    }
  } catch (e) {}
}

async function loadTables() {
  try {
    const res = await window.tables.list();
    if (res && res.success) {
      allTables = res.data || [];
      updateSectionFilterOptions();
      updateCounts();
      renderTables();
    } else {
      showToast('خطأ في تحميل الترابيزات: ' + (res?.error || ''), 'error');
    }
  } catch (err) {
    console.error('loadTables error:', err);
    showToast('خطأ أثناء تحميل الترابيزات', 'error');
  }
}

function updateSectionFilterOptions() {
  const select = document.getElementById('sectionFilter');
  if (!select) return;
  const currentVal = select.value;
  const sections = [...new Set(allTables.map(t => t.section).filter(Boolean))];
  
  select.innerHTML = '<option value="">جميع الصالات / الأقسام</option>';
  sections.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    select.appendChild(opt);
  });
  if (currentVal && sections.includes(currentVal)) {
    select.value = currentVal;
  }
}

function updateCounts() {
  const total = allTables.length;
  const empty = allTables.filter(t => t.status === 'فاضية').length;
  const busy = allTables.filter(t => t.status === 'مشغولة').length;
  const reserved = allTables.filter(t => t.status === 'محجوزة').length;

  document.getElementById('countAll').textContent = total;
  document.getElementById('countEmpty').textContent = empty;
  document.getElementById('countBusy').textContent = busy;
  document.getElementById('countReserved').textContent = reserved;
}

function filterStatus(status, element) {
  currentStatusFilter = status;
  document.querySelectorAll('.status-chip').forEach(el => el.classList.remove('active'));
  if (element) element.classList.add('active');
  renderTables();
}

function renderTables() {
  const container = document.getElementById('tablesGrid');
  if (!container) return;

  const section = document.getElementById('sectionFilter')?.value || '';
  const search = document.getElementById('searchTable')?.value.trim().toLowerCase() || '';

  let filtered = allTables.filter(t => {
    if (currentStatusFilter !== 'all' && t.status !== currentStatusFilter) return false;
    if (section && t.section !== section) return false;
    if (search && !t.name.toLowerCase().includes(search)) return false;
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align:center; padding:60px 20px; color:var(--text-muted);">
        <div style="font-size:42px; margin-bottom:12px;">🍽️</div>
        <div style="font-size:16px; font-weight:700;">لا توجد ترابيزات تطابق البحث</div>
        <button class="btn btn-outline btn-sm" style="margin-top:14px;" onclick="openTableModal()">+ إضافة ترابيزة جديدة</button>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(t => {
    const isBusy = t.status === 'مشغولة';
    const isReserved = t.status === 'محجوزة';
    const statusClass = isBusy ? 'status-busy' : (isReserved ? 'status-reserved' : 'status-empty');
    const badgeClass = isBusy ? 'busy' : (isReserved ? 'reserved' : 'empty');
    const badgeText = isBusy ? 'مشغولة' : (isReserved ? 'محجوزة' : 'فاضية');

    let bodyHTML = '';
    if (isBusy) {
      bodyHTML = `
        <div class="order-info-box">
          <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
            <span style="color:var(--text-muted);">فاتورة:</span>
            <strong style="color:var(--danger);">${t.active_invoice_number || '—'}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="color:var(--text-muted);">الحساب الحالي:</span>
            <span class="order-total-price">${fmt(t.active_invoice_total)} <small style="font-size:11px;">ج.م</small></span>
          </div>
          ${t.customer_name ? `<div style="font-size:11px; color:var(--text-muted); margin-top:4px;">العميل: ${t.customer_name}</div>` : ''}
        </div>
      `;
    } else if (isReserved) {
      bodyHTML = `
        <div style="text-align:center; padding:10px 0; color:var(--warning);">
          <div style="font-size:24px; margin-bottom:4px;">⏳</div>
          <div style="font-size:13px; font-weight:800; color:#b45309;">
            ${t.reservation_name ? `حجز: ${escapeHtml(t.reservation_name)}` : 'ترابيزة محجوزة مسبقاً'}
          </div>
          ${t.reservation_time ? `<div style="font-size:11px; color:var(--text-muted); margin-top:2px;">📅 ${escapeHtml(t.reservation_time)}</div>` : ''}
          ${t.reservation_phone ? `<div style="font-size:11px; color:var(--text-muted); margin-top:2px;">📞 ${escapeHtml(t.reservation_phone)}</div>` : ''}
          ${t.reservation_party_size ? `<div style="font-size:11px; color:var(--text-muted); margin-top:2px;">👥 ${t.reservation_party_size} أفراد</div>` : ''}
        </div>
      `;
    } else {
      bodyHTML = `
        <div style="text-align:center; padding:12px 0; color:var(--success);">
          <div style="font-size:28px; margin-bottom:4px;">☕</div>
          <div style="font-size:13px; font-weight:700;">جاهزة لاستقبال الزبائن</div>
        </div>
      `;
    }

    return `
      <div class="table-card ${statusClass}" onclick="handleTableClick(${t.id})">
        <div>
          <div class="table-card-header">
            <div>
              <div class="table-name">${t.name}</div>
              <span class="table-section-tag">${t.section || 'الصالة الرئيسية'}</span>
            </div>
            <span class="table-status-badge ${badgeClass}">${badgeText}</span>
          </div>
          <div class="table-card-body">
            ${bodyHTML}
          </div>
        </div>

        <div class="table-card-footer" onclick="event.stopPropagation();">
          <div class="seats-count">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
            ${t.seats || 4} مقاعد
          </div>
          <div style="display:flex; gap:6px;">
            ${isBusy ? `
              <button class="btn btn-sm btn-primary" onclick="openTableInPOS(${t.id}, ${t.active_invoice_id || 'null'}, '${escapeHtml(t.name)}')">فتح الحساب</button>
            ` : (isReserved ? `
              <button class="btn btn-sm btn-outline" onclick="toggleReservation(${t.id}, 'فاضية')">إلغاء الحجز</button>
              <button class="btn btn-sm btn-success" onclick="openNewOrderForTable(${t.id}, '${escapeHtml(t.name)}')">بدء طلب</button>
            ` : `
              <button class="btn btn-sm btn-outline" onclick="openReserveModal(${t.id}, '${escapeHtml(t.name)}')">حجز</button>
              <button class="btn btn-sm btn-success" onclick="openNewOrderForTable(${t.id}, '${escapeHtml(t.name)}')">+ طلب جديد</button>
            `)}
            <button class="btn btn-sm btn-outline admin-only" onclick="editTable(${JSON.stringify(t).replace(/"/g, '&quot;')})" title="تعديل الترابيزة">✏️</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function handleTableClick(tableId) {
  const table = allTables.find(t => t.id === tableId);
  if (!table) return;

  if (table.status === 'مشغولة' && table.active_invoice_id) {
    openTableInPOS(table.id, table.active_invoice_id, table.name);
  } else {
    openNewOrderForTable(table.id, table.name);
  }
}

function openTableInPOS(tableId, invoiceId, tableName) {
  sessionStorage.setItem('pos_active_table_id', tableId);
  sessionStorage.setItem('pos_active_table_name', tableName);
  if (invoiceId) {
    sessionStorage.setItem('pos_resume_invoice_id', invoiceId);
  } else {
    sessionStorage.removeItem('pos_resume_invoice_id');
  }
  navigate('pos-invoice.html');
}

function openNewOrderForTable(tableId, tableName) {
  sessionStorage.setItem('pos_active_table_id', tableId);
  sessionStorage.setItem('pos_active_table_name', tableName);
  sessionStorage.removeItem('pos_resume_invoice_id');
  navigate('pos-invoice.html');
}

let allReservationCustomers = [];

async function loadReservationCustomers(mode = 'tables') {
  try {
    const res = await window.db.query('SELECT id, name, phone FROM customers WHERE phone IS NOT NULL AND phone != "" ORDER BY name ASC', []);
    allReservationCustomers = res?.success && res.data ? res.data : [];
    
    const nameListEl = document.getElementById('tableReservationCustomersList');
    const phoneListEl = document.getElementById('tableReservationPhonesList');

    if (nameListEl) {
      nameListEl.innerHTML = allReservationCustomers
        .filter(c => c.name)
        .map(c => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.phone || '')}</option>`)
        .join('');
    }
    if (phoneListEl) {
      phoneListEl.innerHTML = allReservationCustomers
        .filter(c => c.phone)
        .map(c => `<option value="${escapeHtml(c.phone)}">${escapeHtml(c.name || '')}</option>`)
        .join('');
    }
  } catch (e) {
    console.warn('Failed to load reservation customers:', e);
  }
}

function onReservationCustomerNameInput(val, mode = 'tables') {
  const match = allReservationCustomers.find(c => c.name && c.name.trim().toLowerCase() === val.trim().toLowerCase());
  if (match && match.phone) {
    const phoneInput = document.getElementById('reserveCustomerPhone');
    if (phoneInput) phoneInput.value = match.phone;
  }
}

function onReservationCustomerPhoneInput(val, mode = 'tables') {
  const match = allReservationCustomers.find(c => c.phone && c.phone.trim() === val.trim());
  if (match && match.name) {
    const nameInput = document.getElementById('reserveCustomerName');
    if (nameInput) nameInput.value = match.name;
  }
}

function openReserveModal(tableId, tableName) {
  document.getElementById('reserveTableId').value = tableId;
  document.getElementById('reserveTableName').value = tableName;
  document.getElementById('reserveModalTitle').textContent = `حجز ${tableName}`;
  document.getElementById('reserveCustomerName').value = '';
  document.getElementById('reserveCustomerPhone').value = '';
  document.getElementById('reservePartySize').value = '2';
  
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  document.getElementById('reserveTime').value = now.toISOString().slice(0, 16);

  loadReservationCustomers('tables');
  openModal('reserveTableModal');
  setTimeout(() => document.getElementById('reserveCustomerName').focus(), 150);
}

async function confirmReserveTable() {
  const tableId = parseInt(document.getElementById('reserveTableId').value);
  const tableName = document.getElementById('reserveTableName').value;
  const name = document.getElementById('reserveCustomerName').value.trim();
  const phone = document.getElementById('reserveCustomerPhone').value.trim();
  const time = document.getElementById('reserveTime').value;
  const partySize = parseInt(document.getElementById('reservePartySize').value) || null;

  if (!name || !phone) {
    showToast('يرجى إدخال اسم العميل ورقم الهاتف/الواتساب', 'warning');
    return;
  }

  try {
    const res = await window.tables.reserve({
      tableId,
      name,
      phone,
      time: time ? time.replace('T', ' ') : null,
      partySize
    });

    if (res?.success) {
      closeModal('reserveTableModal');
      showToast(`تم حجز ${tableName} بنجاح للعميل ${name}`, 'success');
      await loadTables();

      // Send WhatsApp confirmation
      try {
        const setRes = await window.db.getSettings();
        const shopName = setRes?.data?.company_name || 'CafePro';
        const formattedTime = time ? time.replace('T', ' ') : '';
        const msg = `أهلاً ${name} 🌸\nتم تأكيد حجز ${tableName} في ${shopName}${formattedTime ? ` يوم/موعد: ${formattedTime}` : ''}${partySize ? ` لعدد: ${partySize} أفراد` : ''}.\nبانتظاركم بكل سرور ☕`;
        
        const waRes = await window.whatsapp.send(phone, msg);
        if (waRes?.success) {
          showToast('تم إرسال رسالة تأكيد الحجز عبر الواتساب ✓', 'success');
        } else {
          console.warn('Auto WhatsApp notice:', waRes?.error);
        }
      } catch (waErr) {
        console.warn('Auto WhatsApp confirmation notice:', waErr);
      }
    } else {
      showToast('فشل تسجيل الحجز: ' + (res?.error || ''), 'error');
    }
  } catch (err) {
    showToast('حدث خطأ أثناء الحجز: ' + err.message, 'error');
  }
}

async function toggleReservation(tableId, newStatus) {
  try {
    const res = await window.tables.updateStatus(tableId, newStatus);
    if (res?.success) {
      showToast(newStatus === 'محجوزة' ? 'تم حجز الترابيزة' : 'أصبحت الترابيزة فاضية ومتاحة', 'success');
      await loadTables();
    }
  } catch (e) {
    showToast('حدث خطأ أثناء تعديل حالة الحجز', 'error');
  }
}

function openTableModal(isEdit = false) {
  document.getElementById('editTableId').value = '';
  document.getElementById('tableNameInput').value = '';
  document.getElementById('tableSectionInput').value = '';
  document.getElementById('tableSeatsInput').value = '4';
  document.getElementById('tableModalTitle').textContent = 'إضافة ترابيزة جديدة';
  document.getElementById('deleteTableBtn').style.display = 'none';
  openModal('tableModal');
}

function editTable(table) {
  document.getElementById('editTableId').value = table.id;
  document.getElementById('tableNameInput').value = table.name;
  document.getElementById('tableSectionInput').value = table.section || '';
  document.getElementById('tableSeatsInput').value = table.seats || 4;
  document.getElementById('tableModalTitle').textContent = `تعديل ${table.name}`;
  document.getElementById('deleteTableBtn').style.display = 'inline-block';
  openModal('tableModal');
}

async function saveTable() {
  const name = document.getElementById('tableNameInput').value.trim();
  const section = document.getElementById('tableSectionInput').value.trim();
  const seats = parseInt(document.getElementById('tableSeatsInput').value) || 4;
  const id = document.getElementById('editTableId').value;

  if (!name) {
    showToast('يرجى إدخال اسم أو رقم الترابيزة', 'warning');
    return;
  }

  try {
    const res = await window.tables.save({
      id: id ? parseInt(id) : null,
      name,
      section,
      seats
    });

    if (res?.success) {
      closeModal('tableModal');
      showToast('تم حفظ بيانات الترابيزة بنجاح ✓', 'success');
      await loadTables();
    } else {
      showToast('خطأ: ' + (res?.error || ''), 'error');
    }
  } catch (e) {
    showToast('فشل حفظ الترابيزة', 'error');
  }
}

async function deleteCurrentTable() {
  const id = document.getElementById('editTableId').value;
  if (!id) return;

  const result = await Swal.fire({
    title: 'تأكيد الحذف',
    text: 'هل أنت متأكد من حذف هذه الترابيزة؟',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'نعم، حذف',
    cancelButtonText: 'إلغاء',
    confirmButtonColor: '#DC2626'
  });

  if (result.isConfirmed) {
    const res = await window.tables.delete(parseInt(id));
    if (res?.success) {
      closeModal('tableModal');
      showToast('تم حذف الترابيزة', 'success');
      await loadTables();
    } else {
      showToast('خطأ: ' + (res?.error || ''), 'error');
    }
  }
}

function openTransferModal() {
  const busyTables = allTables.filter(t => t.status === 'مشغولة' && t.active_invoice_id);
  const emptyTables = allTables.filter(t => t.status === 'فاضية');

  const fromSel = document.getElementById('transferFromSelect');
  const toSel = document.getElementById('transferToSelect');

  if (busyTables.length === 0) {
    showToast('لا توجد ترابيزات مشغولة حالياً لتحويلها', 'info');
    return;
  }
  if (emptyTables.length === 0) {
    showToast('لا توجد ترابيزات فاضية لنقل الطلب إليها', 'warning');
    return;
  }

  fromSel.innerHTML = busyTables.map(t => `<option value="${t.id}">${t.name} (${t.section || 'صالة'}) — فاتورة: ${t.active_invoice_number || ''} (${fmt(t.active_invoice_total)} ج)</option>`).join('');
  toSel.innerHTML = emptyTables.map(t => `<option value="${t.id}">${t.name} (${t.section || 'صالة'})</option>`).join('');

  openModal('transferModal');
}

async function confirmTransfer() {
  const fromId = parseInt(document.getElementById('transferFromSelect').value);
  const toId = parseInt(document.getElementById('transferToSelect').value);

  if (!fromId || !toId || fromId === toId) {
    showToast('يرجى اختيار ترابيزتين مختلفتين', 'warning');
    return;
  }

  try {
    const res = await window.tables.transfer(fromId, toId);
    if (res?.success) {
      closeModal('transferModal');
      showToast('تم تحويل الطلب بنجاح ✓', 'success');
      await loadTables();
    } else {
      showToast('خطأ أثناء التحويل: ' + (res?.error || ''), 'error');
    }
  } catch (e) {
    showToast('حدث خطأ أثناء تحويل الطلب', 'error');
  }
}

function openMergeModal() {
  const busyTables = allTables.filter(t => t.status === 'مشغولة' && t.active_invoice_id);

  if (busyTables.length < 2) {
    showToast('يتطلب الدمج وجود ترابيزتين مشغولتين على الأقل ولديهما طلبات نشطة', 'warning');
    return;
  }

  const fromSel = document.getElementById('mergeFromSelect');
  const toSel = document.getElementById('mergeToSelect');

  fromSel.innerHTML = busyTables.map(t => `<option value="${t.id}">${t.name} (${t.section || 'صالة'}) — فاتورة: ${t.active_invoice_number || ''} (${fmt(t.active_invoice_total)} ج)</option>`).join('');
  toSel.innerHTML = busyTables.map(t => `<option value="${t.id}">${t.name} (${t.section || 'صالة'}) — فاتورة: ${t.active_invoice_number || ''} (${fmt(t.active_invoice_total)} ج)</option>`).join('');

  if (toSel.options.length > 1) {
    toSel.selectedIndex = 1;
  }

  openModal('mergeTablesModal');
}

async function confirmMergeTables() {
  const fromId = parseInt(document.getElementById('mergeFromSelect').value);
  const toId = parseInt(document.getElementById('mergeToSelect').value);

  if (!fromId || !toId || fromId === toId) {
    showToast('يرجى اختيار ترابيزتين مختلفتين للدمج', 'warning');
    return;
  }

  const fromTable = allTables.find(t => t.id === fromId);
  const toTable = allTables.find(t => t.id === toId);

  const ask = await Swal.fire({
    title: 'تأكيد دمج الترابيزتين؟',
    html: `
      <div style="font-size:14px; line-height:1.6; text-align:right;">
        هل أنت متأكد من دمج طلب <b>${fromTable?.name}</b> في طلب <b>${toTable?.name}</b>؟<br/>
        <span style="color:#dc2626; font-size:12px;">⚠️ سيتم نقل كل الأصناف إلى فاتورة ${toTable?.name}، وتصبح ${fromTable?.name} فاضية فوراً.</span>
      </div>
    `,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'نعم، ادمج الطلبين',
    cancelButtonText: 'إلغاء',
    confirmButtonColor: '#b45309'
  });

  if (!ask.isConfirmed) return;

  try {
    const res = await window.tables.merge(fromId, toId);
    if (res?.success) {
      closeModal('mergeTablesModal');
      showToast(`تم دمج الطلبين بنجاح! الإجمالي الجديد: ${fmt(res.data?.newNetTotal || 0)} ج.م ✓`, 'success');
      await loadTables();
    } else {
      showToast('خطأ أثناء الدمج: ' + (res?.error || ''), 'error');
    }
  } catch (e) {
    showToast('حدث خطأ أثناء دمج الترابيزات: ' + e.message, 'error');
  }
}
