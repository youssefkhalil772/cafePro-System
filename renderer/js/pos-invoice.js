let posAllInvoices = [];

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderPosHistory(invoices) {
  const tbody = document.getElementById('historyTableBody');
  if (!invoices || invoices.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="padding:20px; text-align:center; color:var(--text-muted);">لا توجد فواتير مطابقة</td></tr>';
  } else {
    tbody.innerHTML = invoices.map(inv => {
      const st = inv.status || 'مدفوعة';
      let badgeBg = '#d1fae5';
      let badgeColor = '#065f46';
      if (st === 'مفتوحة') { badgeBg = '#fef3c7'; badgeColor = '#92400e'; }
      else if (st === 'مرسلة للمطبخ') { badgeBg = '#ffedd5'; badgeColor = '#c2410c'; }
      else if (st === 'ملغاة') { badgeBg = '#fee2e2'; badgeColor = '#991b1b'; }

      return `
        <tr data-id="${inv.id}" data-invnum="${(inv.invoice_number||'').toLowerCase()}" data-custname="${(inv.customer_name||'').toLowerCase()}" data-custphone="${(inv.customer_phone||'').toLowerCase()}" style="border-bottom:1px solid var(--border);">
          <td style="padding:10px; font-weight:bold; color:var(--primary);">${escapeHtml(inv.invoice_number)}</td>
          <td style="padding:10px;">
            <div style="font-weight:700;">${escapeHtml(inv.customer_name || 'عميل نقدي')}</div>
            <div style="font-size:11px; color:var(--text-muted);">${escapeHtml(inv.invoice_type || 'طلب')} ${inv.table_id ? `(ترابيزة ${inv.table_id})` : ''}</div>
          </td>
          <td style="padding:10px; font-weight:800; color:var(--success); text-align:right;">${fmt(inv.dynamic_net_total)} ج.م</td>
          <td style="padding:10px; font-size:12px; color:var(--text-muted);">${escapeHtml(inv.invoice_date)}</td>
          <td style="padding:10px; text-align:center;">
            <span style="font-size:11px; font-weight:800; padding:3px 8px; border-radius:12px; background:${badgeBg}; color:${badgeColor};">${st}</span>
          </td>
          <td style="padding:10px; text-align:center;">
            <button class="btn btn-sm btn-primary" style="padding:3px 12px; font-size:11px; font-weight:800;" onclick="viewPastInvoice(${inv.id})">👁️ عرض</button>
          </td>
        </tr>
      `;
    }).join('');
  }
}

let _currentViewingInvoice = null;
let _currentViewingItems = [];

async function viewPastInvoice(invId) {
  try {
    const invRes = await window.db.queryOne('SELECT i.*, c.name as customer_name, c.phone as customer_phone FROM invoices i LEFT JOIN customers c ON i.customer_id = c.id WHERE i.id = ?', [invId]);
    if (!invRes.success || !invRes.data) {
      showToast('تعذر العثور على بيانات الفاتورة', 'error');
      return;
    }
    const inv = invRes.data;
    _currentViewingInvoice = inv;

    const itemsRes = await window.db.query('SELECT * FROM invoice_items WHERE invoice_id = ?', [invId]);
    const items = itemsRes.success ? itemsRes.data : [];
    _currentViewingItems = items;

    // Populate modal
    const numEl = document.getElementById('posViewInvoiceNumber');
    if (numEl) numEl.textContent = `فاتورة رقم #${inv.invoice_number}`;

    const subEl = document.getElementById('posViewInvoiceSubtitle');
    if (subEl) subEl.textContent = `طريقة الدفع: ${inv.payment_method || 'نقدي'} | الكاشير: ${inv.emp_name || 'غير محدد'}`;

    const custEl = document.getElementById('posViewCustomerInfo');
    if (custEl) custEl.textContent = `${inv.customer_name || 'عميل نقدي'}${inv.customer_phone ? ' (' + inv.customer_phone + ')' : ''}`;

    const dateEl = document.getElementById('posViewDateInfo');
    if (dateEl) dateEl.textContent = `${inv.invoice_date || ''} ${inv.created_at ? new Date(inv.created_at).toLocaleTimeString('ar-EG-u-nu-latn', {hour:'2-digit', minute:'2-digit'}) : ''}`;

    const ordEl = document.getElementById('posViewOrderTypeInfo');
    let ordText = inv.invoice_type || 'طلب';
    if (inv.table_id) ordText += ` (ترابيزة ${inv.table_id})`;
    if (ordEl) ordEl.textContent = ordText;

    const stSelect = document.getElementById('posViewStatusSelect');
    if (stSelect) stSelect.value = inv.status || 'مدفوعة';

    // Populate items
    const tbody = document.getElementById('posViewItemsTbody');
    if (tbody) {
      tbody.innerHTML = items.map(it => `
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:6px 8px; font-weight:700;">
            ${escapeHtml(it.service_name)}${it.size_name ? ` <span style="font-size:10px; color:#2563eb; background:#eff6ff; padding:1px 5px; border-radius:6px;">${escapeHtml(it.size_name)}</span>` : ''}
          </td>
          <td style="padding:6px 8px; text-align:center; font-weight:800;">${it.quantity}</td>
          <td style="padding:6px 8px; text-align:center;">${fmt(it.sell_price !== undefined ? it.sell_price : (it.unit_price || 0))}</td>
          <td style="padding:6px 8px; text-align:center; color:#dc2626;">${fmt(it.item_discount || it.discount || 0)}</td>
          <td style="padding:6px 8px; text-align:right; font-weight:800; color:var(--primary);">${fmt(it.total)}</td>
          <td style="padding:6px 8px; font-size:11px; color:var(--text-muted);">${escapeHtml(it.notes || '—')}</td>
        </tr>
      `).join('');
    }

    // Totals
    const vSub = document.getElementById('posViewSubtotal');
    const vSvc = document.getElementById('posViewService');
    const vTax = document.getElementById('posViewTax');
    const vDisc = document.getElementById('posViewDiscount');
    const vNet = document.getElementById('posViewNetTotal');
    const vPaid = document.getElementById('posViewPaid');
    const vRem = document.getElementById('posViewRemaining');

    if (vSub) vSub.textContent = fmt(inv.subtotal || 0) + ' ج.م';
    if (vSvc) vSvc.textContent = fmt(inv.service_amount || 0) + ' ج.م';
    if (vTax) vTax.textContent = fmt(inv.tax_amount || 0) + ' ج.م';
    if (vDisc) vDisc.textContent = fmt(inv.discount_amount || 0) + ' ج.م';
    if (vNet) vNet.textContent = fmt(inv.net_total || 0) + ' ج.م';
    if (vPaid) vPaid.textContent = fmt(inv.amount_paid || 0) + ' ج.م';
    if (vRem) vRem.textContent = fmt(inv.remaining || 0) + ' ج.م';

    openModal('posInvoiceViewModal');
  } catch (err) {
    showToast('خطأ أثناء عرض الفاتورة: ' + err.message, 'error');
  }
}

async function updateInvoiceStatusFromPosView() {
  if (!_currentViewingInvoice) return;
  const newStatus = document.getElementById('posViewStatusSelect')?.value;
  if (!newStatus) return;

  try {
    const res = await window.db.updateInvoiceStatus(_currentViewingInvoice.id, newStatus);
    if (res && res.success) {
      _currentViewingInvoice.status = newStatus;
      showToast(`تم تحديث حالة الفاتورة #${_currentViewingInvoice.invoice_number} إلى "${newStatus}" بنجاح ✓`, 'success');
      const match = posAllInvoices.find(x => x.id === _currentViewingInvoice.id);
      if (match) match.status = newStatus;
      filterPosHistory();
    } else {
      showToast('فشل تحديث الحالة: ' + (res?.error || ''), 'error');
    }
  } catch (e) {
    showToast('خطأ: ' + e.message, 'error');
  }
}

async function printInvoiceFromPosView() {
  if (!_currentViewingInvoice) return;
  lastSavedInvoice = {
    ..._currentViewingInvoice,
    items: _currentViewingItems
  };
  printReceipt(false);
}

async function sendWhatsAppFromPosView() {
  if (!_currentViewingInvoice) return;
  const phone = _currentViewingInvoice.customer_phone;
  if (!phone) {
    showToast('العميل ليس لديه رقم هاتف مسجل', 'warning');
    return;
  }
  await sendWhatsAppFromHistory(_currentViewingInvoice);
}

// debounce لتأخير البحث حتى لا يعلق الجهاز بكل ضغطة
let _filterTimer = null;
function filterPosHistory() {
  clearTimeout(_filterTimer);
  _filterTimer = setTimeout(_doFilter, 300);
}
function _doFilter() {
  const query    = (document.getElementById('posHistorySearch').value || '').toLowerCase();
  const phone    = (document.getElementById('posHistoryPhone').value || '').toLowerCase();

  if (!query && !phone) {
    renderPosHistory(posAllInvoices.slice(0, 30));
    return;
  }

  const filtered = posAllInvoices.filter(inv => {
    const invNum           = (inv.invoice_number || '').toLowerCase();
    const custName         = (inv.customer_name  || '').toLowerCase();
    const custPhone        = (inv.customer_phone || '').toLowerCase();
    const dynamicNetTotal  = (inv.dynamic_net_total || 0).toString();

    const matchQuery  = !query || invNum.includes(query) || custName.includes(query) || dynamicNetTotal.includes(query);
    const matchPhone  = !phone || custPhone.includes(phone);
    return matchQuery && matchPhone;
  });

  renderPosHistory(filtered);
}



// ─── State ────────────────────────────────────────────────────────────────────
let invoiceItems = [];
let categories = [];
let allServices = [];
let allServiceSizes = [];
let currentInvoiceNumber = '';
let lastSavedInvoice = null;
let sessionRole = null;
let settings = { company_name: 'CafePro System', currency: 'جنيه', receipt_footer: 'شكراً لزيارتكم' };
let currentOrderType = 'صالة'; // 'صالة' | 'تيك أواي' | 'دليفري'
let currentTableId = null;
let currentInvoiceId = null;
let allTables = [];
let allDeliveryDrivers = [];

// ─── Init ─────────────────────────────────────────────────────────────────────────────
async function init() {
  sessionRole = sessionStorage.getItem('photoStudio_role');
  
  // Date default
  const dateEl = document.getElementById('invoiceDate');
  if (dateEl) dateEl.value = getLocalISODate();

  // جلب جميع البيانات بشكل متوازٍ (Promise.all) لتسريع التحميل
  const [
    invRes,
    setRes,
    catRes,
    srvRes,
    custRes,
    empRes,
    sizesRes,
  ] = await Promise.all([
    window.db.generateInvoiceNumber(),
    window.db.getSettings(),
    window.db.query('SELECT * FROM service_categories ORDER BY id', []),
    window.db.query('SELECT s.*, sc.name as cat_name FROM services s LEFT JOIN service_categories sc ON s.category_id=sc.id ORDER BY s.name', []),
    window.db.query('SELECT id,name,phone FROM customers ORDER BY name', []),
    window.db.query('SELECT id,name FROM employees WHERE is_active=1 ORDER BY name', []),
    window.services?.getAllSizes ? window.services.getAllSizes() : Promise.resolve({ success: true, data: [] }),
  ]);

  if (sizesRes && sizesRes.success) {
    allServiceSizes = sizesRes.data || [];
  }

  // Invoice number
  if (invRes.success) { currentInvoiceNumber = invRes.data; document.getElementById('invoiceNumberDisplay').textContent = invRes.data; }

  // Settings
  if (setRes.success && setRes.data) {
    settings = {...settings, ...setRes.data};
    if (settings.logo_path) {
      const safeLogo = 'file:///' + settings.logo_path.replace(/\\/g, '/');
      const iconEl = document.getElementById('posLogoIcon');
      if (iconEl) iconEl.innerHTML = `<img src="${safeLogo}" style="width:100%;height:100%;object-fit:contain;border-radius:12px;" />`;
    }
    const titleEl = document.querySelector('#posLogoContainer .logo-text');
    if (titleEl && settings.company_name) {
      titleEl.textContent = settings.company_name;
    }

    // Toggle delivery controls
    const delBtn = document.getElementById('typeDeliveryBtn');
    const actDelBtn = document.getElementById('btnActiveDelivery');
    if (delBtn) delBtn.style.display = settings.delivery_enabled ? 'flex' : 'none';
    if (actDelBtn) actDelBtn.style.display = settings.delivery_enabled ? 'inline-block' : 'none';

    if (sessionRole === 'cashier') {
      if (Number(settings.prevent_cashier_price_edit) === 1) {
        const pEl = document.getElementById('itemPrice');
        if (pEl) pEl.disabled = true;
      }
      if (Number(settings.cashier_prevent_discount) === 1) {
        const dPct = document.getElementById('discountPercent');
        const dAmt = document.getElementById('discountAmount');
        const dItm = document.getElementById('itemDiscount');
        if (dPct) dPct.disabled = true;
        if (dAmt) dAmt.disabled = true;
        if (dItm) dItm.disabled = true;
      }
      if (Number(settings.cashier_lock_to_pos) === 1) {
        const backBtn = document.getElementById('btnPosBackOrLogout');
        if (backBtn) {
          backBtn.innerHTML = '🚪 تسجيل خروج';
          backBtn.style.color = '#fca5a5';
          backBtn.style.borderColor = 'rgba(239, 68, 68, 0.4)';
          backBtn.style.background = 'rgba(239, 68, 68, 0.1)';
          backBtn.title = 'تسجيل الخروج من البرنامج';
        }
      }
    }
  }

  // Categories
  if (catRes.success) { categories = catRes.data; renderCategoryBtns(); populateCategorySelect(); }

  // Make categories scrollable with mouse wheel
  const catListElem = document.getElementById('categoryBtns');
  if (catListElem) {
    catListElem.addEventListener('wheel', (e) => {
      if (e.deltaY !== 0) { e.preventDefault(); catListElem.scrollLeft += e.deltaY; }
    });
  }

  // Services
  if (srvRes.success) {
    allServices = srvRes.data;
    populateServiceSelect(allServices);
    renderServiceGrid(allServices);
  }

  // Customers
  const cList = document.getElementById('customersList');
  if (custRes.success) {
    window.allCustomers = custRes.data;
    let custHtml = '';
    custRes.data.forEach(c => {
      custHtml += `<option value="${c.name} - ${c.phone||""}" data-id="${c.id}" data-phone="${c.phone||""}"></option>`;
    });
    if (cList) cList.innerHTML = custHtml;
  }

  // Employees
  const empSel  = document.getElementById('employeeSelect');
  if (empRes.success) {
    window.allEmployees = empRes.data;
    let empHtml = '<option value="">اختر الكاشير/البائع</option>';
    empRes.data.forEach(e => {
      empHtml += `<option value="${e.id}">${e.name}</option>`;
    });
    if (empSel) empSel.innerHTML = empHtml;
  } else {
    if (empSel) empSel.innerHTML = '<option value="">اختر الكاشير/البائع</option>';
  }

  // Auto-select current employee as cashier
  const empIdSession = sessionStorage.getItem('photoStudio_employeeId');
  if (empIdSession && empSel && empSel.querySelector(`option[value="${empIdSession}"]`)) {
    empSel.value = empIdSession;
  }


  // Load Tables & Drivers & Reservation Autocomplete
  await loadTables();
  await loadDeliveryDrivers();
  loadReservationCustomersInPOS();

  // Check if opened from tables.html
  const activeTableId = sessionStorage.getItem('pos_active_table_id');
  const resumeInvoiceId = sessionStorage.getItem('pos_resume_invoice_id');
  sessionStorage.removeItem('pos_active_table_id');
  sessionStorage.removeItem('pos_resume_invoice_id');

  if (activeTableId) {
    setOrderType('صالة');
    const tblSel = document.getElementById('posTableSelect');
    if (tblSel) tblSel.value = activeTableId;
    currentTableId = parseInt(activeTableId);
    await onTableSelectChange();
  } else if (resumeInvoiceId) {
    await resumeInvoiceById(parseInt(resumeInvoiceId));
  } else {
    // Open mandatory Order Type Gate Modal
    openOrderTypeGateModal();
  }
}

// ─── Mandatory Order Type Gate Modal ──────────────────────────────────────────
function openOrderTypeGateModal() {
  const gateDel = document.getElementById('gateDeliveryBtn');
  if (gateDel) {
    gateDel.style.display = settings.delivery_enabled ? 'block' : 'none';
  }
  const modal = document.getElementById('orderTypeGateModal');
  if (modal) modal.classList.add('open');
}

function closeOrderTypeGateModal() {
  const modal = document.getElementById('orderTypeGateModal');
  if (modal) modal.classList.remove('open');
}

async function selectOrderTypeFromGate(type) {
  closeOrderTypeGateModal();
  if (type === 'صالة') {
    setOrderType('صالة');
    await openTablePickerModal();
  } else {
    setOrderType(type);
  }
}

// ─── Visual Table Picker Modal ───────────────────────────────────────────────
let pickerCurrentFilter = 'all';

async function openTablePickerModal() {
  await loadTables();
  updatePickerCounts();
  renderTablePickerGrid();
  const modal = document.getElementById('posTablePickerModal');
  if (modal) modal.classList.add('open');
}

function updatePickerCounts() {
  const total = allTables.length;
  const empty = allTables.filter(t => t.status === 'فاضية').length;
  const busy = allTables.filter(t => t.status === 'مشغولة').length;
  const reserved = allTables.filter(t => t.status === 'محجوزة').length;

  const cAll = document.getElementById('pickerCountAll');
  const cEmpty = document.getElementById('pickerCountEmpty');
  const cBusy = document.getElementById('pickerCountBusy');
  const cRes = document.getElementById('pickerCountReserved');
  if (cAll) cAll.textContent = total;
  if (cEmpty) cEmpty.textContent = empty;
  if (cBusy) cBusy.textContent = busy;
  if (cRes) cRes.textContent = reserved;
}

function filterTablePicker(status, btn) {
  pickerCurrentFilter = status;
  document.querySelectorAll('.table-filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderTablePickerGrid();
}

function renderTablePickerGrid() {
  const container = document.getElementById('posTablePickerGrid');
  if (!container) return;

  const search = (document.getElementById('pickerSearchTable')?.value || '').trim().toLowerCase();

  let filtered = allTables.filter(t => {
    if (pickerCurrentFilter !== 'all' && t.status !== pickerCurrentFilter) return false;
    if (search && !t.name.toLowerCase().includes(search) && !(t.section || '').toLowerCase().includes(search)) return false;
    return true;
  });

  if (!filtered.length) {
    container.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--text-muted); font-size:14px; font-weight:700;">لا توجد ترابيزات مطابقة</div>';
    return;
  }

  container.innerHTML = filtered.map(t => {
    const isBusy = t.status === 'مشغولة';
    const isReserved = t.status === 'محجوزة';
    const statusClass = isBusy ? 'status-busy' : (isReserved ? 'status-reserved' : 'status-empty');
    const badgeColor = isBusy ? '#dc2626' : (isReserved ? '#d97706' : '#059669');
    const badgeBg = isBusy ? '#fee2e2' : (isReserved ? '#fef3c7' : '#d1fae5');
    const badgeText = isBusy ? 'مشغولة' : (isReserved ? 'محجوزة' : 'فاضية');

    let extraInfo = '';
    if (isBusy) {
      extraInfo = `
        <div style="font-size:11px; margin-top:6px; background:rgba(220,38,38,0.08); padding:5px 8px; border-radius:6px;">
          <div style="font-weight:700; color:#dc2626;">فاتورة: ${escapeHtml(t.active_invoice_number || 'مفتوحة')}</div>
          <div style="font-weight:900; color:#991b1b; font-size:12px; margin-top:2px;">${fmt(t.active_invoice_total || 0)} ج.م</div>
        </div>
      `;
    } else if (isReserved) {
      extraInfo = `
        <div style="font-size:11px; margin-top:6px; color:#b45309; background:rgba(217,119,6,0.08); padding:5px 8px; border-radius:6px;">
          <div style="font-weight:800;">محجوزة: ${escapeHtml(t.reservation_name || 'مسبقاً')} (${escapeHtml(t.reservation_phone || '')})</div>
          ${t.reservation_time ? `<div style="font-size:10px; margin-top:2px;">⏰ ${escapeHtml(t.reservation_time)} | 👥 ${t.reservation_party_size || 2} أفراد</div>` : ''}
          <div style="display:flex; gap:6px; margin-top:6px;">
            <button class="btn btn-sm btn-success" style="padding:2px 8px; font-size:10px; font-weight:700;" onclick="selectTableFromPicker(${t.id}); event.stopPropagation();">بدء الطلب للعميل</button>
            <button class="btn btn-sm btn-outline" style="padding:2px 6px; font-size:10px; color:#dc2626;" onclick="cancelTableReservationFromPOS(${t.id}, event)">إلغاء الحجز</button>
          </div>
        </div>
      `;
    } else {
      extraInfo = `
        <div style="font-size:11px; margin-top:8px; display:flex; justify-content:space-between; align-items:center;">
          <span style="color:#059669; font-weight:700;">جاهزة لطلب جديد ✓</span>
          <button class="btn btn-sm btn-outline" style="padding:2px 8px; font-size:10px; font-weight:700; color:#b45309; border-color:#fcd34d; background:#fffbeb;" onclick="openReserveModalFromPOS(${t.id}, '${escapeHtml(t.name)}', event)" title="حجز هذه الترابيزة">📅 حجز</button>
        </div>
      `;
    }

    return `
      <div class="table-picker-card ${statusClass}" onclick="selectTableFromPicker(${t.id})">
        <div style="display:flex; justify-content:space-between; align-items:start;">
          <div>
            <div style="font-weight:900; font-size:15px; color:var(--text);">${escapeHtml(t.name)}</div>
            <div style="font-size:11px; color:var(--text-muted);">${escapeHtml(t.section || 'الصالة')}</div>
          </div>
          <span style="font-size:11px; font-weight:800; padding:2px 8px; border-radius:12px; background:${badgeBg}; color:${badgeColor};">
            ${badgeText}
          </span>
        </div>
        ${extraInfo}
        <div style="font-size:11px; color:var(--text-muted); display:flex; justify-content:space-between; align-items:center; margin-top:8px; border-top:1px dashed var(--border); padding-top:6px;">
          <span>👥 ${t.seats || 4} مقاعد</span>
          <span style="color:var(--primary); font-weight:800; font-size:12px;">اختيار ↵</span>
        </div>
      </div>
    `;
  }).join('');
}

async function selectTableFromPicker(tableId) {
  closeModal('posTablePickerModal');
  const tblSel = document.getElementById('posTableSelect');
  if (tblSel) tblSel.value = tableId;
  await onTableSelectChange();
}

// ─── Table Reservation From POS ───────────────────────────────────────────────
async function openReserveModalFromPOS(tableId = null, tableName = '', e = null) {
  if (e) e.stopPropagation();
  await loadTables();

  const sel = document.getElementById('posReserveTableSelect');
  if (sel) {
    sel.innerHTML = '<option value="">اختر ترابيزة</option>' +
      allTables.map(t => `<option value="${t.id}" ${t.status === 'فاضية' ? 'style="color:#059669; font-weight:700;"' : ''}>${t.name} (${t.status})</option>`).join('');
    if (tableId) sel.value = tableId;
    else if (currentTableId) sel.value = currentTableId;
  }

  document.getElementById('posReserveCustomerName').value = '';
  document.getElementById('posReserveCustomerPhone').value = '';
  document.getElementById('posReservePartySize').value = '2';

  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  document.getElementById('posReserveTime').value = now.toISOString().slice(0, 16);

  openModal('posReserveTableModal');
  setTimeout(() => document.getElementById('posReserveCustomerName')?.focus(), 150);
}

async function confirmReserveTableFromPOS() {
  const tableId = parseInt(document.getElementById('posReserveTableSelect')?.value);
  const name = document.getElementById('posReserveCustomerName')?.value.trim();
  const phone = document.getElementById('posReserveCustomerPhone')?.value.trim();
  const time = document.getElementById('posReserveTime')?.value;
  const partySize = parseInt(document.getElementById('posReservePartySize')?.value) || 2;

  if (!tableId) {
    showToast('يرجى اختيار الترابيزة المراد حجزها', 'warning');
    return;
  }
  if (!name || !phone) {
    showToast('يرجى إدخال اسم العميل ورقم هاتفه', 'warning');
    return;
  }

  const table = allTables.find(t => t.id === tableId);
  const tableName = table ? table.name : `ترابيزة ${tableId}`;

  try {
    const res = await window.tables.reserve({
      tableId,
      name,
      phone,
      time: time ? time.replace('T', ' ') : null,
      partySize
    });

    if (res?.success) {
      closeModal('posReserveTableModal');
      showToast(`تم تسجيل حجز ${tableName} للعميل ${name} بنجاح ✓`, 'success');
      await loadTables();
      updatePickerCounts();
      renderTablePickerGrid();

      // Send WhatsApp confirmation
      try {
        const setRes = await window.db.getSettings();
        const shopName = setRes?.data?.company_name || 'CafePro';
        const formattedTime = time ? time.replace('T', ' ') : '';
        const msg = `أهلاً ${name} 🌸\nتم تأكيد حجز ${tableName} في ${shopName}${formattedTime ? ` يوم/موعد: ${formattedTime}` : ''}${partySize ? ` لعدد: ${partySize} أفراد` : ''}.\nبانتظاركم بكل سرور ☕`;
        await window.whatsapp.send(phone, msg);
        showToast('تم إرسال تأكيد الحجز عبر الواتساب ✓', 'success');
      } catch (waErr) {
        console.warn('WhatsApp notice:', waErr);
      }
    } else {
      showToast('فشل تسجيل الحجز: ' + (res?.error || ''), 'error');
    }
  } catch (err) {
    showToast('خطأ أثناء الحجز: ' + err.message, 'error');
  }
}

async function cancelTableReservationFromPOS(tableId, e = null) {
  if (e) e.stopPropagation();
  const ask = await Swal.fire({
    title: 'إلغاء حجز الترابيزة؟',
    text: 'هل أنت متأكد من إلغاء الحجز وإعادة الترابيزة لحالة فاضية؟',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'نعم، ألغِ الحجز',
    cancelButtonText: 'تراجع',
    confirmButtonColor: '#dc2626'
  });
  if (!ask.isConfirmed) return;

  const res = await window.tables.updateStatus(tableId, 'فاضية');
  if (res?.success) {
    showToast('تم إلغاء الحجز وأصبحت الترابيزة متاحة ✓', 'success');
    await loadTables();
    updatePickerCounts();
    renderTablePickerGrid();
  } else {
    showToast('خطأ: ' + (res?.error || ''), 'error');
  }
}

// ─── Table & Cafe Helpers ──────────────────────────────────────────────────────
async function loadTables() {
  try {
    const res = await window.tables.list();
    if (res.success) {
      allTables = res.data || [];
      const tblSel = document.getElementById('posTableSelect');
      if (tblSel) {
        tblSel.innerHTML = '<option value="">اختر ترابيزة</option>' +
          allTables.map(t => `<option value="${t.id}">${t.name} (${t.status})</option>`).join('');
        if (currentTableId) tblSel.value = currentTableId;
      }
    }
  } catch (e) { console.error('Error loading tables:', e); }
}

function getSelectedTableName() {
  const tblSel = document.getElementById('posTableSelect');
  if (!tblSel || !tblSel.value) return '';
  const opt = tblSel.options[tblSel.selectedIndex];
  return opt ? opt.textContent : '';
}

async function onTableSelectChange() {
  const tblSel = document.getElementById('posTableSelect');
  if (!tblSel) return;
  const tableId = parseInt(tblSel.value) || null;

  // 1. Confirm before switching if unsaved items exist in current cart
  if (invoiceItems.length > 0 && !currentInvoiceId && currentTableId && currentTableId !== tableId) {
    const ask = await Swal.fire({
      title: 'تنبيه: السلة بها أصناف!',
      text: 'عندك أصناف في السلة لسه ما اتبعتش، هل تريد تجاهلها والانتقال للترابيزة الجديدة؟',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#E05252',
      cancelButtonColor: '#94A3B8',
      confirmButtonText: 'نعم، تجاهل وانتقل',
      cancelButtonText: 'إلغاء والعودة'
    });
    if (!ask.isConfirmed) {
      if (currentTableId) tblSel.value = currentTableId;
      return;
    }
  }

  // 2. Set new table and clear cart
  currentTableId = tableId;
  currentInvoiceId = null;
  invoiceItems = [];
  renderItemsTable();
  recalcTotals();

  // Reset invoice number to a fresh one
  const invRes = await window.db.generateInvoiceNumber();
  if (invRes.success) {
    currentInvoiceNumber = invRes.data;
    document.getElementById('invoiceNumberDisplay').textContent = invRes.data;
  }

  const cartTitle = document.getElementById('cartOrderTitle');
  if (cartTitle) {
    cartTitle.textContent = tableId ? `طلب صالة — ${getSelectedTableName()}` : 'طلب صالة — ترابيزة جديدة';
  }

  // 3. Search for open invoice on the selected table
  if (tableId) {
    const checkRes = await window.db.queryOne(
      `SELECT id FROM invoices WHERE table_id = ? AND status IN ('مفتوحة', 'مرسلة للمطبخ') ORDER BY id DESC LIMIT 1`,
      [tableId]
    );
    if (checkRes.success && checkRes.data) {
      await resumeInvoiceById(checkRes.data.id);
    }
  }
}

async function loadDeliveryDrivers() {
  try {
    const res = await window.db.query("SELECT * FROM employees WHERE employee_type = 'دليفري' AND is_active = 1", []);
    if (res.success) {
      allDeliveryDrivers = res.data || [];
      const drvSel = document.getElementById('posDriverSelect');
      if (drvSel) {
        drvSel.innerHTML = '<option value="">اختر الدليفري</option>' +
          allDeliveryDrivers.map(d => `<option value="${d.id}">${d.name} (${d.phone||''})</option>`).join('');
      }
    }
  } catch (e) { console.error('Error loading delivery drivers:', e); }
}

function setOrderType(type) {
  currentOrderType = type;
  const dInBtn = document.getElementById('typeDineInBtn');
  const tkBtn = document.getElementById('typeTakeawayBtn');
  const delBtn = document.getElementById('typeDeliveryBtn');

  if (dInBtn) dInBtn.classList.toggle('active', type === 'صالة');
  if (tkBtn) tkBtn.classList.toggle('active', type === 'تيك أواي');
  if (delBtn) delBtn.classList.toggle('active', type === 'دليفري');

  const tblGroup = document.getElementById('tableControlGroup');
  const delGroup = document.getElementById('deliveryControlGroup');
  const custGroup = document.getElementById('customerControlGroup');
  const cartIcon = document.getElementById('cartOrderTypeIcon');
  const cartTitle = document.getElementById('cartOrderTitle');
  const delFeeRow = document.getElementById('cartDeliveryFeeRow');

  if (type === 'صالة') {
    if (tblGroup) tblGroup.style.display = 'flex';
    if (delGroup) delGroup.style.display = 'none';
    if (custGroup) custGroup.style.display = 'none';
    if (delFeeRow) delFeeRow.style.display = 'none';
    if (cartIcon) cartIcon.textContent = '🍽️';
    const tblName = getSelectedTableName();
    if (cartTitle) cartTitle.textContent = `طلب صالة — ${tblName || 'ترابيزة جديدة'}`;
  } else if (type === 'دليفري') {
    if (tblGroup) tblGroup.style.display = 'none';
    if (delGroup) delGroup.style.display = 'flex';
    if (custGroup) custGroup.style.display = 'flex';
    if (delFeeRow) delFeeRow.style.display = 'flex';
    if (cartIcon) cartIcon.textContent = '🛵';
    if (cartTitle) cartTitle.textContent = `طلب دليفري وتوصيل`;
  } else {
    // تيك أواي
    if (tblGroup) tblGroup.style.display = 'none';
    if (delGroup) delGroup.style.display = 'none';
    if (custGroup) custGroup.style.display = 'flex';
    if (delFeeRow) delFeeRow.style.display = 'none';
    if (cartIcon) cartIcon.textContent = '🥡';
    if (cartTitle) cartTitle.textContent = `طلب تيك أواي (سفري)`;
  }
  const btnKitchen = document.getElementById('btnSendToKitchen');
  if (btnKitchen) {
    btnKitchen.style.display = (type === 'تيك أواي') ? 'none' : 'flex';
  }
  recalcTotals();
}

async function resumeInvoiceById(id) {
  const invRes = await window.db.queryOne('SELECT * FROM invoices WHERE id = ?', [id]);
  if (!invRes.success || !invRes.data) return;
  const inv = invRes.data;

  const itemsRes = await window.db.query('SELECT * FROM invoice_items WHERE invoice_id = ?', [id]);
  const items = itemsRes.success ? itemsRes.data : [];

  currentInvoiceId = inv.id;
  currentInvoiceNumber = inv.invoice_number;
  const numDisplay = document.getElementById('invoiceNumberDisplay');
  if (numDisplay) numDisplay.textContent = inv.invoice_number;

  if (inv.table_id) {
    setOrderType('صالة');
    const tblSel = document.getElementById('posTableSelect');
    if (tblSel) tblSel.value = inv.table_id;
    currentTableId = inv.table_id;
  } else if (inv.invoice_type === 'دليفري') {
    setOrderType('دليفري');
    const drvSel = document.getElementById('posDriverSelect');
    const feeEl = document.getElementById('posDeliveryFee');
    if (drvSel && inv.driver_id) drvSel.value = inv.driver_id;
    if (feeEl && inv.delivery_fee) feeEl.value = inv.delivery_fee;
  } else {
    setOrderType('تيك أواي');
  }

  if (inv.customer_id) {
    const custSel = document.getElementById('customerSelect');
    const custSearch = document.getElementById('customerSearchInput');
    if (custSel) custSel.value = inv.customer_id;
    const cust = (window.allCustomers || []).find(c => c.id === inv.customer_id);
    if (cust && custSearch) {
      custSearch.value = `${cust.name} - ${cust.phone || ''}`;
    }
  }

  const dPct = document.getElementById('discountPercent');
  const dAmt = document.getElementById('discountAmount');
  const notes = document.getElementById('invoiceNotes');
  if (dPct) dPct.value = inv.discount_percent || 0;
  if (dAmt) dAmt.value = inv.discount_amount || 0;
  if (notes) notes.value = inv.notes || '';

  invoiceItems = items.map(it => ({
    service_id: it.service_id,
    category_name: it.category_name || '',
    service_name: it.service_name,
    barcode: it.barcode || '',
    sell_price: Number(it.sell_price !== undefined ? it.sell_price : (it.unit_price || 0)),
    quantity: Number(it.quantity || 1),
    item_discount: Number(it.item_discount !== undefined ? it.item_discount : (it.discount || 0)),
    total: Number(it.total || 0),
    notes: it.notes || '',
    sent_qty: Number(it.sent_qty || 0)
  }));

  renderItemsTable();
  recalcTotals();
  showToast(`تم فتح الفاتورة الحالية #${inv.invoice_number}`, 'info');
}

// ─── Active Delivery Orders Modal ─────────────────────────────────────────────
async function openActiveDeliveryModal() {
  const res = await window.delivery.getActiveOrders();
  const tbody = document.getElementById('deliveryOrdersBody');
  if (!tbody) return;

  if (!res.success || !res.data || !res.data.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="table-empty">لا توجد طلبات دليفري قيد التوصيل الآن</td></tr>';
  } else {
    tbody.innerHTML = res.data.map(ord => `
      <tr>
        <td style="font-weight:700;">#${ord.invoice_number}</td>
        <td>
          <div style="font-weight:700;">${ord.customer_name || 'عميل نقدي'}</div>
          <div style="font-size:11px; color:var(--text-muted);">${ord.customer_address || ord.customer_phone || ''}</div>
        </td>
        <td><b>${ord.driver_name || 'لم يحدد طيار'}</b></td>
        <td style="text-align:right; font-weight:800; color:var(--primary);">${fmt(ord.net_total)} ج.م</td>
        <td style="text-align:center;"><span class="badge badge-warning">${ord.delivery_status}</span></td>
        <td style="text-align:center;">
          <div style="display:flex; gap:4px; justify-content:center;">
            ${ord.delivery_status === 'قيد التجهيز' ? `<button class="btn btn-primary btn-sm" onclick="updateDeliveryOrderStatus(${ord.id}, 'مع الدليفري')">🛵 خرج مع الدليفري</button>` : ''}
            ${ord.delivery_status === 'مع الدليفري' ? `<button class="btn btn-success btn-sm" onclick="updateDeliveryOrderStatus(${ord.id}, 'تم التسليم')">✅ تم التسليم</button>` : ''}
            <button class="btn btn-hairline-danger btn-sm" onclick="updateDeliveryOrderStatus(${ord.id}, 'مرتجع')">مرتجع</button>
          </div>
        </td>
      </tr>
    `).join('');
  }
  openModal('deliveryOrdersModal');
}

async function updateDeliveryOrderStatus(invId, newStatus) {
  const res = await window.delivery.updateStatus(invId, newStatus);
  if (res.success) {
    showToast(`تم تحديث حالة الطلب إلى "${newStatus}"`, 'success');
    openActiveDeliveryModal();
  } else {
    showToast('خطأ: ' + res.error, 'error');
  }
}


function handleCustomerSelect() {
  const searchVal = document.getElementById('customerSearchInput').value.trim();
  const hiddenInput = document.getElementById('customerSelect');
  if (!searchVal) {
    hiddenInput.value = '';
    return;
  }
  
  if (window.allCustomers) {
    let match = window.allCustomers.find(c => (c.name + ' - ' + (c.phone||'')) === searchVal);
    if (!match) match = window.allCustomers.find(c => c.name === searchVal);
    
    if (match) {
      hiddenInput.value = match.id;
    } else {
      hiddenInput.value = '';
    }
  }
}

// ─── Categories & Services Grid ─────────────────────────────────────────────
function renderCategoryBtns() {
  const container = document.getElementById('categoryBtns');
  container.innerHTML = `<div class="cat-btn active" onclick="selectCategory(0,this)">الكل</div>`;
  categories.forEach(c=>{
    container.innerHTML += `<div class="cat-btn" onclick="selectCategory(${c.id},this)">${c.name}</div>`;
  });
}

function selectCategory(catId, btn) {
  document.querySelectorAll('.cat-btn').forEach(b=>b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  window._currentCatId = Number(catId);
  const filtered = Number(catId)===0 ? allServices : allServices.filter(s=>Number(s.category_id)===Number(catId));
  populateServiceSelect(filtered);
  renderServiceGrid(filtered);
  // Also sync category select in item entry bar
  const itmCat = document.getElementById('itemCategory');
  if (itmCat) itmCat.value = catId || '';
  const itmSvc = document.getElementById('itemService');
  if (itmSvc) itmSvc.value = '';
  const itmPrc = document.getElementById('itemPrice');
  if (itmPrc) itmPrc.value = '';
  const itmBar = document.getElementById('itemBarcode');
  if (itmBar) itmBar.value = '';
  // Clear search when switching category
  const svcSearch = document.getElementById('svcSearchInput');
  if (svcSearch) svcSearch.value = '';
}

// Fix 4: Live product search by name or barcode
function filterServicesBySearch(query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) {
    // Restore current category filter
    const activeCatId = window._currentCatId || 0;
    const restored = activeCatId === 0 ? allServices : allServices.filter(s => Number(s.category_id) === activeCatId);
    renderServiceGrid(restored);
    // re-select active btn
    document.querySelectorAll('.cat-btn').forEach(b => {
      const matches = (activeCatId === 0 && b.textContent.trim() === 'الكل') ||
                      b.getAttribute('onclick')?.includes(`selectCategory(${activeCatId},`);
      if (matches) b.classList.add('active');
      else b.classList.remove('active');
    });
    return;
  }
  const filtered = allServices.filter(s =>
    (s.name && s.name.toLowerCase().includes(q)) ||
    (s.barcode && s.barcode.toLowerCase().includes(q))
  );
  renderServiceGrid(filtered);
  // Deselect category buttons during search
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
}


function renderServiceGrid(services) {
  const grid = document.getElementById('servicesGrid');
  if(!services.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:20px;color:var(--text-muted);font-size:12px;">لا توجد خدمات</div>';
    return;
  }
  grid.innerHTML = services.map(s => {
    // Show a subtle out-of-stock indicator only when item is completely out
    let outIndicator = '';
    if (s.track_inventory === 1 && Number(s.quantity || 0) <= 0) {
      outIndicator = `<div style="font-size:9px;font-weight:700;color:#ef4444;margin-top:2px;">نفد</div>`;
    }

    const visualHtml = s.image
      ? `<div class="s-img-wrap"><img src="${s.image}" class="s-img" alt="${escapeHtml(s.name)}" /></div>`
      : `<div class="s-icon">☕</div>`;

    return `
      <div class="svc-btn" onclick="addServiceFromGrid(${s.id})">
        ${visualHtml}
        <div class="s-name">${escapeHtml(s.name)}</div>
        <div class="s-price">${fmt(s.sell_price)} ${settings.currency||'جنيه'}</div>
        ${outIndicator}
      </div>
    `;
  }).join('');
}

function addServiceFromGrid(svcId) {
  const svc = allServices.find(s => s.id === svcId);
  if(!svc) return;

  // If item has sizes, open size picker modal
  const itemSizes = allServiceSizes.filter(sz => sz.service_id === svcId);
  if (itemSizes && itemSizes.length > 0) {
    openSizePickerModal(svc, itemSizes);
    return;
  }

  const exist = invoiceItems.find(i=>i.service_id===svc.id && i.sell_price===svc.sell_price && parseFloat(i.item_discount)===0);
  const targetQty = (exist ? exist.quantity : 0) + 1;

  if (svc.track_inventory === 1) {
    const available = Number(svc.quantity || 0);
    const behavior = settings.stock_out_behavior || 'warn';

    if (targetQty > available) {
      if (behavior === 'block') {
        Swal.fire({
          title: 'المخزون غير كافٍ!',
          text: `الكمية المتاحة في المخزن من "${svc.name}" هي (${available}) قطعة فقط!`,
          icon: 'error',
          confirmButtonText: 'حسناً'
        });
        return;
      } else {
        showToast(`تنبيه: الكمية المطلوبة (${targetQty}) تتجاوز رصيد المخزن (${available})`, 'warning');
      }
    } else {
      const remainingStock = available - targetQty;
      const threshold = Number(svc.low_stock_threshold || 0);
      if (threshold > 0 && remainingStock <= threshold) {
        showToast(`انتبه: رصيد "${svc.name}" المتبقي (${remainingStock}) وصل لحد التنبيه (${threshold})`, 'warning');
      }
    }
  }

  if(exist) {
    exist.quantity++;
    exist.total = exist.quantity * exist.sell_price;
  } else {
    invoiceItems.push({
      service_id: svc.id,
      category_name: svc.cat_name || 'بدون قسم',
      service_name: svc.name,
      barcode: svc.barcode,
      sell_price: svc.sell_price,
      quantity: 1,
      item_discount: 0,
      total: svc.sell_price
    });
  }
  renderItemsTable();
  recalcTotals();
}

function openSizePickerModal(svc, sizes) {
  const titleEl = document.getElementById('sizePickerTitle');
  if (titleEl) titleEl.textContent = `اختر الحجم — ${svc.name}`;
  const grid = document.getElementById('sizePickerGrid');
  if (!grid) return;

  grid.innerHTML = sizes.map(sz => `
    <button type="button" class="btn btn-outline" onclick='selectServiceSize(${svc.id}, ${JSON.stringify(sz).replace(/'/g, "&apos;")})'
      style="padding:14px 10px; display:flex; flex-direction:column; align-items:center; gap:6px; border-radius:12px; border:2px solid var(--border); background:#fff; cursor:pointer; transition:all 0.15s; min-height:85px; justify-content:center;">
      <span style="font-weight:900; font-size:16px; color:var(--primary);">${escapeHtml(sz.size_name)}</span>
      <span style="font-weight:900; font-size:14px; color:var(--success);">${fmt(sz.sell_price)} ${settings.currency || 'ج.م'}</span>
      ${sz.recipe_ratio && sz.recipe_ratio !== 1 ? `<span style="font-size:10px; color:var(--text-muted); font-weight:700;">نسبة المكونات: x${sz.recipe_ratio}</span>` : ''}
    </button>
  `).join('');

  openModal('sizePickerModal');
}

function selectServiceSize(svcId, sz) {
  closeModal('sizePickerModal');
  const svc = allServices.find(s => s.id === svcId);
  if (!svc) return;

  const sizePrice = Number(sz.sell_price);
  const sizeName = sz.size_name;
  const fullItemName = `${svc.name} (${sizeName})`;
  const ratio = Number(sz.recipe_ratio) || (svc.sell_price > 0 ? Math.round((sizePrice / svc.sell_price) * 100) / 100 : 1);

  // Check inventory if tracking
  const exist = invoiceItems.find(i => i.service_id === svc.id && i.size_name === sizeName && i.sell_price === sizePrice);
  const targetQty = (exist ? exist.quantity : 0) + 1;

  if (svc.track_inventory === 1) {
    const available = Number(svc.quantity || 0);
    const behavior = settings.stock_out_behavior || 'warn';
    if (targetQty > available) {
      if (behavior === 'block') {
        Swal.fire({
          title: 'المخزون غير كافٍ!',
          text: `الكمية المتاحة في المخزن من "${svc.name}" هي (${available}) قطعة فقط!`,
          icon: 'error',
          confirmButtonText: 'حسناً'
        });
        return;
      } else {
        showToast(`تنبيه: الكمية المطلوبة (${targetQty}) تتجاوز رصيد المخزن (${available})`, 'warning');
      }
    }
  }

  if (exist) {
    exist.quantity++;
    exist.total = exist.quantity * exist.sell_price;
  } else {
    invoiceItems.push({
      service_id: svc.id,
      category_name: svc.cat_name || 'بدون قسم',
      service_name: fullItemName,
      size_name: sizeName,
      recipe_ratio: ratio,
      barcode: sz.barcode || svc.barcode || '',
      sell_price: sizePrice,
      quantity: 1,
      item_discount: 0,
      total: sizePrice,
      notes: ''
    });
  }

  renderItemsTable();
  recalcTotals();
}

function populateCategorySelect() {
  const sel = document.getElementById('itemCategory');
  if (!sel) return;
  sel.innerHTML = '<option value="">الكل</option>';
  categories.forEach(c=>{ sel.innerHTML+=`<option value="${c.id}">${c.name}</option>`; });
}

function populateServiceSelect(services) {
  const sel = document.getElementById('itemService');
  if (!sel) return;
  sel.innerHTML = '<option value="">اختر الخدمة أو الصنف</option>';
  services.forEach(s=>{
    const stockInfo = s.track_inventory === 1 ? ` (متاح: ${s.quantity||0})` : '';
    sel.innerHTML+=`<option value="${s.id}" data-price="${s.sell_price}" data-barcode="${s.barcode||''}" data-cat="${s.cat_name||''}">${s.name}${stockInfo}</option>`;
  });
}

function loadCategoryServices() {
  const itmCat = document.getElementById('itemCategory');
  const catId = itmCat ? (parseInt(itmCat.value) || 0) : 0;
  const filtered = Number(catId)===0 ? allServices : allServices.filter(s=>Number(s.category_id)===Number(catId));
  populateServiceSelect(filtered);
  renderServiceGrid(filtered);
}

function onServiceSelect() {
  const sel = document.getElementById('itemService');
  const opt = sel.options[sel.selectedIndex];
  if(!opt || !opt.value) return;
  document.getElementById('itemPrice').value = opt.dataset.price || '0';
  document.getElementById('itemBarcode').value = opt.dataset.barcode || '';
}

function lookupBarcode() {
  const bc = document.getElementById('itemBarcode').value.trim();
  if(!bc) return;

  // First check if barcode matches any size in allServiceSizes
  const matchedSize = allServiceSizes.find(sz => sz.barcode && sz.barcode.trim() === bc);
  if (matchedSize) {
    selectServiceSize(matchedSize.service_id, matchedSize);
    document.getElementById('itemBarcode').value = '';
    showToast(`تم إضافة الحجم "${matchedSize.size_name}" من خلال الباركود`, 'success');
    return;
  }

  const svc = allServices.find(s=>s.barcode===bc);
  if(!svc){ showToast('لم يتم العثور على الباركود','warning'); return; }

  // Check if item has sizes
  const itemSizes = allServiceSizes.filter(sz => sz.service_id === svc.id);
  if (itemSizes && itemSizes.length > 0) {
    openSizePickerModal(svc, itemSizes);
    document.getElementById('itemBarcode').value = '';
    return;
  }

  const exist = invoiceItems.find(i => i.service_id === svc.id);
  const targetQty = (exist ? exist.quantity : 0) + 1;

  if (svc.track_inventory === 1) {
    const available = Number(svc.quantity || 0);
    const behavior = settings.stock_out_behavior || 'warn';

    if (targetQty > available) {
      if (behavior === 'block') {
        Swal.fire({
          title: 'المخزون غير كافٍ!',
          text: `الكمية المتاحة في المخزن من "${svc.name}" هي (${available}) قطعة فقط!`,
          icon: 'error',
          confirmButtonText: 'حسناً'
        });
        document.getElementById('itemBarcode').value = '';
        return;
      } else {
        showToast(`تنبيه: الكمية المطلوبة (${targetQty}) تتجاوز رصيد المخزن (${available})`, 'warning');
      }
    } else {
      const remainingStock = available - targetQty;
      const threshold = Number(svc.low_stock_threshold || 0);
      if (threshold > 0 && remainingStock <= threshold) {
        showToast(`انتبه: رصيد "${svc.name}" المتبقي (${remainingStock}) وصل لحد التنبيه (${threshold})`, 'warning');
      }
    }
  }

  // إن كان الصنف موجوداً بالفعل في الفاتورة، زِد الكمية مباشرةً
  if(exist){
    exist.quantity++;
    exist.total = exist.quantity * (exist.sell_price - (parseFloat(exist.item_discount)||0));
    renderItemsTable();
    recalcTotals();
    document.getElementById('itemBarcode').value = '';
    showToast(`تم زيادة كمية "${svc.name}" ← ${exist.quantity}`, 'success');
    return;
  }

  // صنف جديد، أضفه
  document.getElementById('itemService').value = svc.id;
  document.getElementById('itemPrice').value = svc.sell_price;
  addItemToInvoice();
}

// ─── Add Item ─────────────────────────────────────────────────────────────────
function addItemToInvoice() {
  const svcSel = document.getElementById('itemService');
  const opt = svcSel.options[svcSel.selectedIndex];
  const price = parseFloat(document.getElementById('itemPrice').value)||0;
  const qty = parseInt(document.getElementById('itemQty').value)||1;
  const discount = parseFloat(document.getElementById('itemDiscount').value)||0;
  const barcode = document.getElementById('itemBarcode').value.trim();

  let svcId = null, svcName = 'خدمة يدوية', catName = '', svcBarcode = barcode;
  if(opt && opt.value){
    svcId = parseInt(opt.value);
    svcName = opt.text.replace(/\s*\(متاح:\s*\d+\)$/, '');
    catName = opt.dataset.cat || '';
    svcBarcode = opt.dataset.barcode || barcode;
  }
  if(price<=0){ showToast('يرجى إدخال السعر','error'); return; }

  // فحص المخزون للصنف المختار
  if(svcId) {
    const svc = allServices.find(s => s.id === svcId);
    if(svc && svc.track_inventory === 1) {
      const exist = invoiceItems.find(i => i.service_id === svcId);
      const targetQty = (exist ? exist.quantity : 0) + qty;
      const available = Number(svc.quantity || 0);
      const behavior = settings.stock_out_behavior || 'warn';

      if(targetQty > available) {
        if(behavior === 'block') {
          Swal.fire({
            title: 'المخزون غير كافٍ!',
            text: `الكمية المتوفرة بالمخزن من "${svc.name}" هي (${available}) فقط، لا يمكن بيع (${targetQty}) قطعة!`,
            icon: 'error',
            confirmButtonText: 'حسناً'
          });
          return;
        } else {
          showToast(`تنبيه: الكمية المطلوبة (${targetQty}) تتجاوز رصيد المخزن (${available})`, 'warning');
        }
      } else {
        const remainingStock = available - targetQty;
        const threshold = Number(svc.low_stock_threshold || 0);
        if(threshold > 0 && remainingStock <= threshold) {
          showToast(`انتبه: رصيد "${svc.name}" المتبقي (${remainingStock}) وصل لحد التنبيه (${threshold})`, 'warning');
        }
      }
    }
  }

  // إن كان الصنف نفسه موجوداً بنفس السعر والخصم وبدون ملاحظات خاصة، زِد الكمية
  if(svcId){
    const exist = invoiceItems.find(i =>
      i.service_id === svcId &&
      i.sell_price === price &&
      parseFloat(i.item_discount) === discount &&
      !(i.notes && i.notes.trim() !== '')
    );
    if(exist){
      exist.quantity += qty;
      exist.total = exist.quantity * (exist.sell_price - (parseFloat(exist.item_discount)||0));
      renderItemsTable();
      recalcTotals();
      document.getElementById('itemService').value='';
      document.getElementById('itemPrice').value='';
      document.getElementById('itemQty').value='1';
      document.getElementById('itemDiscount').value='0';
      document.getElementById('itemBarcode').value='';
      document.getElementById('itemService').focus();
      return;
    }
  }

  const priceAfterDiscount = price - discount;
  const total = (priceAfterDiscount * qty);

  invoiceItems.push({
    service_id: svcId,
    category_name: catName,
    service_name: svcName,
    barcode: svcBarcode,
    sell_price: price,
    quantity: qty,
    item_discount: discount,
    total,
    notes: ''
  });

  renderItemsTable();
  recalcTotals();
  // Reset entry fields
  document.getElementById('itemService').value='';
  document.getElementById('itemPrice').value='';
  document.getElementById('itemQty').value='1';
  document.getElementById('itemDiscount').value='0';
  document.getElementById('itemBarcode').value='';
  document.getElementById('itemService').focus();
}

// ─── Render Table ─────────────────────────────────────────────────────────────
function renderItemsTable() {
  const tbody = document.getElementById('invoiceItemsBody');
  const isSaved = lastSavedInvoice !== null;
  
  if(!invoiceItems.length){
    tbody.innerHTML=`<tr id="emptyRow"><td colspan="6" class="table-empty" style="padding:40px 10px;"><div style="font-size:36px;margin-bottom:8px;">☕</div><div style="font-weight:700;color:var(--text-muted);">السلة فارغة</div><div style="font-size:11px;color:var(--text-muted);margin-top:4px;">اضغط على الأصناف لإضافتها للطلب</div></td></tr>`;
    return;
  }
  tbody.innerHTML = invoiceItems.map((item,i) => {
    const sentQty = Number(item.sent_qty || 0);
    const unsentQty = Math.max(0, item.quantity - sentQty);
    let kitchenStatusBadge = '';
    if (unsentQty > 0) {
      if (sentQty === 0) {
        kitchenStatusBadge = `<span style="display:inline-flex; align-items:center; gap:3px; background:#fff7ed; color:#c2410c; border:1px solid #fed7aa; padding:1px 6px; border-radius:10px; font-size:10px; font-weight:800; margin-right:4px;" title="لم يُرسل هذا الصنف لطابعة المطبخ بعد">⏳ لم يُرسل للمطبخ</span>`;
      } else {
        kitchenStatusBadge = `<span style="display:inline-flex; align-items:center; gap:3px; background:#fff7ed; color:#c2410c; border:1px solid #fed7aa; padding:1px 6px; border-radius:10px; font-size:10px; font-weight:800; margin-right:4px;" title="تم إرسال ${sentQty} من قبل، وهناك ${unsentQty} جديد">+${unsentQty} جديد للمطبخ ⏳</span>`;
      }
    }

    return `
      <tr>
        <td style="color:var(--text-muted);font-size:11px;">${i+1}</td>
        <td>
          <div style="display:flex; align-items:center; flex-wrap:wrap; gap:4px;">
            <span style="font-weight:800; color:var(--text); font-size:13px; line-height:1.25;">
              ${escapeHtml(item.service_name)}
            </span>
            ${kitchenStatusBadge}
          </div>
          <div style="margin-top:3px;">
            ${item.notes ? `
              <span class="item-notes-badge" onclick="openItemModifierModal(${i})" title="انقر لتعديل التخصيص أو الملاحظات">
                <span>✏️</span>
                <span>${escapeHtml(item.notes)}</span>
              </span>
            ` : `
              <button class="btn-item-note-add" onclick="openItemModifierModal(${i})" title="إضافة تخصيص (سكر، حليب، كراميل...)">
                + ملاحظات / تخصيص
              </button>
            `}
          </div>
        </td>
        <td style="text-align:center; white-space:nowrap;">
          <button class="qty-control-btn" onclick="stepQty(${i}, -1)">-</button>
          <input type="number" class="qty-display-input" value="${item.quantity}" min="1"
            onchange="updateQty(${i}, this.value)" ${isSaved?'disabled':''} />
          <button class="qty-control-btn" onclick="stepQty(${i}, 1)">+</button>
        </td>
        <td style="text-align:right; font-weight:700; color:var(--text-muted);">${fmt(item.sell_price)}</td>
        <td style="text-align:right; font-weight:900; color:var(--primary); font-size:13px;">${fmt(item.total)}</td>
        <td style="text-align:center;">
          ${isSaved ? '—' : `<button class="delete-row-btn" onclick="removeItem(${i})" title="حذف">✕</button>`}
        </td>
      </tr>
    `;
  }).join('');
}

// ─── Item Modifiers Modal & Logic ─────────────────────────────────────────────
let currentModifyingItemIndex = -1;

function openItemModifierModal(index) {
  if (index < 0 || index >= invoiceItems.length) return;
  currentModifyingItemIndex = index;
  const item = invoiceItems[index];
  const titleEl = document.getElementById('modifierItemTitle');
  if (titleEl) titleEl.textContent = item.service_name;
  const noteInput = document.getElementById('modifierFreeTextInput');
  if (noteInput) {
    noteInput.value = item.notes || '';
    refreshModifierChipsState(item.notes || '');
  }
  openModal('itemModifierModal');
  setTimeout(() => {
    if (noteInput) noteInput.focus();
  }, 150);
}

function toggleModifierChip(chipText) {
  const noteInput = document.getElementById('modifierFreeTextInput');
  if (!noteInput) return;
  let currentVal = noteInput.value.trim();
  let parts = currentVal ? currentVal.split(/[,،]\s*|\s*-\s*/).map(p => p.trim()).filter(Boolean) : [];
  const idx = parts.indexOf(chipText);
  if (idx >= 0) {
    parts.splice(idx, 1);
  } else {
    parts.push(chipText);
  }
  noteInput.value = parts.join('، ');
  refreshModifierChipsState(noteInput.value);
}

function refreshModifierChipsState(currentText) {
  const chips = document.querySelectorAll('#itemModifierModal .mod-chip');
  chips.forEach(ch => {
    const txt = ch.textContent.trim();
    if (currentText.includes(txt)) {
      ch.classList.add('active');
    } else {
      ch.classList.remove('active');
    }
  });
}

function saveItemModifier() {
  if (currentModifyingItemIndex < 0 || currentModifyingItemIndex >= invoiceItems.length) {
    closeModal('itemModifierModal');
    return;
  }
  const noteInput = document.getElementById('modifierFreeTextInput');
  const text = noteInput ? noteInput.value.trim() : '';
  invoiceItems[currentModifyingItemIndex].notes = text;
  closeModal('itemModifierModal');
  renderItemsTable();
  showToast('تم حفظ ملاحظات الصنف ✓', 'info');
}

function clearItemModifiers() {
  const noteInput = document.getElementById('modifierFreeTextInput');
  if (noteInput) noteInput.value = '';
  refreshModifierChipsState('');
}

// ─── Kitchen Void Protection & Audit Logging ─────────────────────────────────
async function requestVoidKitchenItem(item, requestedNewQty) {
  const sentQty = Number(item.sent_qty || 0);
  if (sentQty <= 0) return true; // Not sent to kitchen yet, normal delete/reduction allowed

  const voidQty = sentQty - Math.max(0, requestedNewQty);
  if (voidQty <= 0) return true; // Not reducing below sent quantity

  const { value: formValues } = await Swal.fire({
    title: '⚠️ تصريح إلغاء صنف بعد إرساله للمطبخ',
    html: `
      <div style="text-align:right; font-size:13px; line-height:1.6; margin-bottom:14px;">
        الصنف: <b style="color:var(--primary); font-size:14px;">${escapeHtml(item.service_name)}</b><br/>
        الكمية المرسلة للمطبخ: <b style="color:#dc2626;">${sentQty}</b> | الكمية المراد إلغاؤها: <b style="color:#dc2626;">${voidQty}</b><br/>
        <span style="color:#64748b; font-size:11px;">هذا الصنف تم إرساله للمطبخ بالفعل. يتطلب الحذف أو التخفيض إدخال كلمة مرور المدير وتحديد سبب الإلغاء لتوثيقه في سجل الرقابة (Audit Log).</span>
      </div>
      <div style="display:flex; flex-direction:column; gap:10px; text-align:right;">
        <div>
          <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">سبب الإلغاء *</label>
          <select id="swalVoidReason" class="swal2-select" style="width:100%; margin:0; height:38px; font-size:13px;">
            <option value="طلب العميل إلغاء الصنف">طلب العميل إلغاء الصنف</option>
            <option value="خطأ كاشير في تسجيل الصنف">خطأ كاشير في تسجيل الصنف</option>
            <option value="تأخر تحضير الطلب بالمطبخ">تأخر تحضير الطلب بالمطبخ</option>
            <option value="عدم توفر المكونات بالمطبخ">عدم توفر المكونات بالمطبخ</option>
            <option value="تلف أو خطأ في التشغيل">تلف أو خطأ في التشغيل</option>
          </select>
        </div>
        <div>
          <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">كلمة مرور المدير *</label>
          <input type="password" id="swalAdminPass" class="swal2-input" placeholder="أدخل كلمة مرور المدير" style="width:100%; margin:0; height:38px; font-size:14px;" />
        </div>
      </div>
    `,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: 'تأكيد الإلغاء والتوثيق',
    cancelButtonText: 'تراجع',
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#64748b',
    preConfirm: () => {
      const pass = document.getElementById('swalAdminPass')?.value;
      const reason = document.getElementById('swalVoidReason')?.value;
      if (!pass) {
        Swal.showValidationMessage('يرجى إدخال كلمة مرور المدير');
        return false;
      }
      return { pass, reason };
    }
  });

  if (!formValues) return false;

  try {
    const authRes = await window.auth.verifyAdminPassword(formValues.pass);
    if (!authRes || !authRes.success) {
      await Swal.fire({
        title: 'فشل التحقق',
        text: authRes?.error || 'كلمة المرور غير صحيحة!',
        icon: 'error',
        confirmButtonText: 'حسناً'
      });
      return false;
    }

    // Log to audit_log
    const oldVal = {
      invoice_number: currentInvoiceNumber,
      invoice_id: currentInvoiceId,
      table_id: currentTableId,
      service_name: item.service_name,
      original_qty: item.quantity,
      sent_qty: item.sent_qty,
      void_qty: voidQty,
      price: item.sell_price
    };
    const newVal = {
      new_qty: requestedNewQty,
      reason: formValues.reason,
      authorized_by: authRes.admin?.username || 'admin',
      time: new Date().toISOString()
    };

    await window.audit.log(
      requestedNewQty <= 0 ? 'حذف صنف بعد إرساله للمطبخ' : 'تخفيض كمية صنف بعد إرساله للمطبخ',
      'invoice_items',
      currentInvoiceId || 0,
      oldVal,
      newVal
    );

    // If invoice is already active in database, update it immediately
    if (currentInvoiceId && item.service_id) {
      if (requestedNewQty <= 0) {
        await window.db.run('DELETE FROM invoice_items WHERE invoice_id = ? AND service_id = ?', [currentInvoiceId, item.service_id]);
      } else {
        const itemTot = (item.sell_price - (item.item_discount || 0)) * requestedNewQty;
        await window.db.run(
          'UPDATE invoice_items SET quantity = ?, sent_qty = ?, total = ? WHERE invoice_id = ? AND service_id = ?',
          [requestedNewQty, requestedNewQty, itemTot, currentInvoiceId, item.service_id]
        );
      }
      const sumRes = await window.db.queryOne('SELECT COALESCE(SUM(total), 0) as subtotal FROM invoice_items WHERE invoice_id = ?', [currentInvoiceId]);
      const newSub = sumRes?.data?.subtotal || 0;
      await window.db.run('UPDATE invoices SET subtotal = ?, net_total = ? WHERE id = ?', [newSub, newSub, currentInvoiceId]);
    }

    showToast(`تم توثيق إلغاء (${voidQty}) من "${item.service_name}" بسجل الرقابة ✓`, 'success');
    return true;
  } catch (err) {
    showToast('حدث خطأ أثناء توثيق الإلغاء: ' + err.message, 'error');
    return false;
  }
}

async function stepQty(idx, delta) {
  const item = invoiceItems[idx];
  if (!item) return;
  const current = item.quantity || 1;
  const newQty = current + delta;
  if (newQty <= 0) {
    await removeItem(idx);
    return;
  }
  await updateQty(idx, newQty);
}

async function updateQty(idx, val) {
  const qty = parseInt(val) || 1;
  const item = invoiceItems[idx];
  if (!item) return;

  if (qty <= 0) {
    await removeItem(idx);
    return;
  }

  // Intercept void if reducing below sent_qty
  if (item.sent_qty && qty < item.sent_qty) {
    const ok = await requestVoidKitchenItem(item, qty);
    if (!ok) {
      renderItemsTable();
      return;
    }
    item.sent_qty = qty;
  }

  const svc = allServices.find(s => s.id === item.service_id);

  if (svc && svc.track_inventory === 1) {
    const available = Number(svc.quantity || 0);
    const behavior = settings.stock_out_behavior || 'warn';

    if (qty > available) {
      if (behavior === 'block') {
        Swal.fire({
          title: 'الكمية غير متوفرة!',
          text: `الكمية المتوفرة بالمخزن من "${svc.name}" هي (${available}) فقط، لا يمكن بيع (${qty}) قطعة!`,
          icon: 'error',
          confirmButtonText: 'حسناً'
        });
        item.quantity = available > 0 ? available : 1;
        item.total = (item.sell_price - item.item_discount) * item.quantity;
        renderItemsTable();
        recalcTotals();
        return;
      } else {
        showToast(`تنبيه: الكمية المطلوبة (${qty}) تتجاوز رصيد المخزن (${available})!`, 'warning');
      }
    } else {
      const remainingStock = available - qty;
      const threshold = Number(svc.low_stock_threshold || 0);
      if (threshold > 0 && remainingStock <= threshold) {
        showToast(`انتبه: المتبقي بالمخزن من "${svc.name}" (${remainingStock}) وصل لحد التنبيه (${threshold})`, 'warning');
      }
    }
  }

  item.quantity = qty;
  item.total = (item.sell_price - item.item_discount) * qty;
  renderItemsTable();
  recalcTotals();
}

function updateItemDiscount(index, val) {
  const d = parseFloat(val)||0;
  invoiceItems[index].item_discount = d;
  invoiceItems[index].total = (invoiceItems[index].sell_price - d) * invoiceItems[index].quantity;
  renderItemsTable();
  recalcTotals();
}

function updateItemPrice(index, val) {
  const p = parseFloat(val)||0;
  invoiceItems[index].sell_price = p;
  invoiceItems[index].total = (p - invoiceItems[index].item_discount) * invoiceItems[index].quantity;
  renderItemsTable();
  recalcTotals();
}

async function removeItem(idx) {
  const item = invoiceItems[idx];
  if (!item) return;

  if (item.sent_qty && item.sent_qty > 0) {
    const ok = await requestVoidKitchenItem(item, 0);
    if (!ok) return;
  }

  invoiceItems.splice(idx, 1);
  renderItemsTable();
  recalcTotals();
  showToast('تم حذف الصنف من الطلب', 'info');
}

// ─── Totals ───────────────────────────────────────────────────────────────────
function recalcTotals() {
  const subtotal = invoiceItems.reduce((s,i)=>s+(i.sell_price*i.quantity),0);
  const itemDiscounts = invoiceItems.reduce((s,i)=>s+(i.item_discount*i.quantity),0);

  let discountAmt = parseFloat(document.getElementById('discountAmount')?.value)||0;
  const discountPct = parseFloat(document.getElementById('discountPercent')?.value)||0;

  // Business rule: % first, then override with fixed if > 0
  let totalDiscount = itemDiscounts;
  if(discountPct>0) {
    totalDiscount = itemDiscounts + ((subtotal-itemDiscounts) * discountPct/100);
    const dAmtEl = document.getElementById('discountAmount');
    if (dAmtEl) dAmtEl.value = fmt((subtotal-itemDiscounts)*discountPct/100);
  }
  if(discountAmt>0 && discountPct===0) {
    totalDiscount = itemDiscounts + discountAmt;
  }

  let deliveryFee = 0;
  if (currentOrderType === '\u062f\u0644\u064a\u0641\u0631\u064a') {
    deliveryFee = parseFloat(document.getElementById('posDeliveryFee')?.value) || 0;
    const feeDisp = document.getElementById('cartDeliveryFeeDisplay');
    if (feeDisp) feeDisp.textContent = fmt(deliveryFee);
  }

  const afterDiscount = Math.max(0, subtotal - totalDiscount);

  // ─── Service Charge: only for dine-in ────────────────────────────────────
  let serviceAmount = 0;
  const svcEnabled = Number(settings.service_charge_enabled) === 1;
  const svcRate = Number(settings.service_charge_rate || 0);
  if (svcEnabled && svcRate > 0 && currentOrderType === '\u0635\u0627\u0644\u0629') {
    serviceAmount = Math.round(afterDiscount * svcRate / 100 * 100) / 100;
  }

  // ─── VAT / Tax ────────────────────────────────────────────────────────────
  let taxAmount = 0;
  const taxEnabled = Number(settings.tax_enabled) === 1;
  const taxRate = Number(settings.tax_rate || 0);
  const taxType = settings.tax_type || 'exclusive';
  const taxExemptTakeaway = Number(settings.tax_exempt_takeaway) === 1;
  const isTakeaway = currentOrderType === '\u062a\u064a\u0643 \u0623\u0648\u0627\u064a';
  const skipTax = isTakeaway && taxExemptTakeaway;

  if (taxEnabled && taxRate > 0 && !skipTax) {
    const taxBase = afterDiscount + serviceAmount;
    if (taxType === 'inclusive') {
      taxAmount = Math.round((taxBase - (taxBase / (1 + taxRate / 100))) * 100) / 100;
    } else {
      taxAmount = Math.round(taxBase * taxRate / 100 * 100) / 100;
    }
  }

  // Store for doSaveInvoice
  window._lastCalc = { serviceRate: svcRate, serviceAmount, taxRate, taxAmount, taxType, orderType: currentOrderType };

  const netTotal = afterDiscount + serviceAmount + (taxType === 'inclusive' ? 0 : taxAmount) + deliveryFee;
  const paid = parseFloat(document.getElementById('amountPaid')?.value)||0;
  const remaining = Math.max(0, netTotal - paid);
  const totalQty = invoiceItems.reduce((s,i)=>s+i.quantity,0);

  const tQtyEl = document.getElementById('totalQtyDisplay');
  const subEl = document.getElementById('subtotalDisplay');
  const discEl = document.getElementById('discountDisplay');
  const netEl = document.getElementById('netTotalDisplay');
  const paidEl = document.getElementById('paidDisplay');
  const remEl = document.getElementById('remainingDisplay');

  if (tQtyEl) tQtyEl.textContent = totalQty;
  if (subEl) subEl.textContent = fmt(subtotal);
  if (discEl) discEl.textContent = fmt(totalDiscount);
  if (netEl) netEl.textContent = fmt(netTotal) + ' \u062c.\u0645';
  if (paidEl) paidEl.textContent = fmt(paid);
  if (remEl) remEl.textContent = fmt(remaining);

  // Live service charge row
  const svcRow = document.getElementById('cartServiceChargeRow');
  if (svcRow) {
    svcRow.style.display = serviceAmount > 0 ? 'flex' : 'none';
    const svcDisp = document.getElementById('cartServiceChargeDisplay');
    if (svcDisp) svcDisp.textContent = fmt(serviceAmount);
  }
  // Live tax row
  const taxRow = document.getElementById('cartTaxRow');
  if (taxRow) {
    taxRow.style.display = taxAmount > 0 ? 'flex' : 'none';
    const taxDisp = document.getElementById('cartTaxDisplay');
    if (taxDisp) taxDisp.textContent = fmt(taxAmount);
    const taxLbl = document.getElementById('cartTaxLabel');
    if (taxLbl) taxLbl.textContent = taxType === 'inclusive'
      ? `\u0636\u0631\u064a\u0628\u0629 \u0627\u0644\u0642\u064a\u0645\u0629 \u0627\u0644\u0645\u0636\u0627\u0641\u0629 (${taxRate}% \u0634\u0627\u0645\u0644):`
      : `\u0636\u0631\u064a\u0628\u0629 \u0627\u0644\u0642\u064a\u0645\u0629 \u0627\u0644\u0645\u0636\u0627\u0641\u0629 (${taxRate}%):`;
  }
}

function payFull() {
  const netText = document.getElementById('netTotalDisplay')?.textContent || '0';
  const net = parseFloat(netText.replace(/[^\d.]/g, '')) || 0;
  document.getElementById('amountPaid').value = fmt(net);
  recalcTotals();
}

// ─── Payment & Checkout Modal Flow ──────────────────────────────────────────
let pendingAction = null; // 'save' | 'saveAndPrint' | 'savePrintAndWhatsApp'

function selectPaymentMethodCard(method) {
  document.getElementById('selectedPaymentMethod').value = method;
  
  // Update card active classes
  const cards = {
    'نقدي': 'methodCard-cash',
    'فيزا': 'methodCard-visa',
    'فودافون كاش': 'methodCard-vodafone',
    'إنستا باي': 'methodCard-instapay'
  };
  Object.keys(cards).forEach(key => {
    const el = document.getElementById(cards[key]);
    if (el) {
      if (key === method) el.classList.add('active');
      else el.classList.remove('active');
    }
  });

  const cashSec = document.getElementById('cashDenominationsSection');
  const amountLbl = document.getElementById('checkoutAmountLabel');

  if (method === 'نقدي') {
    if (cashSec) cashSec.style.display = 'block';
    if (amountLbl) amountLbl.textContent = 'المبلغ المستلم من العميل (ج.م) *';
  } else {
    // Electronic: Auto full-pay
    if (cashSec) cashSec.style.display = 'none';
    if (amountLbl) amountLbl.textContent = `المبلغ المسدد عبر (${method}) *`;
    setCheckoutPaidExact();
  }
  onCheckoutPaidChange();
}

function setCheckoutPaidExact() {
  const netText = document.getElementById('netTotalDisplay')?.textContent || '0';
  const netTotal = parseFloat(netText.replace(/[^\d.]/g, '')) || 0;
  const input = document.getElementById('checkoutAmountPaid');
  if (input) input.value = netTotal.toFixed(2);
  onCheckoutPaidChange();
}

function setCheckoutPaidDenom(val) {
  const input = document.getElementById('checkoutAmountPaid');
  if (input) input.value = Number(val).toFixed(2);
  onCheckoutPaidChange();
}

function addCheckoutPaidDelta(delta) {
  const input = document.getElementById('checkoutAmountPaid');
  if (input) {
    const cur = parseFloat(input.value) || 0;
    input.value = Number(cur + delta).toFixed(2);
  }
  onCheckoutPaidChange();
}

function onCheckoutPaidChange() {
  const netText = document.getElementById('netTotalDisplay')?.textContent || '0';
  const netTotal = parseFloat(netText.replace(/[^\d.]/g, '')) || 0;
  const paidVal = document.getElementById('checkoutAmountPaid')?.value;
  const paid = parseFloat(paidVal) || 0;
  const diff = paid - netTotal;
  
  const banner = document.getElementById('checkoutChangeBanner');
  const lbl = document.getElementById('checkoutChangeLabel');
  const amt = document.getElementById('checkoutChangeAmount');
  if (!banner || !lbl || !amt) return;

  banner.className = 'change-alert-banner';

  if (Math.abs(diff) < 0.001) {
    banner.classList.add('exact');
    lbl.textContent = '✓ المبلغ مسدد بالكامل (المضبوط)';
    amt.textContent = '0.00 ج.م';
  } else if (diff > 0) {
    banner.classList.add('give-change');
    lbl.textContent = '🟢 الباقي للعميل (فكة):';
    amt.textContent = fmt(diff) + ' ج.م';
  } else {
    banner.classList.add('remaining-debt');
    lbl.textContent = '🟡 المتبقي آجل على العميل:';
    amt.textContent = fmt(Math.abs(diff)) + ' ج.م';
  }
}

async function openCheckoutModal(action) {
  if (!invoiceItems.length) {
    showToast('لا توجد أصناف في الطلب', 'error');
    return;
  }

  pendingAction = action || 'saveAndPrint';
  const netText = document.getElementById('netTotalDisplay')?.textContent || '0';
  const netTotal = parseFloat(netText.replace(/[^\d.]/g, '')) || 0;
  
  const netEl = document.getElementById('checkoutNetTotal');
  if (netEl) netEl.textContent = fmt(netTotal) + ' ج.م';

  const badgeEl = document.getElementById('checkoutOrderTypeBadge');
  if (badgeEl) {
    const tblName = getSelectedTableName();
    badgeEl.textContent = currentOrderType === 'صالة' ? `🍽️ صالة (${tblName || 'ترابيزة'})` : (currentOrderType === 'دليفري' ? '🛵 دليفري' : '🥡 تيك أواي');
  }

  // Pre-fill amount paid exact
  const paidInput = document.getElementById('checkoutAmountPaid');
  if (paidInput) paidInput.value = netTotal.toFixed(2);

  // Default to Cash
  selectPaymentMethodCard('نقدي');

  openModal('checkoutModal');
  setTimeout(() => {
    if (paidInput) {
      paidInput.focus();
      paidInput.select();
    }
  }, 150);
}

async function executeConfirmedCheckout(withPrint = true) {
  const paidVal = document.getElementById('checkoutAmountPaid')?.value;
  if (paidVal === '' || isNaN(parseFloat(paidVal)) || parseFloat(paidVal) < 0) {
    Swal.fire('تنبيه', 'يرجى إدخال المبلغ المدفوع بشكل صحيح (أو 0 في حالة الآجل)', 'warning');
    return;
  }
  
  const paid = parseFloat(paidVal);
  const method = document.getElementById('selectedPaymentMethod')?.value || 'نقدي';
  
  // Sync hidden fields on main page
  const mainPaidEl = document.getElementById('amountPaid');
  if (mainPaidEl) mainPaidEl.value = paid;
  
  // Determine treasury_type
  let treasuryType = 'الخزينة';
  if (method === 'فودافون كاش') treasuryType = 'فودافون كاش';
  else if (method === 'إنستا باي') treasuryType = 'إنستا باي';
  else if (method === 'فيزا') treasuryType = 'فيزا';

  closeModal('checkoutModal');
  
  const success = await doSaveInvoice({
    payment_method: method,
    treasury_type: treasuryType,
    amount_paid: paid
  }, withPrint);

  if (success) {
    if (currentOrderType === 'تيك أواي') {
      try {
        printKitchenTicket(invoiceItems);
      } catch (kErr) { console.error('Kitchen ticket print error:', kErr); }

      if (withPrint) {
        setTimeout(() => {
          printReceipt(false);
        }, 400);
      } else {
        showToast('تم حفظ الفاتورة وإرسال البون للمطبخ بنجاح ✓', 'success');
      }
    } else {
      if (withPrint) {
        printReceipt(false);
      } else {
        showToast('تم حفظ الفاتورة بنجاح ✓', 'success');
      }
    }
    const settledTableId = currentTableId;
    if (settledTableId) {
      try { await window.tables.updateStatus(settledTableId, 'فاضية'); } catch(e){}
    }
    await newInvoice();
    openOrderTypeGateModal();
  }
}

async function fastCashCheckout() {
  if (!invoiceItems.length) {
    showToast('لا توجد أصناف في الطلب', 'error');
    return;
  }
  const netText = document.getElementById('netTotalDisplay')?.textContent || '0';
  const netTotal = parseFloat(netText.replace(/[^\d.]/g, '')) || 0;
  
  const mainPaidEl = document.getElementById('amountPaid');
  if (mainPaidEl) mainPaidEl.value = netTotal;
  
  const settledTableId = currentTableId;
  const isTakeaway = currentOrderType === 'تيك أواي';
  const itemsSnapshot = [...invoiceItems];

  const success = await doSaveInvoice({
    payment_method: 'نقدي',
    treasury_type: 'الخزينة',
    amount_paid: netTotal
  }, false);

  if (success) {
    if (isTakeaway) {
      try {
        printKitchenTicket(itemsSnapshot);
      } catch (kErr) { console.error('Kitchen ticket print error:', kErr); }
      setTimeout(() => {
        printReceipt(false);
      }, 400);
    }
    showToast(`⚡ تم الدفع كاش سريع (${fmt(netTotal)} ج.م) بنجاح ✓`, 'success');
    if (settledTableId) {
      try { await window.tables.updateStatus(settledTableId, 'فاضية'); } catch(e){}
    }
    await newInvoice();
    openOrderTypeGateModal();
  }
}

// ─── Button Interceptors ──────────────────────────────────────────────────────
async function saveInvoice() {
  await openCheckoutModal('save');
}

async function saveAndPrint() {
  await openCheckoutModal('saveAndPrint');
}

async function savePrintAndWhatsApp() {
  await openCheckoutModal('saveAndPrint');
}

// ─── Kitchen Ticket Silent Printing ───────────────────────────────────────────
async function sendOrderToKitchen() {
  if (!invoiceItems.length) {
    showToast('لا توجد أصناف في الطلب لإرسالها للمطبخ', 'error');
    return;
  }

  // Calculate diff items: items with unsent quantities
  const diffItems = invoiceItems
    .map(it => {
      const sent = Number(it.sent_qty || 0);
      const curr = Number(it.quantity || 1);
      const diff = curr - sent;
      return { ...it, diffQty: diff };
    })
    .filter(it => it.diffQty > 0);

  if (!diffItems.length) {
    showToast('تم إرسال جميع الأصناف والكميات الحالية للمطبخ مسبقاً ✓', 'info');
    return;
  }

  // Update sent_qty for all items to match current quantity
  invoiceItems.forEach(it => {
    it.sent_qty = Number(it.quantity || 1);
  });

  const subtotal = parseFloat(document.getElementById('subtotalDisplay')?.textContent) || 0;
  const discountAmt = parseFloat(document.getElementById('discountAmount')?.value) || 0;
  const discountPct = parseFloat(document.getElementById('discountPercent')?.value) || 0;
  const netText = document.getElementById('netTotalDisplay')?.textContent || '0';
  const netTotal = parseFloat(netText.replace(/[^\d.]/g, '')) || 0;
  const tableId = currentOrderType === 'صالة' ? (parseInt(document.getElementById('posTableSelect')?.value) || null) : null;
  const driverId = currentOrderType === 'دليفري' ? (parseInt(document.getElementById('posDriverSelect')?.value) || null) : null;
  const deliveryFee = currentOrderType === 'دليفري' ? (parseFloat(document.getElementById('posDeliveryFee')?.value) || 0) : 0;

  const calc = window._lastCalc || {};
  const invoiceData = {
    id: currentInvoiceId || undefined,
    table_id: tableId,
    driver_id: driverId,
    delivery_fee: deliveryFee,
    delivery_status: currentOrderType === 'دليفري' ? 'قيد التجهيز' : null,
    customer_id: parseInt(document.getElementById('customerSelect')?.value) || null,
    employee_id: parseInt(document.getElementById('employeeSelect')?.value) || parseInt(sessionStorage.getItem('photoStudio_employeeId')) || null,
    invoice_date: document.getElementById('invoiceDate')?.value || getLocalISODate(),
    invoiceNumber: currentInvoiceNumber || null,
    payment_method: 'نقدي',
    invoice_type: currentOrderType,
    order_type: currentOrderType,
    treasury_type: 'الخزينة',
    subtotal, discount_percent: discountPct, discount_amount: discountAmt,
    net_total: netTotal, amount_paid: 0, remaining: netTotal,
    status: 'مرسلة للمطبخ',
    tax_rate: calc.taxRate || 0,
    tax_amount: calc.taxAmount || 0,
    service_rate: calc.serviceRate || 0,
    service_amount: calc.serviceAmount || 0
  };

  const res = await window.db.saveInvoice(invoiceData, invoiceItems);
  if (res.success) {
    currentInvoiceId = res.data.invoiceId || currentInvoiceId;
    currentInvoiceNumber = res.data.invoiceNumber || currentInvoiceNumber;
    document.getElementById('invoiceNumberDisplay').textContent = currentInvoiceNumber;

    // Silent print to Kitchen Thermal Printer: ONLY diff items
    printKitchenTicket(diffItems);
    showToast('تم إرسال الأصناف الجديدة للمطبخ بنجاح 🍳', 'success');
    renderItemsTable();
    await loadTables();
  } else {
    showToast('فشل إرسال الطلب للمطبخ: ' + res.error, 'error');
  }
}

function printKitchenTicket(diffItems = null) {
  const container = document.getElementById('kitchenPrint');
  if (!container) return;
  const rp = document.getElementById('receiptPrint');
  if (rp) rp.innerHTML = '';

  const time = new Date().toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' });
  const tblName = getSelectedTableName();

  const orderTitle = currentOrderType === 'صالة' 
    ? `🍽️ صالة (${tblName || 'ترابيزة'})` 
    : (currentOrderType === 'دليفري' ? '🛵 دليفري' : '🥡 سفري / تيك أواي');

  const itemsToPrint = diffItems && diffItems.length ? diffItems : invoiceItems;

  const itemsRows = itemsToPrint.map(it => {
    const printQty = it.diffQty !== undefined ? it.diffQty : it.quantity;
    return `
      <tr style="border-bottom:1.5px dashed #000;">
        <td style="padding:4px 0; vertical-align:middle;">
          <div style="font-size:16px; font-weight:900; line-height:1.2; color:#000;">
            ${escapeHtml(it.service_name)}
          </div>
          ${it.notes ? `
            <div style="font-size:13px; font-weight:900; color:#000; background:#f0f0f0; border-right:3px solid #000; padding:2px 6px; margin-top:2px; display:inline-block;">
              ↳ *** ${escapeHtml(it.notes)} ***
            </div>
          ` : ''}
        </td>
        <td style="font-size:22px; font-weight:900; text-align:center; vertical-align:middle; width:48px; padding:4px 0; color:#000;">
          ${printQty}
        </td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <div style="width:100%; box-sizing:border-box; font-family:'Cairo',Arial,sans-serif; direction:rtl; padding:1mm 2mm; color:#000; margin:0 auto;">
      <!-- Header: No logo, compact & bold -->
      <div style="text-align:center; border-bottom:2px solid #000; padding-bottom:3px; margin-bottom:3px;">
        <div style="font-size:18px; font-weight:900; letter-spacing:0.5px;">🍳 بون مطبخ / بار</div>
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:15px; font-weight:900; margin-top:2px;">
          <span>${orderTitle}</span>
          <span>#${currentInvoiceNumber}</span>
        </div>
        <div style="text-align:left; font-size:11px; font-weight:800; color:#333; margin-top:1px;">
          الوقت: ${time}
        </div>
      </div>

      <!-- Items Table -->
      <table style="width:100%; border-collapse:collapse; text-align:right; margin:2px 0;">
        <thead>
          <tr style="border-bottom:2px solid #000; font-size:13px; font-weight:900;">
            <th style="padding:2px 0;">الصنف والتخصيص</th>
            <th style="text-align:center; width:48px; padding:2px 0;">الكمية</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows}
        </tbody>
      </table>
    </div>
  `;

  const kitchenPrinter = settings.printer_kitchen || '';
  window.electron.print({ deviceName: kitchenPrinter });
}

// ─── Actual Save Invoice ──────────────────────────────────────────────────────
async function doSaveInvoice(checkoutData, isPrint = false) {
  const subtotal = parseFloat(document.getElementById('subtotalDisplay')?.textContent) || 0;
  const discountAmt = parseFloat(document.getElementById('discountAmount')?.value) || 0;
  const discountPct = parseFloat(document.getElementById('discountPercent')?.value) || 0;
  const netText = document.getElementById('netTotalDisplay')?.textContent || '0';
  const netTotal = parseFloat(netText.replace(/[^\d.]/g, '')) || 0;
  const amtPaid = Number(checkoutData.amount_paid || 0);
  const remaining = Math.max(0, netTotal - amtPaid);

  const tableId = currentOrderType === 'صالة' ? (parseInt(document.getElementById('posTableSelect')?.value) || null) : null;
  const driverId = currentOrderType === 'دليفري' ? (parseInt(document.getElementById('posDriverSelect')?.value) || null) : null;
  const deliveryFee = currentOrderType === 'دليفري' ? (parseFloat(document.getElementById('posDeliveryFee')?.value) || 0) : 0;

  const calc = window._lastCalc || {};

  const invoiceData = {
    id: currentInvoiceId || undefined,
    customer_id: parseInt(document.getElementById('customerSelect')?.value) || null,
    employee_id: parseInt(document.getElementById('employeeSelect')?.value) || parseInt(sessionStorage.getItem('photoStudio_employeeId')) || null,
    table_id: tableId,
    driver_id: driverId,
    delivery_status: currentOrderType === '\u062f\u0644\u064a\u0641\u0631\u064a' ? (remaining <= 0 && amtPaid > 0 ? '\u062a\u0645 \u0627\u0644\u062a\u0633\u0644\u064a\u0645' : '\u0642\u064a\u062f \u0627\u0644\u062a\u062c\u0647\u064a\u0632') : null,
    delivery_fee: deliveryFee,
    invoice_date: document.getElementById('invoiceDate')?.value || getLocalISODate(),
    invoiceNumber: currentInvoiceNumber || null,
    payment_method: checkoutData.payment_method || '\u0646\u0642\u062f\u064a',
    invoice_type: currentOrderType,
    order_type: currentOrderType,
    treasury_type: checkoutData.treasury_type || '\u0627\u0644\u062e\u0632\u064a\u0646\u0629',
    subtotal,
    discount_percent: discountPct,
    discount_amount: discountAmt,
    net_total: netTotal,
    amount_paid: amtPaid,
    remaining,
    notes: document.getElementById('invoiceNotes')?.value || null,
    status: remaining <= 0 && amtPaid > 0 ? '\u0645\u062d\u0627\u0633\u064e\u0628\u0629' : '\u0645\u0641\u062a\u0648\u062d\u0629',
    tax_rate: calc.taxRate || 0,
    tax_amount: calc.taxAmount || 0,
    service_rate: calc.serviceRate || 0,
    service_amount: calc.serviceAmount || 0
  };

  const res = await window.db.saveInvoice(invoiceData, invoiceItems);
  if(res.success){
    currentInvoiceId = res.data.invoiceId;
    currentInvoiceNumber = res.data.invoiceNumber || currentInvoiceNumber;

    const custPhone = getSelectedCustomerPhone();
    const custName = getSelectedCustomerName();
    lastSavedInvoice = { 
      ...invoiceData, 
      id: res.data.invoiceId,
      items:[...invoiceItems], 
      invoiceNumber:res.data.invoiceNumber,
      customer_phone: custPhone,
      customer_name: custName
    };

    await reloadServicesStock();
    await loadTables();
    showToast('تم حفظ الفاتورة بنجاح', 'success');

    return true;
  } else {
    showToast('خطأ في الحفظ: '+res.error,'error');
    return false;
  }
}

// ── مساعد: جلب رقم هاتف العميل المختار ──────────────────────────────────────
function getSelectedCustomerPhone() {
  const custId = document.getElementById('customerSelect').value;
  if (!custId || !window.allCustomers) return null;
  const cust = window.allCustomers.find(c => c.id === parseInt(custId));
  return cust?.phone || null;
}

function getSelectedCustomerName() {
  const custId = document.getElementById('customerSelect').value;
  if (!custId || !window.allCustomers) return 'عميلنا العزيز';
  const cust = window.allCustomers.find(c => c.id === parseInt(custId));
  return cust?.name || 'عميلنا العزيز';
}

// ── إرسال واتساب من نافذة النجاح (بعد حفظ الفاتورة) ──────────────────────────
async function sendWhatsApp() {
  if (!lastSavedInvoice) { showToast('لا توجد فاتورة محفوظة', 'error'); return; }

  const phone = lastSavedInvoice.customer_phone || getSelectedCustomerPhone();
  if (!phone) { showToast('العميل ليس لديه رقم هاتف مسجل', 'warning'); return; }

  const waBtn = document.getElementById('savedModalWaBtn');
  let originalBtnHtml = '';
  if (waBtn) {
    originalBtnHtml = waBtn.innerHTML;
    waBtn.disabled = true;
    waBtn.style.opacity = '0.7';
    waBtn.innerHTML = `جاري الإرسال...`;
  }

  showToast('جاري إرسال واتساب للعميل...', 'info');

  try {
    const status = await window.whatsapp.getStatus();
    if (!status.ready) {
      showToast('واتساب غير متصل — يرجى فتح الواتساب ومسح رمز QR من الإعدادات', 'warning');
      if (waBtn) {
        waBtn.disabled = false;
        waBtn.style.opacity = '1';
        waBtn.innerHTML = originalBtnHtml;
      }
      return;
    }

    const shopName = settings.company_name || 'كافيه ومطعم برو';
    const customerName = lastSavedInvoice.customer_name || getSelectedCustomerName();
    
    let sellerName = 'غير محدد';
    const empSelect = document.getElementById('employeeSelect');
    if (empSelect && empSelect.selectedIndex >= 0) {
      sellerName = empSelect.options[empSelect.selectedIndex]?.text || 'غير محدد';
    }
    const now = new Date();
    const timeStr = now.toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute:'2-digit' });

    const res = await window.whatsapp.sendInvoiceConfirm({
      phone,
      customerName,
      invoiceNumber: lastSavedInvoice.invoiceNumber,
      total: fmt(lastSavedInvoice.net_total || 0),
      paid: fmt(lastSavedInvoice.amount_paid || 0),
      remaining: fmt(lastSavedInvoice.remaining || 0),
      shopName,
      sellerName: sellerName,
      date: lastSavedInvoice.invoice_date,
      time: timeStr
    });

    if (res && res.success) {
      showToast('تم إرسال واتساب للعميل بنجاح ✓', 'success');
      if (waBtn) {
        waBtn.disabled = false;
        waBtn.style.opacity = '1';
        waBtn.style.background = '#16a34a';
        waBtn.style.borderColor = '#16a34a';
        waBtn.innerHTML = `✓ تم الإرسال`;
      }
    } else {
      showToast(`فشل الإرسال: ${res?.error || 'خطأ غير معروف'}`, 'error');
      if (waBtn) {
        waBtn.disabled = false;
        waBtn.style.opacity = '1';
        waBtn.innerHTML = originalBtnHtml;
      }
    }
  } catch (err) {
    showToast(`خطأ في الإرسال: ${err.message}`, 'error');
    if (waBtn) {
      waBtn.disabled = false;
      waBtn.style.opacity = '1';
      waBtn.innerHTML = originalBtnHtml;
    }
  }
}

// ── إرسال واتساب من سجل الفواتير ───────────────────────────────────────────────
async function sendWhatsAppFromHistory(inv) {
  const phone = inv.customer_phone;
  if (!phone) { showToast('العميل ليس لديه رقم هاتف مسجل', 'warning'); return; }

  showToast('جاري إرسال واتساب للعميل...', 'info');

  try {
    const status = await window.whatsapp.getStatus();
    if (!status.ready) {
      showToast('واتساب غير متصل — تحقق من الإعدادات', 'warning');
      return;
    }

    const shopName = settings.company_name || 'كافيه ومطعم برو';
    const customerName = inv.customer_name || 'عميلنا العزيز';

    const res = await window.whatsapp.sendInvoiceConfirm({
      phone, 
      customerName,
      invoiceNumber: inv.invoice_number,
      total: fmt(inv.net_total || 0),
      paid: fmt(inv.amount_paid || 0),
      remaining: fmt(inv.remaining || 0),
      shopName,
      sellerName: inv.emp_name || 'غير محدد',
      date: inv.invoice_date || '',
      time: ''
    });

    if (res && res.success) {
      showToast('تم إرسال واتساب للعميل بنجاح ✓', 'success');
    } else {
      showToast(`فشل الإرسال: ${res?.error || 'خطأ غير معروف'}`, 'error');
    }
  } catch (err) {
    showToast(`خطأ في الإرسال: ${err.message}`, 'error');
  }
}

// ─── Print Receipt ────────────────────────────────────────────────────────────
function buildReceiptHTML(inv) {
  const curr = settings.currency || 'ج.م';
  const invNum = inv.invoiceNumber || inv.invoice_number || currentInvoiceNumber;
  const date = inv.invoice_date || new Date().toLocaleDateString('ar-EG-u-nu-latn');
  const time = new Date().toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' });
  const subtotal = fmt(inv.subtotal || 0);
  const discount = fmt(inv.discount_amount || 0);
  const net = fmt(inv.net_total || 0);
  const paid = fmt(inv.amount_paid || 0);
  const remaining = fmt(inv.remaining || 0);
  const hasDiscount = parseFloat(inv.discount_amount || 0) > 0;
  const deliveryFee = parseFloat(inv.delivery_fee || 0);
  const serviceAmount = parseFloat(inv.service_amount || (window._lastCalc?.serviceAmount) || 0);
  const serviceRate = parseFloat(inv.service_rate || (window._lastCalc?.serviceRate) || 0);
  const taxAmount = parseFloat(inv.tax_amount || (window._lastCalc?.taxAmount) || 0);
  const taxRate = parseFloat(inv.tax_rate || (window._lastCalc?.taxRate) || 0);
  const taxType = inv.tax_type || settings.tax_type || 'exclusive';

  // Logo: prominent and centered
  const safeLogo = settings.logo_path ? 'file:///' + settings.logo_path.replace(/\\/g, '/') : '';
  const logoHTML = safeLogo ? `<div style="text-align:center; margin:0 auto 8px;"><img src="${safeLogo}" style="max-height:80px; max-width:220px; object-fit:contain; display:block; margin:0 auto;"></div>` : '';
  
  // Compact contact info
  let contactDetails = [];
  if (settings.phone) contactDetails.push(`ت: ${settings.phone}`);
  if (settings.address) contactDetails.push(settings.address);
  const contactHTML = contactDetails.length > 0 
    ? `<div style="text-align:center; font-size:11px; font-weight:800; color:#333; margin-bottom:2px;">${contactDetails.join(' | ')}</div>` 
    : '';

  // Customer Name
  let custName = '';
  if (inv.customer_name && inv.customer_name !== 'عميل نقدي') {
    custName = inv.customer_name;
  } else if (inv.customer_id && window.allCustomers) {
    const c = window.allCustomers.find(x => x.id == inv.customer_id);
    if (c && c.name && c.name !== 'عميل نقدي') custName = c.name;
  }

  // Order type title
  let orderTypeStr = inv.invoice_type || currentOrderType || 'تيك أواي';
  if (orderTypeStr === 'صالة') {
    const tblName = getSelectedTableName();
    orderTypeStr = `🍽️ صالة (${tblName || 'ترابيزة'})`;
  } else if (orderTypeStr === 'دليفري') {
    orderTypeStr = '🛵 دليفري';
  } else {
    orderTypeStr = '🥡 سفري';
  }

  // Items: 3 compact columns with VERY BOLD typography
  const items = inv.items || invoiceItems;
  const itemsRows = items.map((item) => `
    <tr style="border-bottom:1px dashed #666;">
      <td style="padding:3px 1px; vertical-align:middle;">
        <div style="font-size:13px; font-weight:900; line-height:1.2; color:#000;">
          ${escapeHtml(item.service_name)}
        </div>
        ${item.notes ? `<div style="font-size:11px; font-weight:800; color:#333; margin-top:1px;">↳ ${escapeHtml(item.notes)}</div>` : ''}
      </td>
      <td style="text-align:center; padding:3px 1px; font-size:14px; font-weight:900; vertical-align:middle; width:38px;">
        ${item.quantity}
      </td>
      <td style="text-align:left; padding:3px 1px; font-size:13px; font-weight:900; vertical-align:middle; width:65px;">
        ${fmt(item.total)}
      </td>
    </tr>
  `).join('');

  const notesStr = inv.notes || document.getElementById('invoiceNotes')?.value || '';
  const notesHTML = notesStr ? `<div style="font-size:11px; font-weight:800; border-top:1px dashed #000; padding-top:2px; margin-top:2px;">ملاحظات: ${escapeHtml(notesStr)}</div>` : '';
  const receiptFooterHTML = settings.receipt_footer ? `<div style="text-align:center; font-weight:900; font-size:12px; margin-top:3px;">${settings.receipt_footer}</div>` : `<div style="text-align:center; font-weight:900; font-size:12px; margin-top:3px;">شكراً لزيارتكم ☕</div>`;
  const settingsNotesHTML = settings.receipt_notes ? `<div style="text-align:center; font-size:10px; font-weight:700; margin-top:1px; color:#444;">${settings.receipt_notes}</div>` : '';

  return `
    <div class="receipt" style="
      width:68mm;
      box-sizing:border-box;
      font-family:'Cairo',Arial,sans-serif;
      color:#000;
      direction:rtl;
      padding:1mm 2mm;
      margin:0 auto;
      -webkit-print-color-adjust:exact;
      print-color-adjust:exact;
    ">
      ${logoHTML}
      <div style="text-align:center; font-size:18px; font-weight:900; line-height:1.2; margin-bottom:2px; letter-spacing:0.3px;">
        ${settings.company_name || 'كافيه ومطعم برو'}
      </div>
      ${contactHTML}

      <!-- Compact Meta Divider -->
      <div style="border-top:1.5px dashed #000; margin:2px 0;"></div>
      <div style="display:flex; justify-content:space-between; font-size:12px; font-weight:900; line-height:1.3;">
        <span>فاتورة: #${invNum}</span>
        <span>${orderTypeStr}</span>
      </div>
      <div style="display:flex; justify-content:space-between; font-size:11px; font-weight:800; color:#222; line-height:1.3;">
        <span>${date} ${time}</span>
        ${custName ? `<span>العميل: ${escapeHtml(custName)}</span>` : ''}
      </div>
      <div style="border-top:1.5px dashed #000; margin:2px 0;"></div>

      <!-- Items Table: Bold, clear, compact -->
      <table style="width:100%; border-collapse:collapse; text-align:right; margin:2px 0;">
        <thead>
          <tr style="border-bottom:1.5px solid #000; font-size:12px; font-weight:900;">
            <th style="padding:2px 1px;">الصنف والتخصيص</th>
            <th style="text-align:center; width:38px; padding:2px 1px;">الكمية</th>
            <th style="text-align:left; width:65px; padding:2px 1px;">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows}
        </tbody>
      </table>

      <!-- Totals: Compact and Super Bold -->
      <div style="border-top:1px dashed #000; margin:2px 0;"></div>
      ${hasDiscount ? `
        <div style="display:flex; justify-content:space-between; font-size:11px; font-weight:800;">
          <span>الإجمالي قبل الخصم:</span>
          <span>${subtotal} ${curr}</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:11px; font-weight:800; color:#000;">
          <span>قيمة الخصم:</span>
          <span>-${discount} ${curr}</span>
        </div>
      ` : ''}
      ${deliveryFee > 0 ? `
        <div style="display:flex; justify-content:space-between; font-size:11px; font-weight:800;">
          <span>خدمة التوصيل:</span>
          <span>+${fmt(deliveryFee)} ${curr}</span>
        </div>
      ` : ''}
      ${serviceAmount > 0 ? `
        <div style="display:flex; justify-content:space-between; font-size:11px; font-weight:800; color:#5b21b6;">
          <span>خدمة الصالة (${serviceRate}%):</span>
          <span>+${fmt(serviceAmount)} ${curr}</span>
        </div>
      ` : ''}
      ${taxAmount > 0 ? `
        <div style="display:flex; justify-content:space-between; font-size:11px; font-weight:800; color:#92400e;">
          <span>ضريبة ق.م (${taxRate}% ${taxType === 'inclusive' ? 'شامل' : ''}):</span>
          <span>+${fmt(taxAmount)} ${curr}</span>
        </div>
      ` : ''}

      <!-- Net Total: Huge & Bold -->
      <div style="border-top:2px solid #000; border-bottom:2px solid #000; padding:2px 0; margin:2px 0; display:flex; justify-content:space-between; font-size:17px; font-weight:900;">
        <span>الصافي المطلوب:</span>
        <span>${net} ${curr}</span>
      </div>

      <!-- Paid & Remaining on a single line -->
      <div style="display:flex; justify-content:space-between; font-size:12px; font-weight:800; margin-top:2px;">
        <span>المدفوع: ${paid} ${curr}</span>
        <span>${parseFloat(inv.remaining || 0) > 0 ? `المتبقي: ${remaining}` : `الباقي: 0.00`} ${curr}</span>
      </div>

      ${notesHTML}
      <div style="border-top:1px dashed #000; margin:3px 0 2px;"></div>
      ${receiptFooterHTML}
      ${settingsNotesHTML}
    </div>
  `;
}

async function reversePaymentPrompt(invoiceId, amountPaid) {
  const res = await Swal.fire({
    title: 'إرجاع التسديد',
    text: `المبلغ المسدد الحالي هو ${amountPaid} جنيه. ما هو المبلغ الذي تريد إرجاعه؟`,
    input: 'number',
    inputAttributes: { min: 1, max: amountPaid, step: 0.5 },
    inputValue: amountPaid,
    showCancelButton: true,
    confirmButtonText: 'إرجاع',
    cancelButtonText: 'إلغاء'
  });
  if (res.isConfirmed && res.value) {
    const amt = parseFloat(res.value);
    if (amt > 0 && amt <= amountPaid) {
      const dbRes = await window.db.reversePayment(invoiceId, amt);
      if (dbRes.success) {
        showToast('تم إرجاع التسديد بنجاح', 'success');
        openHistoryModal(); // refresh
      } else {
        showToast('خطأ: ' + dbRes.error, 'error');
      }
    } else {
      showToast('مبلغ غير صحيح', 'error');
    }
  }
}

function printAndReset() {
  printReceipt(false);
}

async function directPrintReceipt(withWhatsApp = false) {
  try {
    const inv = lastSavedInvoice || {
      items: invoiceItems,
      invoice_date: document.getElementById('invoiceDate').value,
      subtotal: parseFloat(document.getElementById('subtotalDisplay').textContent) || 0,
      discount_amount: parseFloat(document.getElementById('discountAmount').value) || 0,
      net_total: parseFloat(document.getElementById('netTotalDisplay').textContent) || 0,
      amount_paid: parseFloat(document.getElementById('amountPaid').value) || 0,
      remaining: parseFloat(document.getElementById('remainingDisplay').textContent) || 0
    };
    const receiptHTML = buildReceiptHTML(inv);
    document.getElementById('receiptPrint').innerHTML = receiptHTML;
    
    // Print directly using configured printer if available
    await new Promise(r => setTimeout(r, 120));
    await window.electron.print(settings.printer_receipt ? { deviceName: settings.printer_receipt } : {});
    await new Promise(r => setTimeout(r, 500));
    
    if (withWhatsApp) {
      await sendWhatsApp();
    }
    
    // Start fresh invoice after direct printing/messaging
    newInvoice();
  } catch (err) {
    showToast('حدث خطأ في الطباعة: ' + err.message, 'error');
  }
}

function printReceipt(withWhatsApp = false) {
  directPrintReceipt(withWhatsApp);
}

async function reloadServicesStock() {
  try {
    const srvRes = await window.db.query('SELECT s.*, sc.name as cat_name FROM services s LEFT JOIN service_categories sc ON s.category_id=sc.id ORDER BY s.name', []);
    if (srvRes.success && srvRes.data) {
      allServices = srvRes.data;
      populateServiceSelect(allServices);
      renderServiceGrid(allServices);
    }
  } catch (e) {
    console.error('reloadServicesStock error:', e);
  }
}

// ─── New / Reset Invoice ──────────────────────────────────────────────────────
async function newInvoice() {
  invoiceItems = [];
  lastSavedInvoice = null;
  currentInvoiceId = null;
  currentTableId = null;
  const tblSel = document.getElementById('posTableSelect');
  if (tblSel) tblSel.value = '';
  const cartTitle = document.getElementById('cartOrderTitle');
  if (cartTitle) cartTitle.textContent = 'طلب جديد';

  renderItemsTable();
  recalcTotals();
  const dPct = document.getElementById('discountPercent');
  const dAmt = document.getElementById('discountAmount');
  const aPaid = document.getElementById('amountPaid');
  const notes = document.getElementById('invoiceNotes');
  const cSearch = document.getElementById('customerSearchInput');
  const cSel = document.getElementById('customerSelect');
  const iDate = document.getElementById('invoiceDate');

  if (dPct) dPct.value = '0';
  if (dAmt) dAmt.value = '0';
  if (aPaid) aPaid.value = '0';
  if (notes) notes.value = '';
  if (cSearch) cSearch.value = '';
  if (cSel) cSel.value = '';
  if (iDate) iDate.value = getLocalISODate();

  window._resumedInvoiceNumber = null;
  window._resumedPaymentMethod = null;
  closeModal('savedModal');
  await reloadServicesStock();
  await loadTables();

  const invRes = await window.db.generateInvoiceNumber();
  if (invRes.success) {
    currentInvoiceNumber = invRes.data;
    document.getElementById('invoiceNumberDisplay').textContent = invRes.data;
  }
}

function resetInvoice() {
  if(!invoiceItems.length) return;
  Swal.fire({
    title: 'هل أنت متأكد؟',
    text: "سيتم مسح جميع الأصناف من الفاتورة!",
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#3085d6',
    confirmButtonText: 'نعم، امسح',
    cancelButtonText: 'إلغاء'
  }).then((result) => {
    if (result.isConfirmed) {
      invoiceItems=[]; renderItemsTable(); recalcTotals();
    }
  });
}

function deleteInvoice() {
  Swal.fire({
    title: 'إلغاء الفاتورة؟',
    text: "سيتم إلغاء هذه الفاتورة والبدء من جديد",
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#3085d6',
    confirmButtonText: 'نعم، إلغاء',
    cancelButtonText: 'تراجع'
  }).then((result) => {
    if (result.isConfirmed) newInvoice();
  });
}

// ─── New Customer ─────────────────────────────────────────────────────────────
function openNewCustomerModal(){ openModal('newCustomerModal'); }
async function saveNewCustomer(){
  const name = document.getElementById('nc_name').value.trim();
  if(!name){ showToast('يرجى إدخال اسم العميل','error'); return; }
  const phoneVal = document.getElementById('nc_phone').value.trim();

  // التحقق من عدم تكرار رقم التليفون
  if (phoneVal) {
    const checkPhone = await window.db.queryOne(
      `SELECT id, name FROM customers WHERE phone=? LIMIT 1`, [phoneVal]
    );
    if (checkPhone.success && checkPhone.data) {
      showToast(`رقم التليفون "${phoneVal}" مسجل مسبقاً للعميل: ${checkPhone.data.name}`, 'error');
      return;
    }
  }

  const res = await window.db.run(
    `INSERT INTO customers (name,phone,address,opening_balance,current_balance) VALUES (?,?,?,?,?)`,
    [name, phoneVal, document.getElementById('nc_address').value.trim(),
      parseFloat(document.getElementById('nc_balance').value)||0, parseFloat(document.getElementById('nc_balance').value)||0]
  );
  if(res.success){
    // Update global array
    const newId = res.lastInsertRowid;
    if(!window.allCustomers) window.allCustomers = [];
    window.allCustomers.push({ id: newId, name: name, phone: phoneVal });
    
    // Update datalist
    const cList = document.getElementById('customersList');
    cList.innerHTML += `<option value="${name} - ${phoneVal}" data-id="${newId}" data-phone="${phoneVal}"></option>`;
    
    // Auto select
    document.getElementById('customerSearchInput').value = `${name} - ${phoneVal}`;
    document.getElementById('customerSelect').value = newId;

    showToast(`تم إضافة العميل "${name}" `,'success');
    closeModal('newCustomerModal');
    document.getElementById('nc_name').value='';
    document.getElementById('nc_phone').value='';
    document.getElementById('nc_address').value='';
    document.getElementById('nc_balance').value='0';
  } else { showToast('خطأ: '+res.error,'error'); }
}

// ─── Navigation ───────────────────────────────────────────────────────────────
async function goBack() {
  if (invoiceItems && invoiceItems.length > 0) {
    const res = await Swal.fire({
      title: 'تنبيه',
      text: 'الأصناف الموجودة في الفاتورة سيتم مسحها. هل تريد الرجوع؟',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'نعم، رجوع',
      cancelButtonText: 'إلغاء'
    });
    if (!res.isConfirmed) return;
  }
  navigate('main-dashboard.html');
}

// ─── Keyboard ─────────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id === 'itemBarcode') {
    e.preventDefault();
    lookupBarcode();
  }
  if (e.key === 'F1') {
    e.preventDefault();
    openCheckoutModal('saveAndPrint');
  }
  if (e.key === 'F2') {
    e.preventDefault();
    fastCashCheckout();
  }
  if (e.key === 'F3') {
    e.preventDefault();
    sendOrderToKitchen();
  }
  if (e.key === 'Escape') {
    const gateModal = document.getElementById('orderTypeGateModal');
    if (gateModal && gateModal.classList.contains('open')) {
      e.preventDefault();
      closeOrderTypeGateModal();
      return;
    }
    const resModal = document.getElementById('posReserveTableModal');
    if (resModal && resModal.classList.contains('open')) {
      e.preventDefault();
      closeModal('posReserveTableModal');
      return;
    }
    const tablePickerModal = document.getElementById('posTablePickerModal');
    if (tablePickerModal && tablePickerModal.classList.contains('open')) {
      e.preventDefault();
      closeModal('posTablePickerModal');
      return;
    }
    const itemModModal = document.getElementById('itemModifierModal');
    if (itemModModal && itemModModal.classList.contains('open')) {
      e.preventDefault();
      closeModal('itemModifierModal');
      return;
    }
    const checkoutModal = document.getElementById('checkoutModal');
    if (checkoutModal && checkoutModal.classList.contains('open')) {
      e.preventDefault();
      closeModal('checkoutModal');
      return;
    }
    const savedModal = document.getElementById('savedModal');
    if (savedModal && savedModal.classList.contains('open')) {
      e.preventDefault();
      newInvoice();
      return;
    }
    const historyModal = document.getElementById('historyModal');
    if (historyModal && historyModal.classList.contains('open')) {
      e.preventDefault();
      closeModal('historyModal');
      return;
    }
    goBack();
  }
});

// ─── Invoices History ───────────────────────────────────────────────────────────
async function openHistoryModal() {
  document.getElementById('posHistorySearch').value = '';
  if (document.getElementById('posHistoryPhone')) document.getElementById('posHistoryPhone').value = '';

  // جلب آخر 300 فاتورة فقط — لتجنب بطء الجلب عند كثرة الفواتير
  const res = await window.db.query(`
    SELECT i.*, 
           c.name as customer_name, 
           c.phone as customer_phone,
           (i.net_total - COALESCE((SELECT SUM(total_returned) FROM returns WHERE original_invoice_id = i.id), 0)) as dynamic_net_total
    FROM invoices i 
    LEFT JOIN customers c ON i.customer_id = c.id
    ORDER BY i.id DESC
    LIMIT 300
  `, []);
  if (res.success && res.data) {
    posAllInvoices = res.data;
  } else {
    posAllInvoices = [];
  }
  
  renderPosHistory(posAllInvoices.slice(0, 30));
  openModal('historyModal');
}

async function reprintPastInvoice(inv) {
  closeModal('historyModal');
  
  // Fetch items for this invoice
  const itemsRes = await window.db.query('SELECT * FROM invoice_items WHERE invoice_id = ?', [inv.id]);
  const items = itemsRes.success ? itemsRes.data : [];
  
  // Reuse existing receipt logic
  lastSavedInvoice = {
    ...inv,
    items: items,
    customer_name: inv.customer_name,
    customer_phone: inv.customer_phone
  };
  
  printReceipt();
}

// ─── POS Navigation / Cashier Logout ──────────────────────────────────────────
async function handlePosBackOrLogout() {
  if (sessionRole === 'cashier' && Number(settings.cashier_lock_to_pos) === 1) {
    if (invoiceItems && invoiceItems.length > 0) {
      const warn = await Swal.fire({
        title: 'تنبيه: السلة بها أصناف!',
        text: 'الأصناف الموجودة في الطلب الحالي لم تُحفظ. هل تريد إلغاءها وتسجيل الخروج؟',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'نعم، تسجيل خروج',
        cancelButtonText: 'إلغاء والعودة للطلب'
      });
      if (!warn.isConfirmed) return;
    }
    const ask = await Swal.fire({
      title: 'تسجيل الخروج',
      text: 'هل أنت متأكد من تسجيل الخروج وإنهاء جلسة الكاشير؟',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'تسجيل الخروج',
      cancelButtonText: 'إلغاء'
    });
    if (ask.isConfirmed) {
      await window.auth.logout();
      sessionStorage.clear();
      window.electron.navigate('login.html');
    }
  } else {
    await goBack();
  }
}

// ─── POS Reservation Customer Autocomplete & Quick Linking ────────────────────
function loadReservationCustomersInPOS() {
  const cList = document.getElementById('posReservationCustomersList');
  const pList = document.getElementById('posReservationPhonesList');
  if (!window.allCustomers || !cList || !pList) return;

  cList.innerHTML = window.allCustomers.map(c => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.phone || '')}</option>`).join('');
  pList.innerHTML = window.allCustomers.filter(c => c.phone).map(c => `<option value="${escapeHtml(c.phone)}">${escapeHtml(c.name)}</option>`).join('');
}

function onReservationCustomerNameInput(val, mode) {
  if (!val || !window.allCustomers) return;
  const match = window.allCustomers.find(c => c.name.toLowerCase() === val.trim().toLowerCase());
  if (match && match.phone) {
    const phoneInput = document.getElementById('posReserveCustomerPhone');
    if (phoneInput && !phoneInput.value) {
      phoneInput.value = match.phone;
    }
  }
}

function onReservationCustomerPhoneInput(val, mode) {
  if (!val || !window.allCustomers) return;
  const cleanPhone = val.trim();
  const match = window.allCustomers.find(c => c.phone && c.phone.trim() === cleanPhone);
  if (match) {
    const nameInput = document.getElementById('posReserveCustomerName');
    if (nameInput && !nameInput.value) {
      nameInput.value = match.name;
    }
  }
}

// ─── POS Petty Expenses & Employee Advances ───────────────────────────────────
let currentPosExpenseTab = 'expense';

async function openPosExpenseAdvanceModal() {
  currentPosExpenseTab = 'expense';
  switchPosExpenseTab('expense');

  // Load expense types
  const expTypeSel = document.getElementById('posExpType');
  if (expTypeSel) {
    try {
      const res = await window.db.query('SELECT * FROM expense_types ORDER BY name', []);
      if (res.success && res.data.length > 0) {
        expTypeSel.innerHTML = res.data.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');
      } else {
        expTypeSel.innerHTML = `
          <option value="1">نثريات كافيه</option>
          <option value="2">شراء خامات يومية (نعناع، لبن، ثلج، بن)</option>
          <option value="3">صيانة ونظافة</option>
          <option value="4">إكراميات ونقل</option>
        `;
      }
    } catch(e) {
      expTypeSel.innerHTML = `<option value="1">نثريات كافيه</option>`;
    }
  }

  // Load active employees for advances
  const advEmpSel = document.getElementById('posAdvEmp');
  if (advEmpSel) {
    try {
      const empRes = await window.db.query('SELECT id, name FROM employees WHERE is_active = 1 ORDER BY name', []);
      if (empRes.success && empRes.data) {
        advEmpSel.innerHTML = '<option value="">اختر الموظف</option>' +
          empRes.data.map(e => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('');
      }
    } catch(e) {}
  }

  // Clear inputs
  const expAmt = document.getElementById('posExpAmount');
  const expDesc = document.getElementById('posExpDesc');
  const advAmt = document.getElementById('posAdvAmount');
  const advNotes = document.getElementById('posAdvNotes');
  if (expAmt) expAmt.value = '';
  if (expDesc) expDesc.value = '';
  if (advAmt) advAmt.value = '';
  if (advNotes) advNotes.value = '';

  openModal('posExpenseAdvanceModal');
  setTimeout(() => { if (expAmt) expAmt.focus(); }, 150);
}

function switchPosExpenseTab(tab) {
  currentPosExpenseTab = tab;
  const expForm = document.getElementById('posFormExpense');
  const advForm = document.getElementById('posFormAdvance');
  const expBtn = document.getElementById('posTabExpenseBtn');
  const advBtn = document.getElementById('posTabAdvanceBtn');

  if (tab === 'expense') {
    if (expForm) expForm.style.display = 'block';
    if (advForm) advForm.style.display = 'none';
    if (expBtn) { expBtn.className = 'btn btn-sm btn-primary active'; }
    if (advBtn) { advBtn.className = 'btn btn-sm btn-outline'; }
  } else {
    if (expForm) expForm.style.display = 'none';
    if (advForm) advForm.style.display = 'block';
    if (expBtn) { expBtn.className = 'btn btn-sm btn-outline'; }
    if (advBtn) { advBtn.className = 'btn btn-sm btn-primary active'; }
  }
}

async function savePosExpenseOrAdvance() {
  const shiftId = sessionStorage.getItem('photoStudio_shiftId');
  const empId = sessionStorage.getItem('photoStudio_employeeId');
  const today = getLocalISODate();
  const time = new Date().toTimeString().slice(0, 5);

  if (currentPosExpenseTab === 'expense') {
    const typeSel = document.getElementById('posExpType');
    const typeId = typeSel ? typeSel.value : null;
    const typeName = typeSel && typeSel.selectedIndex >= 0 ? typeSel.options[typeSel.selectedIndex].text : 'نثريات';
    const amount = parseFloat(document.getElementById('posExpAmount')?.value) || 0;
    const desc = document.getElementById('posExpDesc')?.value.trim() || '';
    const source = document.getElementById('posExpSource')?.value || 'الخزينة';

    if (amount <= 0) {
      showToast('يرجى إدخال مبلغ المصروف بشكل صحيح', 'warning');
      return;
    }

    try {
      const res = await window.db.run(
        'INSERT INTO expenses (type_id, type_name, amount, description, employee_id, payment_source, date, time, shift_id) VALUES (?,?,?,?,?,?,?,?,?)',
        [typeId, typeName, amount, desc, empId || null, source, today, time, shiftId ? parseInt(shiftId) : null]
      );
      if (res && res.success) {
        await window.db.addTreasuryEntry('مصروف', `${typeName}: ${desc || 'مصروف من نقطة البيع'}`, amount, source);
        closeModal('posExpenseAdvanceModal');
        showToast(`تم تسجيل المصروف (${fmt(amount)} ج.م) وخصمه من الدرج بنجاح ✓`, 'success');
      } else {
        showToast('فشل تسجيل المصروف: ' + (res?.error || ''), 'error');
      }
    } catch(err) {
      showToast('خطأ: ' + err.message, 'error');
    }
  } else {
    // Advance
    const advEmpSel = document.getElementById('posAdvEmp');
    const targetEmpId = advEmpSel ? parseInt(advEmpSel.value) : null;
    const empName = advEmpSel && advEmpSel.selectedIndex >= 0 ? advEmpSel.options[advEmpSel.selectedIndex].text : '';
    const amount = parseFloat(document.getElementById('posAdvAmount')?.value) || 0;
    const notes = document.getElementById('posAdvNotes')?.value.trim() || '';

    if (!targetEmpId) {
      showToast('يرجى اختيار الموظف المستلف', 'warning');
      return;
    }
    if (amount <= 0) {
      showToast('يرجى إدخال مبلغ السلفة بشكل صحيح', 'warning');
      return;
    }

    try {
      const res = await window.db.run(
        'INSERT INTO advances (employee_id, amount, notes, date) VALUES (?,?,?,?)',
        [targetEmpId, amount, notes, today]
      );
      if (res && res.success) {
        await window.db.addTreasuryEntry('سلفة', `سلفة موظف: ${empName}${notes ? ' - ' + notes : ''}`, amount, 'الخزينة');
        closeModal('posExpenseAdvanceModal');
        showToast(`تم تسجيل سلفة (${fmt(amount)} ج.م) للموظف ${empName} وخصمها من الدرج ✓`, 'success');
      } else {
        showToast('فشل تسجيل السلفة: ' + (res?.error || ''), 'error');
      }
    } catch(err) {
      showToast('خطأ: ' + err.message, 'error');
    }
  }
}

init();

// ─── Quit Confirmation ────────────────────────────────────────────────────────
window.electron.onConfirmBackupBeforeQuit(() => {
  Swal.fire({
    title: 'إغلاق البرنامج',
    html: `
      <p style="font-size:14px;font-weight:600;margin-bottom:8px;">هل تريد إنشاء نسخة احتياطية قبل الخروج؟</p>
      <div style="display:flex; flex-direction:column; gap:8px; margin-top:16px;">
        <button class="btn btn-primary" onclick="Swal.close(); sendDailyReportAndQuit();">إرسال التقرير وإنهاء</button>
        <button class="btn btn-success" onclick="Swal.close(); window.electron.quitWithBackup();">نسخ وخروج</button>
        <button class="btn btn-danger" onclick="Swal.close(); window.electron.quitWithoutBackup();">خروج بدون نسخة</button>
        <button class="btn btn-outline" onclick="Swal.close(); window.electron.cancelQuit();">إلغاء</button>
      </div>
    `,
    showConfirmButton: false,
    allowOutsideClick: false
  });
});