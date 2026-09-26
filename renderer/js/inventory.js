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

let appSettings = {};
let allRawMaterials = [];
let allSuppliers = [];
let allServices = [];
let activeRecipeServiceId = null;
let currentRecipeItems = [];
let activeStocktakeSession = null;
let stocktakeItemsList = [];

// ─── Initialization ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const sRes = await window.db.getSettings();
    if (sRes.success) appSettings = sRes.data || {};
    
    // Check recipe mode
    const recipeNotice = document.getElementById('recipeNotice');
    if (recipeNotice) {
      if (!appSettings.recipe_mode_enabled) {
        recipeNotice.style.display = 'block';
      } else {
        recipeNotice.style.display = 'none';
      }
    }

    // Set default dates for movements
    const today = new Date().toISOString().split('T')[0];
    const dFrom = document.getElementById('movFrom');
    const dTo = document.getElementById('movTo');
    if (dFrom) dFrom.value = today;
    if (dTo) dTo.value = today;

    // Load initial tab (Raw Materials)
    await loadRawMaterials();
    await loadSuppliers();
    await loadServicesForRecipes();
  } catch (err) {
    console.error('Init error:', err);
  }
});

// ─── Tab Switching ─────────────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.inv-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  
  const tab = document.getElementById('tab-' + name);
  const pane = document.getElementById('pane-' + name);
  if (tab) tab.classList.add('active');
  if (pane) pane.classList.add('active');

  if (name === 'raw')       loadRawMaterials();
  if (name === 'recipes')   loadServicesForRecipes();
  if (name === 'direct')    loadDirectItems();
  if (name === 'stocktake') loadStocktakeSessions();
  if (name === 'movements') loadMovements();
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── TAB 1: RAW MATERIALS (المواد الخام والمكونات) ─────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
async function loadRawMaterials() {
  try {
    const res = await window.rawMaterials.list();
    if (!res.success) { showToast('خطأ: ' + res.error, 'error'); return; }
    allRawMaterials = res.data || [];
    filterRawMaterials();
    updateRawStats();
    populateRecipeRawSelect();
  } catch (err) {
    console.error('Failed to load raw materials:', err);
  }
}

async function loadSuppliers() {
  try {
    const res = await window.suppliers.list();
    if (res.success) {
      allSuppliers = res.data || [];
      const sel = document.getElementById('rawSupplierSelect');
      if (sel) {
        sel.innerHTML = '<option value="">بدون مورد محدد</option>' +
          allSuppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
      }
    }
  } catch (e) { console.error(e); }
}

function updateRawStats() {
  const totalItems = allRawMaterials.length;
  let totalVal = 0;
  let lowCount = 0;
  let outCount = 0;

  allRawMaterials.forEach(rm => {
    const q = Number(rm.quantity || 0);
    const c = Number(rm.cost_per_unit || 0);
    const thr = Number(rm.low_stock_threshold || 0);
    totalVal += (q * c);
    if (q <= 0) outCount++;
    else if (thr > 0 && q <= thr) lowCount++;
  });

  const sTotal = document.getElementById('statRawTotalItems');
  const sVal = document.getElementById('statRawTotalValue');
  const sLow = document.getElementById('statRawLowStock');
  const sOut = document.getElementById('statRawOutStock');

  if (sTotal) sTotal.textContent = totalItems;
  if (sVal) sVal.textContent = fmt(totalVal);
  if (sLow) sLow.textContent = lowCount;
  if (sOut) sOut.textContent = outCount;
}

function filterRawMaterials() {
  const query = (document.getElementById('rawSearchInput')?.value || '').trim().toLowerCase();
  const filtered = allRawMaterials.filter(rm => {
    return !query || (rm.name && rm.name.toLowerCase().includes(query));
  });
  renderRawTable(filtered);
}

function renderRawTable(items) {
  const tbody = document.getElementById('rawTableBody');
  if (!tbody) return;
  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="table-empty">لا توجد مواد خام مسجلة بعد</td></tr>';
    return;
  }

  tbody.innerHTML = items.map((rm, idx) => {
    const qty = Number(rm.quantity || 0);
    const thr = Number(rm.low_stock_threshold || 0);
    const cost = Number(rm.cost_per_unit || 0);
    const totalCost = qty * cost;

    let badge = `<span class="stock-status-ok">متوفر (${qty})</span>`;
    let qtyColor = '#059669';
    if (qty <= 0) {
      badge = `<span class="stock-status-out">نفد الرصيد</span>`;
      qtyColor = '#dc2626';
    } else if (thr > 0 && qty <= thr) {
      badge = `<span class="stock-status-low">رصيد منخفض (${qty})</span>`;
      qtyColor = '#d97706';
    }

    return `
      <tr>
        <td style="color:var(--text-muted);font-size:12px;">${idx + 1}</td>
        <td style="font-weight:700;">${rm.name}</td>
        <td><span class="badge badge-accent">${rm.unit}</span></td>
        <td style="text-align:center; font-weight:800; font-size:15px; color:${qtyColor};">${qty}</td>
        <td style="text-align:center; color:var(--text-muted); font-size:12px;">${thr || '—'}</td>
        <td style="text-align:right; font-weight:700;">${fmt(cost)}</td>
        <td style="text-align:right; font-weight:700; color:var(--primary);">${fmt(totalCost)}</td>
        <td style="font-size:12px; color:var(--text-muted);">${rm.supplier_name || '—'}</td>
        <td style="text-align:center;">${badge}</td>
        <td style="text-align:center;">
          <div style="display:flex; gap:6px; justify-content:center;">
            <button class="btn btn-outline btn-sm" style="padding:2px 8px; font-size:11px;" onclick="openRawAdjustModal(${rm.id})">تعديل رصيد</button>
            <button class="btn btn-outline btn-sm" style="padding:2px 8px; font-size:11px;" onclick="openRawModal(${rm.id})">تعديل</button>
            <button class="btn btn-hairline-danger btn-sm" style="padding:2px 6px; font-size:11px;" onclick="deleteRawMaterial(${rm.id})">حذف</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function openRawModal(id = null) {
  const title = document.getElementById('rawModalTitle');
  const rawId = document.getElementById('rawId');
  const name = document.getElementById('rawName');
  const unit = document.getElementById('rawUnit');
  const qtyGroup = document.getElementById('rawQtyGroup');
  const qty = document.getElementById('rawQty');
  const thr = document.getElementById('rawLowThreshold');
  const cost = document.getElementById('rawCost');
  const supp = document.getElementById('rawSupplierSelect');

  if (id) {
    const item = allRawMaterials.find(x => x.id === id);
    if (!item) return;
    title.textContent = 'تعديل مادة خام: ' + item.name;
    rawId.value = item.id;
    name.value = item.name;
    unit.value = item.unit || 'جرام';
    qtyGroup.style.display = 'none'; // Editing qty is done via adjustment modal
    thr.value = item.low_stock_threshold || 0;
    cost.value = item.cost_per_unit || 0;
    supp.value = item.supplier_id || '';
  } else {
    title.textContent = 'إضافة مادة خام جديدة';
    rawId.value = '';
    name.value = '';
    unit.value = 'جرام';
    qtyGroup.style.display = 'block';
    qty.value = '0';
    thr.value = '100';
    cost.value = '0';
    supp.value = '';
  }
  openModal('rawMaterialModal');
}

async function saveRawMaterial() {
  const id = document.getElementById('rawId').value;
  const name = document.getElementById('rawName').value.trim();
  const unit = document.getElementById('rawUnit').value;
  const quantity = parseFloat(document.getElementById('rawQty').value) || 0;
  const low_stock_threshold = parseFloat(document.getElementById('rawLowThreshold').value) || 0;
  const cost_per_unit = parseFloat(document.getElementById('rawCost').value) || 0;
  const supplier_id = document.getElementById('rawSupplierSelect').value || null;

  if (!name) {
    showToast('يرجى إدخال اسم المادة الخام', 'warning');
    return;
  }

  const payload = {
    id: id ? parseInt(id) : undefined,
    name,
    unit,
    quantity,
    low_stock_threshold,
    cost_per_unit,
    supplier_id: supplier_id ? parseInt(supplier_id) : null
  };

  const res = await window.rawMaterials.save(payload);
  if (res.success) {
    showToast('تم حفظ المادة الخام بنجاح', 'success');
    closeModal('rawMaterialModal');
    await loadRawMaterials();
  } else {
    showToast('فشل الحفظ: ' + res.error, 'error');
  }
}

async function deleteRawMaterial(id) {
  const rm = allRawMaterials.find(x => x.id === id);
  if (!rm) return;
  const confirm = await Swal.fire({
    title: `حذف المادة الخام؟`,
    text: `هل أنت متأكد من حذف "${rm.name}"؟`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'نعم، حذف',
    cancelButtonText: 'إلغاء'
  });
  if (confirm.isConfirmed) {
    const res = await window.rawMaterials.delete(id);
    if (res.success) {
      showToast('تم حذف المادة بنجاح', 'success');
      await loadRawMaterials();
    } else {
      showToast('فشل الحذف: ' + res.error, 'error');
    }
  }
}

function openRawAdjustModal(id) {
  const rm = allRawMaterials.find(x => x.id === id);
  if (!rm) return;
  document.getElementById('adjustRawId').value = id;
  document.getElementById('rawAdjustTitle').textContent = `تعديل رصيد: ${rm.name} (الحالي: ${rm.quantity} ${rm.unit})`;
  document.getElementById('adjustUnitSpan').textContent = rm.unit;
  document.getElementById('adjustQty').value = '';
  document.getElementById('adjustNotes').value = '';
  openModal('rawAdjustModal');
}

async function submitRawStockAdjust() {
  const id = parseInt(document.getElementById('adjustRawId').value);
  const type = document.getElementById('adjustType').value;
  let qtyVal = parseFloat(document.getElementById('adjustQty').value);
  const notes = document.getElementById('adjustNotes').value.trim();

  if (isNaN(qtyVal) || qtyVal === 0) {
    showToast('يرجى إدخال كمية صحيحة', 'warning');
    return;
  }

  // If waste or deduction, make it negative
  if (type === 'waste' && qtyVal > 0) {
    qtyVal = -qtyVal;
  }

  const res = await window.rawMaterials.adjustStock({
    id,
    type,
    quantityChange: qtyVal,
    notes: notes || (type === 'waste' ? 'تسجيل هالك وتالف' : 'تعديل رصيد يدوي')
  });

  if (res.success) {
    showToast('تم تعديل رصيد المادة الخام بنجاح', 'success');
    closeModal('rawAdjustModal');
    await loadRawMaterials();
  } else {
    showToast('فشل التعديل: ' + res.error, 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── TAB 2: RECIPES & BOM (الوصفات والتكاليف) ──────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
async function loadServicesForRecipes() {
  try {
    const res = await window.inventory.list();
    if (res.success) {
      allServices = res.data || [];
      renderRecipeServicesList();
    }
  } catch (e) { console.error(e); }
}

function renderRecipeServicesList() {
  const container = document.getElementById('recipeServicesList');
  if (!container) return;
  const query = (document.getElementById('recipeServiceSearch')?.value || '').trim().toLowerCase();

  const filtered = allServices.filter(s => !query || s.name.toLowerCase().includes(query));
  if (!filtered.length) {
    container.innerHTML = '<div class="table-empty">لا توجد أصناف مطابقة</div>';
    return;
  }

  container.innerHTML = filtered.map(s => {
    const isAct = s.id === activeRecipeServiceId;
    return `
      <div class="service-picker-item ${isAct ? 'active' : ''}" onclick="selectRecipeService(${s.id})">
        <div>
          <div style="font-weight:700; font-size:13px;">${s.name}</div>
          <div style="font-size:11px; color:var(--text-muted);">${s.category_name || 'بدون قسم'} — ${fmt(s.sell_price)} ج.م</div>
        </div>
        <div style="font-size:18px; color:var(--accent);">›</div>
      </div>
    `;
  }).join('');
}

function populateRecipeRawSelect() {
  const sel = document.getElementById('recipeRawSelect');
  if (!sel) return;
  sel.innerHTML = allRawMaterials.map(rm => `<option value="${rm.id}" data-unit="${rm.unit}">${rm.name} (${rm.unit})</option>`).join('');
  onRecipeRawSelectChange();
}

function onRecipeRawSelectChange() {
  const sel = document.getElementById('recipeRawSelect');
  const span = document.getElementById('recipeUnitLabel');
  if (!sel || !span) return;
  const opt = sel.options[sel.selectedIndex];
  if (opt) {
    span.textContent = opt.getAttribute('data-unit') || 'وحدة';
  }
}

async function selectRecipeService(serviceId) {
  activeRecipeServiceId = serviceId;
  renderRecipeServicesList();

  const srv = allServices.find(s => s.id === serviceId);
  if (!srv) return;

  document.getElementById('selectedServiceTitle').textContent = `وصفة ومكونات: ${srv.name}`;
  document.getElementById('selectedServiceCat').textContent = `القسم: ${srv.category_name || 'عام'} | سعر البيع: ${fmt(srv.sell_price)} ج.م`;
  document.getElementById('metricSellPrice').textContent = fmt(srv.sell_price);

  document.getElementById('addComponentArea').style.display = 'block';
  document.getElementById('saveRecipeArea').style.display = 'flex';
  document.getElementById('saveRecipeBtn').disabled = false;

  // Load recipe items from DB
  const res = await window.recipes.getForService(serviceId);
  if (res.success) {
    currentRecipeItems = (res.data.items || []).map(it => ({
      raw_material_id: it.raw_material_id,
      raw_material_name: it.raw_material_name,
      quantity_used: Number(it.quantity_used || 0),
      unit: it.unit,
      cost_per_unit: Number(it.cost_per_unit || 0),
      item_total_cost: Number(it.item_total_cost || 0)
    }));
  } else {
    currentRecipeItems = [];
  }

  renderCurrentRecipeTable();
}

function renderCurrentRecipeTable() {
  const tbody = document.getElementById('recipeItemsTableBody');
  if (!tbody) return;

  const srv = allServices.find(s => s.id === activeRecipeServiceId);
  const sellPrice = srv ? Number(srv.sell_price || 0) : 0;

  if (!currentRecipeItems.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="table-empty">لا توجد مكونات مضافة لهذا الصنف بعد. أضف المكونات أعلاه.</td></tr>';
    document.getElementById('metricCostPrice').textContent = '0.00';
    document.getElementById('metricProfitMargin').textContent = fmt(sellPrice);
    return;
  }

  let totalCost = 0;
  tbody.innerHTML = currentRecipeItems.map((it, idx) => {
    const itemCost = (it.quantity_used || 0) * (it.cost_per_unit || 0);
    totalCost += itemCost;
    return `
      <tr>
        <td style="color:var(--text-muted);">${idx + 1}</td>
        <td style="font-weight:700;">${it.raw_material_name}</td>
        <td style="font-weight:700; color:var(--primary); font-size:14px;">${it.quantity_used}</td>
        <td><span class="badge badge-accent">${it.unit}</span></td>
        <td style="text-align:right;">${fmt(it.cost_per_unit)}</td>
        <td style="text-align:right; font-weight:800; color:#d97706;">${fmt(itemCost)}</td>
        <td style="text-align:center;">
          <button class="btn btn-hairline-danger btn-sm" onclick="removeRecipeItemRow(${idx})">✕</button>
        </td>
      </tr>
    `;
  }).join('');

  const profit = Math.max(0, sellPrice - totalCost);
  document.getElementById('metricCostPrice').textContent = fmt(totalCost);
  document.getElementById('metricProfitMargin').textContent = fmt(profit);
}

function addRecipeItemRow() {
  if (!activeRecipeServiceId) {
    showToast('اختر صنفاً أولاً', 'warning');
    return;
  }
  const rawSel = document.getElementById('recipeRawSelect');
  const qtyInput = document.getElementById('recipeRawQty');
  const rawId = parseInt(rawSel.value);
  const qtyVal = parseFloat(qtyInput.value);

  if (!rawId || isNaN(qtyVal) || qtyVal <= 0) {
    showToast('يرجى إدخال كمية صحيحة للمكون', 'warning');
    return;
  }

  const rm = allRawMaterials.find(x => x.id === rawId);
  if (!rm) return;

  const existingIdx = currentRecipeItems.findIndex(x => x.raw_material_id === rawId);
  if (existingIdx >= 0) {
    currentRecipeItems[existingIdx].quantity_used = qtyVal;
  } else {
    currentRecipeItems.push({
      raw_material_id: rm.id,
      raw_material_name: rm.name,
      quantity_used: qtyVal,
      unit: rm.unit,
      cost_per_unit: Number(rm.cost_per_unit || 0),
      item_total_cost: qtyVal * Number(rm.cost_per_unit || 0)
    });
  }

  qtyInput.value = '';
  renderCurrentRecipeTable();
}

function removeRecipeItemRow(index) {
  currentRecipeItems.splice(index, 1);
  renderCurrentRecipeTable();
}

async function saveCurrentRecipe() {
  if (!activeRecipeServiceId) return;
  const btn = document.getElementById('saveRecipeBtn');
  btn.disabled = true;
  btn.textContent = 'جارٍ الحفظ...';

  const list = currentRecipeItems.map(it => ({
    raw_material_id: it.raw_material_id,
    quantity_used: it.quantity_used
  }));

  const res = await window.recipes.saveForService(activeRecipeServiceId, list);
  btn.disabled = false;
  btn.textContent = '💾 حفظ الوصفة وتحديث تكلفة الصنف';

  if (res.success) {
    showToast('تم حفظ مكونات الوصفة وتحديث تكلفة الصنف بنجاح', 'success');
    await loadServicesForRecipes();
  } else {
    showToast('فشل حفظ الوصفة: ' + res.error, 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── TAB 3: DIRECT TRACKED ITEMS (الأصناف المباشرة) ───────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
let directItems = [];

async function loadDirectItems() {
  try {
    const res = await window.inventory.list({ trackedOnly: true });
    if (!res.success) { showToast('خطأ: ' + res.error, 'error'); return; }
    directItems = res.data || [];
    renderDirectItemsTable(directItems);
  } catch (err) { console.error(err); }
}

function renderDirectItemsTable(items) {
  const tbody = document.getElementById('directItemsTableBody');
  if (!tbody) return;
  const query = (document.getElementById('directSearchInput')?.value || '').trim().toLowerCase();

  const filtered = items.filter(i => {
    return !query || (i.name && i.name.toLowerCase().includes(query)) || (i.barcode && i.barcode.includes(query));
  });

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="table-empty">لا توجد أصناف مباشرة متتبعة</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map((i, idx) => {
    const qty = Number(i.quantity || 0);
    const thr = Number(i.low_stock_threshold || 0);
    let badge = `<span class="stock-status-ok">متوفر (${qty})</span>`;
    let qtyColor = '#059669';
    if (qty <= 0) {
      badge = `<span class="stock-status-out">نفد الرصيد</span>`;
      qtyColor = '#dc2626';
    } else if (thr > 0 && qty <= thr) {
      badge = `<span class="stock-status-low">رصيد منخفض (${qty})</span>`;
      qtyColor = '#d97706';
    }

    return `
      <tr>
        <td style="color:var(--text-muted);font-size:12px;">${idx + 1}</td>
        <td style="font-weight:700;">${i.name}</td>
        <td><span class="badge badge-accent">${i.category_name || 'عام'}</span></td>
        <td><code>${i.barcode || '—'}</code></td>
        <td style="text-align:center; font-weight:800; font-size:15px; color:${qtyColor};">${qty}</td>
        <td style="text-align:center; color:var(--text-muted); font-size:12px;">${thr || '—'}</td>
        <td style="text-align:right;">${fmt(i.cost_price)}</td>
        <td style="text-align:right; font-weight:700; color:var(--success);">${fmt(i.sell_price)}</td>
        <td style="text-align:center;">${badge}</td>
        <td style="text-align:center;">
          <button class="btn btn-outline btn-sm" onclick="quickRestockService(${i.id})">+ رصيد</button>
        </td>
      </tr>
    `;
  }).join('');
}

async function quickRestockService(id) {
  const item = directItems.find(x => x.id === id);
  if (!item) return;
  const { value: qty } = await Swal.fire({
    title: `إضافة رصيد: ${item.name}`,
    input: 'number',
    inputLabel: 'الكمية الموردة الجديدة',
    inputPlaceholder: 'أدخل العدد',
    showCancelButton: true,
    confirmButtonText: 'إضافة',
    cancelButtonText: 'إلغاء'
  });
  if (qty && Number(qty) > 0) {
    const res = await window.inventory.restock(id, Number(qty), 'توريد يدوي مباشر');
    if (res.success) {
      showToast('تمت إضافة الرصيد بنجاح', 'success');
      await loadDirectItems();
    } else {
      showToast('فشل: ' + res.error, 'error');
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── TAB 4: STOCKTAKE (الجرد الفعلي) ──────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
let allStocktakeSessions = [];
let activeSessionType = 'raw_material';

async function loadStocktakeSessions() {
  try {
    const res = await window.inventory.stocktakeList();
    if (res.success) {
      allStocktakeSessions = res.data || [];
      renderStocktakeSessionsList();
    }
  } catch (e) { console.error(e); }
}

function renderStocktakeSessionsList() {
  const c = document.getElementById('stocktakeSessionsList');
  if (!c) return;
  if (!allStocktakeSessions.length) {
    c.innerHTML = '<div class="table-empty">لا توجد جلسات جرد سابقة</div>';
    return;
  }
  c.innerHTML = allStocktakeSessions.map(s => {
    const isDone = s.status === 'مكتمل';
    return `
      <div style="background:var(--bg); border:1px solid var(--border); border-radius:8px; padding:10px 14px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="font-weight:700; font-size:13px;">${s.notes || ('جلسة جرد رقم #' + s.id)}</div>
          <div style="font-size:11px; color:var(--text-muted);">${s.start_date || ''} — عناصر: ${s.item_count || 0}</div>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <span class="${isDone ? 'stock-status-ok' : 'stock-status-low'}">${s.status}</span>
          <button class="btn btn-outline btn-sm" onclick="viewStocktakeReport(${s.id})">عرض التقرير</button>
        </div>
      </div>
    `;
  }).join('');
}

async function startStocktake() {
  const type = document.getElementById('stocktakeTypeSelect').value;
  activeSessionType = type;
  const notes = document.getElementById('stocktakeNotes').value.trim();

  const res = await window.inventory.stocktakeStart(notes || (type === 'raw_material' ? 'جرد مواد خام' : 'جرد أصناف وبضاعة'));
  if (res.success) {
    activeStocktakeSession = { id: res.data.id, notes, type };
    document.getElementById('activeSessionArea').style.display = 'block';
    document.getElementById('activeSessionTitle').textContent = `جلسة جرد حالية #${res.data.id} (${type === 'raw_material' ? 'مواد خام' : 'أصناف'})`;
    
    // Prepare items list for counting
    if (type === 'raw_material') {
      await loadRawMaterials();
      stocktakeItemsList = allRawMaterials.map(rm => ({
        id: rm.id,
        name: rm.name,
        kind: 'مادة خام (' + rm.unit + ')',
        system_qty: Number(rm.quantity || 0),
        counted_qty: Number(rm.quantity || 0),
        variance: 0
      }));
    } else {
      const sRes = await window.inventory.list({ trackedOnly: true });
      stocktakeItemsList = (sRes.data || []).map(s => ({
        id: s.id,
        name: s.name,
        kind: 'صنف (' + (s.category_name || 'عام') + ')',
        system_qty: Number(s.quantity || 0),
        counted_qty: Number(s.quantity || 0),
        variance: 0
      }));
    }
    renderStocktakeItemsTable();
    showToast('بدأت جلسة الجرد بنجاح. أدخل الأعداد الفعلية ثم اضغط اعتماد.', 'info');
  } else {
    showToast('خطأ: ' + res.error, 'error');
  }
}

function filterStocktakeItems() {
  renderStocktakeItemsTable();
}

function renderStocktakeItemsTable() {
  const tbody = document.getElementById('stocktakeItemsBody');
  if (!tbody) return;
  const query = (document.getElementById('stocktakeScanInput')?.value || '').trim().toLowerCase();

  const filtered = stocktakeItemsList.filter(it => !query || it.name.toLowerCase().includes(query));
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="table-empty">لا توجد عناصر مطابقة</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map((it, idx) => {
    const diff = (it.counted_qty || 0) - (it.system_qty || 0);
    let diffColor = 'var(--text-muted)';
    if (diff > 0) diffColor = '#059669';
    if (diff < 0) diffColor = '#dc2626';

    return `
      <tr>
        <td style="font-weight:700;">${it.name}</td>
        <td><span class="badge badge-accent">${it.kind}</span></td>
        <td style="text-align:center; font-weight:800;">${it.system_qty}</td>
        <td style="text-align:center;">
          <input type="number" class="form-control" style="width:110px; text-align:center; font-weight:800; margin:0 auto;"
            value="${it.counted_qty}" step="0.01" onchange="updateStocktakeCount(${it.id}, this.value)" />
        </td>
        <td style="text-align:center; font-weight:800; color:${diffColor}; direction:ltr;">
          ${diff > 0 ? '+' : ''}${fmt(diff)}
        </td>
      </tr>
    `;
  }).join('');
}

async function updateStocktakeCount(itemId, val) {
  const item = stocktakeItemsList.find(x => x.id === itemId);
  if (!item || !activeStocktakeSession) return;
  const counted = parseFloat(val) || 0;
  item.counted_qty = counted;
  item.variance = counted - item.system_qty;

  await window.inventory.stocktakeSaveCount(activeStocktakeSession.id, itemId, counted, activeSessionType);
  renderStocktakeItemsTable();
}

async function completeStocktake() {
  if (!activeStocktakeSession) return;
  const confirm = await Swal.fire({
    title: 'اعتماد الجرد الفعلي؟',
    text: 'سيتم تعديل رصيد المخزن في البرنامج ليطابق الأعداد الفعلية وتسجيل الفروقات كحركات تسوية جرد.',
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'نعم، اعتماد وتحديث المخزن',
    cancelButtonText: 'إلغاء'
  });

  if (confirm.isConfirmed) {
    const res = await window.inventory.stocktakeComplete(activeStocktakeSession.id);
    if (res.success) {
      showToast('تم اعتماد الجرد وتحديث أرصدة المخزن بنجاح', 'success');
      document.getElementById('activeSessionArea').style.display = 'none';
      const sessionId = activeStocktakeSession.id;
      activeStocktakeSession = null;
      await loadStocktakeSessions();
      await loadRawMaterials();
      await loadDirectItems();
      viewStocktakeReport(sessionId);
    } else {
      showToast('خطأ: ' + res.error, 'error');
    }
  }
}

async function viewStocktakeReport(sessionId) {
  const res = await window.inventory.stocktakeGetReport(sessionId);
  if (!res.success) { showToast('فشل جلب التقرير: ' + res.error, 'error'); return; }
  const { session, items } = res.data;

  document.getElementById('reportModalTitle').textContent = `تقرير جلسة الجرد #${session.id} (${session.status})`;
  document.getElementById('reportModalSub').textContent = `التاريخ: ${session.start_date || '—'} | ملاحظات: ${session.notes || '—'}`;

  const tbodyHtml = (items || []).map((it, idx) => {
    const diff = (it.counted_quantity || 0) - (it.system_quantity || 0);
    return `
      <tr>
        <td>${idx + 1}</td>
        <td style="font-weight:700;">${it.service_name || '—'}</td>
        <td><span class="badge badge-accent">${it.item_kind || 'صنف'}</span></td>
        <td style="text-align:center;">${it.system_quantity || 0}</td>
        <td style="text-align:center; font-weight:800;">${it.counted_quantity || 0}</td>
        <td style="text-align:center; font-weight:800; color:${diff < 0 ? '#dc2626' : (diff > 0 ? '#059669' : 'var(--text-muted)')}; direction:ltr;">
          ${diff > 0 ? '+' : ''}${fmt(diff)}
        </td>
      </tr>
    `;
  }).join('');

  document.getElementById('reportModalBody').innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>#</th><th>البند</th><th>النوع</th>
          <th style="text-align:center;">الرصيد الدفتري</th>
          <th style="text-align:center;">الرصيد الفعلي</th>
          <th style="text-align:center;">الفارق</th>
        </tr>
      </thead>
      <tbody>
        ${tbodyHtml || '<tr><td colspan="6" class="table-empty">لا توجد عناصر</td></tr>'}
      </tbody>
    </table>
  `;

  openModal('stocktakeReportModal');
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── TAB 5: MOVEMENTS & WASTE (سجل الحركات وتتبع الهالك) ───────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
async function loadMovements() {
  try {
    const from = document.getElementById('movFrom')?.value || undefined;
    const to = document.getElementById('movTo')?.value || undefined;
    const movType = document.getElementById('movFilterType')?.value || undefined;

    const res = await window.inventory.getMovements(null, { from, to, movement_type: movType });
    if (!res.success) { showToast('خطأ: ' + res.error, 'error'); return; }
    renderMovementsTable(res.data || []);
  } catch (e) { console.error(e); }
}

function renderMovementsTable(movements) {
  const tbody = document.getElementById('movementsTableBody');
  if (!tbody) return;
  if (!movements.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="table-empty">لا توجد حركات مخزن مسجلة في هذا النطاق</td></tr>';
    return;
  }

  tbody.innerHTML = movements.map(m => {
    const chg = Number(m.quantity_change || 0);
    const isAdd = chg > 0;
    const typeMap = {
      'sale': 'بيع صنف (خصم)',
      'restock': 'توريد رصيد (+)',
      'waste': 'هالك / تالف 🗑',
      'stocktake_adjustment': 'تسوية جرد',
      'manual_edit': 'تعديل يدوي'
    };
    const tLabel = typeMap[m.movement_type] || m.movement_type;

    return `
      <tr>
        <td style="font-size:12px; color:var(--text-muted);">${m.created_at || '—'}</td>
        <td style="font-weight:700;">${m.item_name || '—'}</td>
        <td><span class="badge badge-accent">${m.item_kind || 'صنف'}</span></td>
        <td style="text-align:center;"><span class="badge badge-${m.movement_type === 'waste' ? 'danger' : 'neutral'}">${tLabel}</span></td>
        <td style="text-align:center; font-weight:800; color:${isAdd ? '#059669' : '#dc2626'}; direction:ltr;">
          ${isAdd ? '+' : ''}${fmt(chg)} ${m.item_unit || ''}
        </td>
        <td style="text-align:center; font-weight:700;">${fmt(m.quantity_after)}</td>
        <td style="font-size:12px; color:var(--text-muted);">${m.notes || '—'}</td>
      </tr>
    `;
  }).join('');
}

// ─── Quick Waste Modal ────────────────────────────────────────────────────────
function openWasteModal() {
  populateWasteItemSelect();
  document.getElementById('wasteQty').value = '';
  document.getElementById('wasteReason').value = '';
  openModal('wasteModal');
}

function populateWasteItemSelect() {
  const type = document.getElementById('wasteItemType').value;
  const sel = document.getElementById('wasteItemSelect');
  if (!sel) return;

  if (type === 'raw_material') {
    sel.innerHTML = allRawMaterials.map(rm => `<option value="${rm.id}">${rm.name} (رصيد: ${rm.quantity} ${rm.unit})</option>`).join('');
  } else {
    sel.innerHTML = directItems.map(i => `<option value="${i.id}">${i.name} (رصيد: ${i.quantity} قطعة)</option>`).join('');
  }
}

async function submitQuickWaste() {
  const type = document.getElementById('wasteItemType').value;
  const itemId = parseInt(document.getElementById('wasteItemSelect').value);
  const qty = parseFloat(document.getElementById('wasteQty').value);
  const reason = document.getElementById('wasteReason').value.trim();

  if (!itemId || isNaN(qty) || qty <= 0) {
    showToast('يرجى تحديد البند وإدخال كمية تالفة صحيحة', 'warning');
    return;
  }

  if (type === 'raw_material') {
    const res = await window.rawMaterials.adjustStock({
      id: itemId,
      type: 'waste',
      quantityChange: -qty,
      notes: reason || 'تسجيل هالك وتالف يدوي'
    });
    if (res.success) {
      showToast('تم تسجيل الهالك وخصم الرصيد بنجاح', 'success');
      closeModal('wasteModal');
      await loadRawMaterials();
      await loadMovements();
    } else {
      showToast('فشل: ' + res.error, 'error');
    }
  } else {
    // For direct service
    const srv = directItems.find(x => x.id === itemId);
    const newQty = Math.max(0, (srv?.quantity || 0) - qty);
    const res = await window.inventory.setQuantity(itemId, newQty, reason ? ('هالك: ' + reason) : 'تسجيل هالك بضاعة');
    if (res.success) {
      showToast('تم تسجيل الهالك وخصم الرصيد بنجاح', 'success');
      closeModal('wasteModal');
      await loadDirectItems();
      await loadMovements();
    } else {
      showToast('فشل: ' + res.error, 'error');
    }
  }
}

// ─── Barcode Printing Helpers ─────────────────────────────────────────────────
function openPrintBarcodeModal() {
  searchBarcodeItems();
  openModal('printBarcodeModal');
}

function searchBarcodeItems() {
  const q = (document.getElementById('barcodeSearchInput')?.value || '').trim().toLowerCase();
  const c = document.getElementById('barcodeItemsList');
  if (!c) return;

  const filtered = directItems.filter(i => !q || (i.name && i.name.toLowerCase().includes(q)) || (i.barcode && i.barcode.includes(q)));
  if (!filtered.length) {
    c.innerHTML = '<div class="table-empty">لا توجد أصناف</div>';
    return;
  }

  c.innerHTML = filtered.map(i => `
    <div style="padding:8px 12px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
      <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
        <input type="checkbox" class="barcode-item-chk" value="${i.id}" data-name="${i.name}" data-barcode="${i.barcode || ''}" data-price="${i.sell_price}" />
        <span style="font-weight:700; font-size:13px;">${i.name}</span>
      </label>
      <span style="font-size:11px; color:var(--text-muted);">${i.barcode || 'بدون باركود'}</span>
    </div>
  `).join('');
}

async function doPrintBarcodeLabels() {
  const chks = Array.from(document.querySelectorAll('.barcode-item-chk:checked'));
  if (!chks.length) {
    showToast('يرجى تحديد صنف واحد على الأقل للطباعة', 'warning');
    return;
  }
  const copies = parseInt(document.getElementById('barcodeCopiesInput').value) || 1;
  const items = chks.map(c => ({
    id: parseInt(c.value),
    name: c.getAttribute('data-name'),
    barcode: c.getAttribute('data-barcode'),
    sell_price: parseFloat(c.getAttribute('data-price')) || 0
  }));

  const res = await window.inventory.printBarcodeLabels(items, copies);
  if (res.success) {
    showToast('تم إرسال أمر الطباعة بنجاح', 'success');
    closeModal('printBarcodeModal');
  } else {
    showToast('فشل الطباعة: ' + res.error, 'error');
  }
}
