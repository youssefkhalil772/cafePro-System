// ─── Helpers ──────────────────────────────────────────────────────────────────
function navigate(page) { window.electron.navigate(page); }
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function fmt(n) { return Number(n||0).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}); }

function showToast(msg, type='info') {
  const c = document.getElementById('toastContainer');
  if (!c) return;
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.classList.add('show'), 50);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3500);
}

let allSuppliers = [];
let allRawMaterials = [];
let allServices = [];
let purchaseLineItems = [];

document.addEventListener('DOMContentLoaded', async () => {
  const today = new Date().toISOString().split('T')[0];
  const pDate = document.getElementById('purchDate');
  const payDate = document.getElementById('payDate');
  const purchFrom = document.getElementById('purchFrom');
  const purchTo = document.getElementById('purchTo');

  if (pDate) pDate.value = today;
  if (payDate) payDate.value = today;
  if (purchFrom) purchFrom.value = today;
  if (purchTo) purchTo.value = today;

  await loadSuppliers();
  await loadStockItemsForPurchase();
});

// ─── Tab Switching ─────────────────────────────────────────────────────────────
function switchSuppTab(name) {
  document.querySelectorAll('.supp-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  
  const tab = document.getElementById('tab-' + name);
  const pane = document.getElementById('pane-' + name);
  if (tab) tab.classList.add('active');
  if (pane) pane.classList.add('active');

  if (name === 'suppliers') loadSuppliers();
  if (name === 'purchases') loadPurchases();
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── SUPPLIERS TAB ────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
async function loadSuppliers() {
  try {
    const res = await window.suppliers.list();
    if (!res.success) { showToast('خطأ: ' + res.error, 'error'); return; }
    allSuppliers = res.data || [];
    filterSuppliers();
    updateSuppStats();
    populateSuppliersDropdowns();
  } catch (err) {
    console.error('Failed to load suppliers:', err);
  }
}

function updateSuppStats() {
  const count = allSuppliers.length;
  const totalDebt = allSuppliers.reduce((sum, s) => sum + Math.max(0, Number(s.current_balance || 0)), 0);

  const sCount = document.getElementById('statTotalSuppliers');
  const sDebt = document.getElementById('statTotalDebt');
  if (sCount) sCount.textContent = count;
  if (sDebt) sDebt.textContent = fmt(totalDebt);
}

function filterSuppliers() {
  const query = (document.getElementById('suppSearchInput')?.value || '').trim().toLowerCase();
  const filtered = allSuppliers.filter(s => {
    return !query || (s.name && s.name.toLowerCase().includes(query)) || (s.phone && s.phone.includes(query));
  });
  renderSuppliersTable(filtered);
}

function renderSuppliersTable(suppliers) {
  const tbody = document.getElementById('suppliersTableBody');
  if (!tbody) return;

  if (!suppliers.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="table-empty">لا يوجد موردين مسجلين بعد</td></tr>';
    return;
  }

  tbody.innerHTML = suppliers.map((s, idx) => {
    const bal = Number(s.current_balance || 0);
    const hasDebt = bal > 0;
    const debtBadge = hasDebt 
      ? `<span class="debt-badge has-debt">له مستحقات: ${fmt(bal)} ج.م</span>`
      : `<span class="debt-badge zero-debt">خالص الحساب</span>`;

    return `
      <tr>
        <td style="color:var(--text-muted);font-size:12px;">${idx + 1}</td>
        <td style="font-weight:700;">${s.name}</td>
        <td><code>${s.phone || '—'}</code></td>
        <td style="font-size:12px; color:var(--text-muted);">${s.address || '—'}</td>
        <td style="text-align:right; font-weight:700;">${fmt(s.total_purchases)}</td>
        <td style="text-align:right; font-weight:800; color:${hasDebt ? '#dc2626' : '#059669'};">${fmt(bal)}</td>
        <td style="text-align:center;">${debtBadge}</td>
        <td style="text-align:center;">
          <div style="display:flex; gap:6px; justify-content:center; flex-wrap:wrap;">
            <button class="btn btn-success btn-sm" style="padding:2px 8px; font-size:11px;" onclick="openNewPurchaseForSupplier(${s.id})">+ توريد</button>
            <button class="btn btn-outline btn-sm" style="padding:2px 8px; font-size:11px;" onclick="openPaymentVoucherForSupplier(${s.id})">سداد</button>
            <button class="btn btn-outline btn-sm" style="padding:2px 8px; font-size:11px;" onclick="viewSupplierStatement(${s.id})">كشف حساب</button>
            <button class="btn btn-outline btn-sm" style="padding:2px 6px; font-size:11px;" onclick="editSupplier(${s.id})">تعديل</button>
            <button class="btn btn-hairline-danger btn-sm" style="padding:2px 6px; font-size:11px;" onclick="deleteSupplier(${s.id})">حذف</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function populateSuppliersDropdowns() {
  const pSel = document.getElementById('purchSupplierSelect');
  const paySel = document.getElementById('paySupplierSelect');
  const filterSel = document.getElementById('purchSupplierFilter');

  const optionsHtml = allSuppliers.map(s => `<option value="${s.id}">${s.name} (رصيد: ${fmt(s.current_balance)} ج.م)</option>`).join('');

  if (pSel) pSel.innerHTML = optionsHtml;
  if (paySel) paySel.innerHTML = optionsHtml;
  if (filterSel) filterSel.innerHTML = '<option value="">كل الموردين</option>' + allSuppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
}

function openSupplierModal(id = null) {
  const title = document.getElementById('suppModalTitle');
  const suppId = document.getElementById('suppId');
  const name = document.getElementById('suppName');
  const phone = document.getElementById('suppPhone');
  const address = document.getElementById('suppAddress');
  const opening = document.getElementById('suppOpening');

  if (id) {
    const s = allSuppliers.find(x => x.id === id);
    if (!s) return;
    title.textContent = 'تعديل بيانات المورد: ' + s.name;
    suppId.value = s.id;
    name.value = s.name;
    phone.value = s.phone || '';
    address.value = s.address || '';
    opening.value = s.opening_balance || 0;
  } else {
    title.textContent = 'إضافة مورد جديد';
    suppId.value = '';
    name.value = '';
    phone.value = '';
    address.value = '';
    opening.value = '0';
  }
  openModal('supplierModal');
}

function editSupplier(id) {
  openSupplierModal(id);
}

async function saveSupplier() {
  const id = document.getElementById('suppId').value;
  const name = document.getElementById('suppName').value.trim();
  const phone = document.getElementById('suppPhone').value.trim();
  const address = document.getElementById('suppAddress').value.trim();
  const opening = parseFloat(document.getElementById('suppOpening').value) || 0;

  if (!name) {
    showToast('يرجى إدخال اسم المورد أو الشركة', 'warning');
    return;
  }

  const payload = {
    id: id ? parseInt(id) : undefined,
    name,
    phone,
    address,
    opening_balance: opening
  };

  const res = await window.suppliers.save(payload);
  if (res.success) {
    showToast('تم حفظ بيانات المورد بنجاح', 'success');
    closeModal('supplierModal');
    await loadSuppliers();
  } else {
    showToast('خطأ: ' + res.error, 'error');
  }
}

async function deleteSupplier(id) {
  const s = allSuppliers.find(x => x.id === id);
  if (!s) return;
  const confirm = await Swal.fire({
    title: `حذف المورد؟`,
    text: `هل أنت متأكد من حذف المورد "${s.name}"؟`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'نعم، حذف',
    cancelButtonText: 'إلغاء'
  });

  if (confirm.isConfirmed) {
    const res = await window.suppliers.delete(id);
    if (res.success) {
      showToast('تم حذف المورد بنجاح', 'success');
      await loadSuppliers();
    } else {
      showToast('فشل: ' + res.error, 'error');
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── PURCHASE INVOICES (فواتير المشتريات والتوريد وإضافة المخزون) ──────────────
// ═══════════════════════════════════════════════════════════════════════════════
async function loadStockItemsForPurchase() {
  try {
    const rRes = await window.rawMaterials.list();
    if (rRes.success) allRawMaterials = rRes.data || [];
    const sRes = await window.inventory.list();
    if (sRes.success) allServices = sRes.data || [];
    populatePurchaseItemSelect();
  } catch (e) { console.error(e); }
}

function populatePurchaseItemSelect() {
  const type = document.getElementById('itemTypeSelect').value;
  const sel = document.getElementById('purchItemSelect');
  const costInput = document.getElementById('purchItemCost');
  if (!sel) return;

  if (type === 'raw') {
    sel.innerHTML = allRawMaterials.map(rm => `<option value="${rm.id}" data-cost="${rm.cost_per_unit || 0}" data-unit="${rm.unit}">${rm.name} (${rm.unit})</option>`).join('');
  } else {
    sel.innerHTML = allServices.map(s => `<option value="${s.id}" data-cost="${s.cost_price || 0}" data-unit="قطعة">${s.name}</option>`).join('');
  }

  // Update default cost input
  if (sel.options.length > 0 && costInput) {
    costInput.value = sel.options[0].getAttribute('data-cost') || 0;
  }
}

document.getElementById('purchItemSelect')?.addEventListener('change', (e) => {
  const opt = e.target.options[e.target.selectedIndex];
  if (opt) {
    document.getElementById('purchItemCost').value = opt.getAttribute('data-cost') || 0;
  }
});

function openNewPurchaseModal() {
  purchaseLineItems = [];
  document.getElementById('purchInvoiceNum').value = 'PUR-' + Date.now().toString().slice(-6);
  document.getElementById('purchDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('purchPaidInput').value = '0';
  document.getElementById('purchNotes').value = '';
  renderPurchaseLineItemsTable();
  openModal('purchaseModal');
}

function openNewPurchaseForSupplier(supplierId) {
  openNewPurchaseModal();
  const sel = document.getElementById('purchSupplierSelect');
  if (sel) sel.value = supplierId;
}

function addPurchaseLineItem() {
  const type = document.getElementById('itemTypeSelect').value;
  const sel = document.getElementById('purchItemSelect');
  const opt = sel.options[sel.selectedIndex];
  if (!opt) return;

  const itemId = parseInt(sel.value);
  const itemName = opt.textContent;
  const qty = parseFloat(document.getElementById('purchItemQty').value);
  const cost = parseFloat(document.getElementById('purchItemCost').value);

  if (isNaN(qty) || qty <= 0 || isNaN(cost) || cost < 0) {
    showToast('يرجى إدخال كمية وسعر تكلفة صحيحين', 'warning');
    return;
  }

  purchaseLineItems.push({
    item_type: type === 'raw' ? 'raw_material' : 'service',
    raw_material_id: type === 'raw' ? itemId : null,
    service_id: type === 'service' ? itemId : null,
    item_name: itemName,
    quantity: qty,
    unit_cost: cost,
    total: qty * cost
  });

  renderPurchaseLineItemsTable();
}

function removePurchaseLineItem(index) {
  purchaseLineItems.splice(index, 1);
  renderPurchaseLineItemsTable();
}

function renderPurchaseLineItemsTable() {
  const tbody = document.getElementById('purchaseLineItemsBody');
  if (!tbody) return;

  if (!purchaseLineItems.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="table-empty">أضف عناصر الفاتورة أعلاه</td></tr>';
    document.getElementById('purchTotalDisplay').textContent = '0.00 ج.م';
    calcPurchRemaining();
    return;
  }

  let grandTotal = 0;
  tbody.innerHTML = purchaseLineItems.map((it, idx) => {
    grandTotal += it.total;
    return `
      <tr>
        <td style="color:var(--text-muted);">${idx + 1}</td>
        <td style="font-weight:700;">${it.item_name}</td>
        <td><span class="badge badge-accent">${it.item_type === 'raw_material' ? 'مادة خام' : 'صنف'}</span></td>
        <td style="text-align:center; font-weight:800; font-size:14px;">${it.quantity}</td>
        <td style="text-align:right;">${fmt(it.unit_cost)}</td>
        <td style="text-align:right; font-weight:800; color:var(--primary);">${fmt(it.total)}</td>
        <td style="text-align:center;">
          <button class="btn btn-hairline-danger btn-sm" onclick="removePurchaseLineItem(${idx})">✕</button>
        </td>
      </tr>
    `;
  }).join('');

  document.getElementById('purchTotalDisplay').textContent = fmt(grandTotal) + ' ج.م';
  calcPurchRemaining();
}

function calcPurchRemaining() {
  const grandTotal = purchaseLineItems.reduce((s, it) => s + (it.total || 0), 0);
  const paid = parseFloat(document.getElementById('purchPaidInput')?.value) || 0;
  const rem = Math.max(0, grandTotal - paid);
  const notice = document.getElementById('purchRemainingNotice');
  if (notice) {
    notice.textContent = `المتبقي دين على المحل للمورد: ${fmt(rem)} ج.م`;
    notice.style.color = rem > 0 ? '#dc2626' : '#059669';
  }
}

async function savePurchaseInvoice() {
  const suppId = parseInt(document.getElementById('purchSupplierSelect').value);
  if (!suppId) {
    showToast('يرجى تحديد المورد', 'warning');
    return;
  }
  if (!purchaseLineItems.length) {
    showToast('يجب إضافة بند واحد على الأقل في الفاتورة', 'warning');
    return;
  }

  const grandTotal = purchaseLineItems.reduce((s, it) => s + (it.total || 0), 0);
  const paid = parseFloat(document.getElementById('purchPaidInput').value) || 0;
  const invoiceNum = document.getElementById('purchInvoiceNum').value.trim();
  const date = document.getElementById('purchDate').value;
  const tType = document.getElementById('purchTreasurySelect').value;
  const notes = document.getElementById('purchNotes').value.trim();

  const purchaseData = {
    invoice_number: invoiceNum,
    supplier_id: suppId,
    purchase_date: date,
    total: grandTotal,
    amount_paid: paid,
    treasury_type: tType,
    notes: notes
  };

  const res = await window.purchases.save(purchaseData, purchaseLineItems);
  if (res.success) {
    showToast('تم حفظ فاتورة التوريد وإضافة الكميات للمخزن بنجاح ✅', 'success');
    closeModal('purchaseModal');
    await loadSuppliers();
    await loadStockItemsForPurchase();
  } else {
    showToast('فشل حفظ الفاتورة: ' + res.error, 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── PAYMENT VOUCHERS (سندات صرف دفعات للموردين) ──────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
function openPaymentVoucherModal() {
  document.getElementById('payAmount').value = '';
  document.getElementById('payNotes').value = '';
  document.getElementById('payDate').value = new Date().toISOString().split('T')[0];
  updatePaySupplierDebtNotice();
  openModal('paymentVoucherModal');
}

function openPaymentVoucherForSupplier(supplierId) {
  openPaymentVoucherModal();
  const sel = document.getElementById('paySupplierSelect');
  if (sel) {
    sel.value = supplierId;
    updatePaySupplierDebtNotice();
  }
}

function updatePaySupplierDebtNotice() {
  const sel = document.getElementById('paySupplierSelect');
  const notice = document.getElementById('payDebtNotice');
  if (!sel || !notice) return;
  const s = allSuppliers.find(x => x.id === parseInt(sel.value));
  if (s) {
    const bal = Number(s.current_balance || 0);
    notice.textContent = `الرصيد المستحق حالياً للمورد: ${fmt(bal)} ج.م`;
  } else {
    notice.textContent = '';
  }
}

async function submitSupplierPayment() {
  const suppId = parseInt(document.getElementById('paySupplierSelect').value);
  const amount = parseFloat(document.getElementById('payAmount').value);
  const tType = document.getElementById('payTreasurySelect').value;
  const date = document.getElementById('payDate').value;
  const notes = document.getElementById('payNotes').value.trim();

  if (!suppId || isNaN(amount) || amount <= 0) {
    showToast('يرجى إدخال مبلغ سداد صحيح', 'warning');
    return;
  }

  const res = await window.suppliers.pay({
    supplier_id: suppId,
    amount,
    treasury_type: tType,
    payment_date: date,
    notes: notes || 'سند صرف دفعة مورد'
  });

  if (res.success) {
    showToast('تم تسجيل سند الصرف والخصم من الخزينة بنجاح ✅', 'success');
    closeModal('paymentVoucherModal');
    await loadSuppliers();
  } else {
    showToast('فشل تسجيل السند: ' + res.error, 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── STATEMENT OF ACCOUNT (كشف حساب تفصيلي للمورد) ───────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
async function viewSupplierStatement(supplierId) {
  const res = await window.suppliers.getStatement(supplierId);
  if (!res.success) { showToast('خطأ: ' + res.error, 'error'); return; }
  const { supplier, purchases, payments } = res.data;

  document.getElementById('statementTitle').textContent = `كشف حساب المورد: ${supplier.name}`;
  document.getElementById('statementSub').textContent = `رقم الهاتف: ${supplier.phone || '—'} | الرصيد الحالي المستحق: ${fmt(supplier.current_balance)} ج.م`;

  // Merge purchases and payments chronologically
  const entries = [];
  (purchases || []).forEach(p => {
    entries.push({
      date: p.purchase_date,
      type: 'فاتورة توريد',
      ref: p.invoice_number,
      debit: 0, // we owe them (creditor)
      credit: Number(p.total || 0),
      notes: `فاتورة توريد (${p.items_count} أصناف) — مسدد منها ${fmt(p.amount_paid)} ج.م`
    });
    if (Number(p.amount_paid || 0) > 0) {
      entries.push({
        date: p.purchase_date,
        type: 'سداد فوري بالفاتورة',
        ref: p.invoice_number,
        debit: Number(p.amount_paid || 0),
        credit: 0,
        notes: `مسدد من ${p.treasury_type || 'الخزينة'}`
      });
    }
  });

  (payments || []).forEach(pay => {
    entries.push({
      date: pay.payment_date,
      type: 'سند صرف دفعات',
      ref: 'PAY-' + pay.id,
      debit: Number(pay.amount || 0),
      credit: 0,
      notes: pay.notes || `سداد من ${pay.treasury_type || 'الخزينة'}`
    });
  });

  // Sort by date
  entries.sort((a, b) => new Date(a.date) - new Date(b.date));

  let running = Number(supplier.opening_balance || 0);
  const rowsHtml = entries.map(e => {
    running = running + e.credit - e.debit;
    return `
      <tr>
        <td style="font-size:12px; color:var(--text-muted);">${e.date}</td>
        <td><span class="badge badge-accent">${e.type}</span></td>
        <td><code>${e.ref}</code></td>
        <td style="text-align:right; font-weight:700; color:#059669;">${e.debit > 0 ? fmt(e.debit) : '—'}</td>
        <td style="text-align:right; font-weight:700; color:#dc2626;">${e.credit > 0 ? fmt(e.credit) : '—'}</td>
        <td style="text-align:right; font-weight:800; color:var(--primary);">${fmt(running)}</td>
        <td style="font-size:12px; color:var(--text-muted);">${e.notes}</td>
      </tr>
    `;
  }).join('');

  document.getElementById('statementBody').innerHTML = `
    <div style="background:var(--bg); border:1px solid var(--border); border-radius:8px; padding:12px; margin-bottom:14px; display:flex; justify-content:space-between;">
      <div>الرصيد الافتتاحي: <b>${fmt(supplier.opening_balance)} ج.م</b></div>
      <div>إجمالي الرصيد الختامي المستحق: <b style="color:${supplier.current_balance > 0 ? '#dc2626' : '#059669'}">${fmt(supplier.current_balance)} ج.م</b></div>
    </div>
    <div class="table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th>التاريخ</th>
            <th>نوع الحركة</th>
            <th>رقم المرجع</th>
            <th style="text-align:right;">مدفوع له (مدين)</th>
            <th style="text-align:right;">قيمة الفاتورة (دائن)</th>
            <th style="text-align:right;">الرصيد المستحق</th>
            <th>بيان وملاحظات</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || '<tr><td colspan="7" class="table-empty">لا توجد حركات مسجلة لهذا المورد</td></tr>'}
        </tbody>
      </table>
    </div>
  `;

  openModal('statementModal');
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── TAB 2: PURCHASES LIST ────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
async function loadPurchases() {
  try {
    const suppId = document.getElementById('purchSupplierFilter')?.value;
    const from = document.getElementById('purchFrom')?.value;
    const to = document.getElementById('purchTo')?.value;

    const res = await window.purchases.list({
      supplier_id: suppId ? parseInt(suppId) : undefined,
      from: from || undefined,
      to: to || undefined
    });

    if (!res.success) { showToast('خطأ: ' + res.error, 'error'); return; }
    renderPurchasesTable(res.data || []);
  } catch (e) { console.error(e); }
}

function renderPurchasesTable(purchases) {
  const tbody = document.getElementById('purchasesTableBody');
  if (!tbody) return;

  if (!purchases.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="table-empty">لا توجد فواتير مشتريات مطابقة</td></tr>';
    return;
  }

  tbody.innerHTML = purchases.map(p => {
    const statusMap = {
      'مسددة': 'badge-success',
      'جزئي': 'badge-warning',
      'آجل': 'badge-danger'
    };
    const bClass = statusMap[p.payment_status] || 'badge-neutral';

    return `
      <tr>
        <td style="font-weight:700;"><code>${p.invoice_number}</code></td>
        <td style="font-size:12px; color:var(--text-muted);">${p.purchase_date}</td>
        <td style="font-weight:700;">${p.supplier_name || '—'}</td>
        <td style="text-align:center;">${p.items_count || 0}</td>
        <td style="text-align:right; font-weight:800; color:var(--primary);">${fmt(p.total)}</td>
        <td style="text-align:right; font-weight:700; color:#059669;">${fmt(p.amount_paid)}</td>
        <td style="text-align:right; font-weight:700; color:#dc2626;">${fmt(p.remaining)}</td>
        <td style="text-align:center;"><span class="badge ${bClass}">${p.payment_status}</span></td>
        <td style="text-align:center;">
          <button class="btn btn-outline btn-sm" onclick="viewPurchaseDetails(${p.id})">عرض الأصناف</button>
        </td>
      </tr>
    `;
  }).join('');
}

async function viewPurchaseDetails(purchaseId) {
  const res = await window.purchases.getDetails(purchaseId);
  if (!res.success) { showToast('خطأ: ' + res.error, 'error'); return; }
  const { purchase, items } = res.data;

  const itemsHtml = (items || []).map((it, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td style="font-weight:700;">${it.item_name}</td>
      <td><span class="badge badge-accent">${it.item_type === 'raw_material' ? 'مادة خام' : 'صنف'}</span></td>
      <td style="text-align:center; font-weight:800;">${it.quantity}</td>
      <td style="text-align:right;">${fmt(it.unit_cost)}</td>
      <td style="text-align:right; font-weight:800;">${fmt(it.total)}</td>
    </tr>
  `).join('');

  await Swal.fire({
    title: `فاتورة توريد #${purchase.invoice_number}`,
    html: `
      <div style="text-align:right; font-size:13px; margin-bottom:12px;">
        <div><b>المورد:</b> ${purchase.supplier_name || '—'} (${purchase.supplier_phone || ''})</div>
        <div><b>التاريخ:</b> ${purchase.purchase_date} | <b>الإجمالي:</b> ${fmt(purchase.total)} ج.م</div>
        <div><b>المدفوع:</b> ${fmt(purchase.amount_paid)} ج.م | <b>المتبقي آجل:</b> ${fmt(purchase.remaining)} ج.م</div>
      </div>
      <table class="data-table" style="font-size:12px;">
        <thead>
          <tr><th>#</th><th>البند</th><th>النوع</th><th>الكمية</th><th>تكلفة الوحدة</th><th>الإجمالي</th></tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
      </table>
    `,
    width: 650,
    confirmButtonText: 'إغلاق'
  });
}
