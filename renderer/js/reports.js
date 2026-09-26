
function fmt(n){ return Number(n||0).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}); }

// ─── Tabs ────────────────────────────────────────────────────────────────────
function switchTab(tabId, btn) {
  document.querySelectorAll('.rpt-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  
  document.querySelectorAll('.rpt-section').forEach(s => s.classList.remove('active'));
  document.getElementById('sec-' + tabId).classList.add('active');
  
  if(tabId === 'sales') loadSalesReport();
  if(tabId === 'delivery') loadDeliveryReport();
  if(tabId === 'raw_inventory') loadRawInventoryReport();
  if(tabId === 'purchases') loadPurchasesReport();
  if(tabId === 'shifts') loadShiftsReport();
  if(tabId === 'income') loadIncomeStatement();
}

// ─── Date Init ────────────────────────────────────────────────────────────────
const today = getLocalISODate();
const firstDay = today.slice(0,7) + '-01';

if(document.getElementById('salesFrom')) document.getElementById('salesFrom').value = firstDay;
if(document.getElementById('salesTo')) document.getElementById('salesTo').value = today;
if(document.getElementById('delFrom')) document.getElementById('delFrom').value = firstDay;
if(document.getElementById('delTo')) document.getElementById('delTo').value = today;
if(document.getElementById('purFrom')) document.getElementById('purFrom').value = firstDay;
if(document.getElementById('purTo')) document.getElementById('purTo').value = today;
if(document.getElementById('shiftFrom')) document.getElementById('shiftFrom').value = firstDay;
if(document.getElementById('shiftTo')) document.getElementById('shiftTo').value = today;
if(document.getElementById('incomeMonth')) document.getElementById('incomeMonth').value = today.slice(0,7);

// ─── Fast Search & Pagination State ───────────────────────────────────────────
let searchDebounceTimer = null;
let currentSalesData = [];
let currentSalesPage = 1;
const SALES_PAGE_SIZE = 50;

function onSalesSearchInput() {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    currentSalesPage = 1;
    loadSalesReport();
  }, 300);
}

function changeSalesPage(delta) {
  const totalPages = Math.ceil(currentSalesData.length / SALES_PAGE_SIZE) || 1;
  currentSalesPage = Math.max(1, Math.min(totalPages, currentSalesPage + delta));
  renderSalesTablePage();
}

function renderSalesTablePage() {
  const tbody = document.getElementById('salesTableBody');
  const countInfo = document.getElementById('salesCountInfo');
  const pageNum = document.getElementById('salesPageNum');
  const prevBtn = document.getElementById('salesPrevBtn');
  const nextBtn = document.getElementById('salesNextBtn');

  if (!currentSalesData || !currentSalesData.length) {
    tbody.innerHTML = '<tr><td colspan="12" class="table-empty">لا توجد مبيعات تطابق البحث</td></tr>';
    if (countInfo) countInfo.textContent = 'إجمالي النتائج: 0';
    if (pageNum) pageNum.textContent = 'صفحة 1 من 1';
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    return;
  }

  const totalPages = Math.ceil(currentSalesData.length / SALES_PAGE_SIZE) || 1;
  currentSalesPage = Math.max(1, Math.min(totalPages, currentSalesPage));

  const startIdx = (currentSalesPage - 1) * SALES_PAGE_SIZE;
  const endIdx = Math.min(startIdx + SALES_PAGE_SIZE, currentSalesData.length);
  const pageItems = currentSalesData.slice(startIdx, endIdx);

  if (countInfo) {
    countInfo.textContent = `عرض ${startIdx + 1} - ${endIdx} من إجمالي ${currentSalesData.length} فاتورة`;
  }
  if (pageNum) {
    pageNum.textContent = `صفحة ${currentSalesPage} من ${totalPages}`;
  }
  if (prevBtn) prevBtn.disabled = currentSalesPage <= 1;
  if (nextBtn) nextBtn.disabled = currentSalesPage >= totalPages;

  tbody.innerHTML = pageItems.map(r => {
    const statusColor = r.status === 'تم التسليم' ? 'success' : (r.status === 'في انتظار الاستلام' ? 'primary' : 'warning');
    const statusBadge = r.is_returned
      ? `<span class="badge badge-danger" title="فاتورة مرتجعة - لا يمكن تغيير الحالة">${r.status || 'مرتجع'}</span>`
      : `<span class="badge badge-${statusColor}" style="cursor:pointer;" onclick="changeInvoiceStatus(${r.id}, '${r.status}', ${r.remaining || 0})"><bdi>${r.status || 'تحت الشغل'}</bdi></span>`;
    return `
      <tr class="${r.is_returned?'bg-red-50':''}">
        <td style="font-weight:700;color:var(--primary);">${r.invoice_number} ${r.is_returned?'<span class="badge badge-danger">مرتجع</span>':''}</td>
        <td>${r.invoice_date}</td>
        <td>${r.customer_name || 'عميل نقدي'}</td>
        <td>${r.emp_name || '—'}</td>
        <td>${statusBadge}</td>
        <td><span class="badge ${r.payment_method==='أجل'?'badge-warning':'badge-success'}">${r.payment_method}</span></td>
        <td>${fmt(r.subtotal)}</td>
        <td style="color:var(--danger);">${fmt((r.discount_amount||0) + ((r.subtotal||0)*(r.discount_percent||0)/100))}</td>
        <td style="font-weight:700;color:var(--accent);">${fmt(r.dynamic_net_total)}</td>
        <td style="color:var(--success);">${fmt(r.amount_paid)}</td>
        <td style="color:var(--danger);">${fmt(r.remaining)}</td>
        <td style="display:flex;gap:4px;flex-wrap:nowrap;">
          ${r.remaining > 0 && !r.is_returned ? `<button class="btn btn-sm btn-success" onclick="payInvoiceDebt(${r.id}, ${r.remaining})">تسديد</button>` : ''}
          <button class="btn btn-sm btn-outline" onclick='reprintPastInvoice(${JSON.stringify(r).replace(/\\x27/g,"&apos;")})' style="border-color:var(--text-muted); color:var(--text-primary);">طباعة</button>
        </td>
      </tr>
    `;
  }).join('');
}

// ─── Sales Report ─────────────────────────────────────────────────────────────
async function loadSalesReport() {
  const from = document.getElementById('salesFrom').value;
  const to = document.getElementById('salesTo').value;
  const search = document.getElementById('salesSearch').value.trim();
  const statusFilter = document.getElementById('salesStatusFilter')?.value || '';
  
  let sql = `SELECT i.*, 
                    c.name as customer_name,
                    e.name as emp_name,
                    (i.net_total - COALESCE(rr.total_returned, 0)) as dynamic_net_total
             FROM invoices i 
             LEFT JOIN customers c ON i.customer_id = c.id 
             LEFT JOIN employees e ON i.employee_id = e.id
             LEFT JOIN (SELECT original_invoice_id, SUM(total_returned) as total_returned FROM returns GROUP BY original_invoice_id) rr ON rr.original_invoice_id = i.id
             WHERE 1=1`;
  const params = [];

  // ─── منطق البحث + التاريخ ──────────────────────────────────────────────────
  // البحث السريع عبر كامل الفواتير برقم الفاتورة أو اسم العميل
  const isInvoiceNumberSearch = search && (search.toLowerCase().includes('inv') || /\d/.test(search));

  if(search) {
    sql += ` AND (i.invoice_number LIKE ? OR c.name LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }

  // شرط التاريخ: يُطبَّق دائماً إلا لو كان البحث برقم فاتورة
  if(!isInvoiceNumberSearch) {
    sql += ` AND i.invoice_date BETWEEN ? AND ?`;
    params.push(from || '2000-01-01', to || '2099-12-31');
  }
  
  if(statusFilter === 'غير مسددة') {
    sql += ` AND i.remaining > 0`;
  } else if(statusFilter) {
    sql += ` AND i.status = ?`;
    params.push(statusFilter);
  }

  sql += ' ORDER BY i.id DESC';
  
  const res = await window.db.query(sql, params);
  
  if(!res.success || !res.data.length) {
    currentSalesData = [];
    renderSalesTablePage();
    document.getElementById('salesTotal').textContent = '0.00';
    document.getElementById('salesPaid').textContent = '0.00';
    document.getElementById('salesDelivered').textContent = '0';
    document.getElementById('salesInProgress').textContent = '0';
    document.getElementById('salesAwaiting').textContent = '0';
    document.getElementById('salesUnpaidAmount').textContent = '0.00';
    return;
  }
  
  currentSalesData = res.data;

  const totals = res.data.reduce((s, r) => {
    return {
      t: s.t + (r.dynamic_net_total || 0),
      p: s.p + (r.amount_paid || 0),
      rem: s.rem + (r.remaining || 0),
      delivered: s.delivered + (r.status === 'تم التسليم' ? 1 : 0),
      inProgress: s.inProgress + (r.status === 'تحت الشغل' ? 1 : 0),
      awaiting: s.awaiting + (r.status === 'في انتظار الاستلام' ? 1 : 0),
      unpaidAmt: s.unpaidAmt + (r.remaining > 0 ? r.remaining : 0)
    };
  }, { t: 0, p: 0, rem: 0, delivered: 0, inProgress: 0, awaiting: 0, unpaidAmt: 0 });
  
  renderSalesTablePage();
  
  document.getElementById('salesTotal').textContent = fmt(totals.t);
  document.getElementById('salesPaid').textContent = fmt(totals.p);
  document.getElementById('salesDelivered').textContent = totals.delivered;
  document.getElementById('salesInProgress').textContent = totals.inProgress;
  document.getElementById('salesAwaiting').textContent = totals.awaiting;
  document.getElementById('salesUnpaidAmount').textContent = fmt(totals.unpaidAmt);
}

async function changeInvoiceStatus(id, currentStatus, remainingAmount) {
  const { value: newStatus } = await Swal.fire({
    title: 'تغيير حالة الفاتورة',
    input: 'select',
    inputOptions: {
      'تحت الشغل': 'تحت الشغل',
      'في انتظار الاستلام': 'في انتظار الاستلام',
      'تم التسليم': 'تم التسليم'
    },
    inputValue: currentStatus || 'تحت الشغل',
    showCancelButton: true,
    confirmButtonText: 'تغيير',
    cancelButtonText: 'إلغاء',
    inputPlaceholder: 'اختر الحالة'
  });

  if (!newStatus || newStatus === currentStatus) return;

  // لو اختار "محاسَبة" أو "تم التسليم" وفيه مبلغ متبقي → اسأله عن الخزنة وسدد أولاً وابعت رسالة واحدة
  if ((newStatus === 'محاسَبة' || newStatus === 'تم التسليم') && remainingAmount > 0) {
    const { value: safeType } = await Swal.fire({
      title: `تسديد الباقي (${fmt(remainingAmount)} جنيه)`,
      text: 'يوجد مبلغ متبقي على هذه الفاتورة، اختر خزنة الاستلام:',
      input: 'select',
      inputOptions: {
        'الخزينة': 'الخزنة النقدية',
        'فودافون كاش': 'فودافون كاش',
        'إنستا باي': 'إنستا باي',
        'فيزا': 'فيزا / بطاقة'
      },
      inputValue: 'الخزينة',
      showCancelButton: true,
      confirmButtonText: 'تسديد وتسليم',
      cancelButtonText: 'إلغاء'
    });
    if (!safeType) return; // ألغى
    const payRes = await window.db.payInvoiceRemaining(id, remainingAmount, safeType);
    if (!payRes.success) {
      showToast('خطأ في تسديد المبلغ: ' + payRes.error, 'error');
      return;
    }
    
    // غيّر الحالة
    const res = await window.db.updateInvoiceStatus(id, newStatus);
    if (!res.success) {
      showToast('حدث خطأ: ' + res.error, 'error');
      return;
    }

    showToast('تم التسديد والتسليم بنجاح', 'success');
    loadSalesReport();

    // رسالة مدمجة
    const invRes = await window.db.queryOne(
      `SELECT i.invoice_number, i.amount_paid, c.name as customer_name, c.phone as customer_phone
       FROM invoices i LEFT JOIN customers c ON i.customer_id = c.id WHERE i.id = ?`,
      [id]
    );
    if (invRes.success && invRes.data && invRes.data.customer_phone && invRes.data.customer_phone.trim() !== '' && invRes.data.customer_phone !== 'null') {
      const inv = invRes.data;
      const waStatus = await window.whatsapp.getStatus();
      if (waStatus.ready) {
        const waRes = await window.whatsapp.sendDelivered({
          phone: inv.customer_phone,
          customerName: inv.customer_name || 'عميلنا العزيز',
          invoiceNumber: inv.invoice_number,
        });
        if (!waRes.success) {
          showToast('فشل إرسال واتساب: ' + waRes.error, 'warning');
          console.error('[WhatsApp]', waRes.error);
        }
      }
    }
    return; // خروج لعدم إرسال رسائل أخرى
  }

  // الحالات العادية أو تم التسليم بدون باقي
  const res = await window.db.updateInvoiceStatus(id, newStatus);
  if (!res.success) {
    showToast('حدث خطأ: ' + res.error, 'error');
    return;
  }

  showToast('تم تغيير الحالة بنجاح', 'success');

  // إرسال واتساب حسب الحالة المختارة
  if (newStatus === 'في انتظار الاستلام') {
    await sendReadyWhatsApp(id);
  } else if (newStatus === 'تم التسليم') {
    await sendDeliveredWhatsApp(id);
  }

  loadSalesReport();
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
        loadSalesReport(); // refresh
      } else {
        showToast('خطأ: ' + dbRes.error, 'error');
      }
    } else {
      showToast('مبلغ غير صحيح', 'error');
    }
  }
}

// رسالة "جاهز للاستلام"
async function sendReadyWhatsApp(invoiceId) {
  const invRes = await window.db.queryOne(
    `SELECT i.invoice_number, c.name as customer_name, c.phone as customer_phone
     FROM invoices i LEFT JOIN customers c ON i.customer_id = c.id WHERE i.id = ?`,
    [invoiceId]
  );
  if (!invRes.success || !invRes.data) return;
  const inv = invRes.data;
  if (!inv.customer_phone || inv.customer_phone.trim() === '' || inv.customer_phone === 'null') {
    showToast('العميل ليس لديه رقم تليفون - لم يتم إرسال واتساب', 'warning'); return;
  }
  const waStatus = await window.whatsapp.getStatus();
  if (!waStatus.ready) {
    showToast('واتساب غير متصل — تحقق من الإعدادات', 'warning'); return;
  }
  const res = await window.whatsapp.sendOrderReady({
    phone: inv.customer_phone,
    customerName: inv.customer_name,
    invoiceNumber: inv.invoice_number,
  });
  if (!res.success) showToast('فشل الإرسال: ' + res.error, 'warning');
}

// رسالة "تم التسليم"
async function sendDeliveredWhatsApp(invoiceId) {
  const invRes = await window.db.queryOne(
    `SELECT i.invoice_number, c.name as customer_name, c.phone as customer_phone
     FROM invoices i LEFT JOIN customers c ON i.customer_id = c.id WHERE i.id = ?`,
    [invoiceId]
  );
  if (!invRes.success || !invRes.data) return;
  const inv = invRes.data;
  if (!inv.customer_phone || inv.customer_phone.trim() === '' || inv.customer_phone === 'null') return;
  const waStatus = await window.whatsapp.getStatus();
  if (!waStatus.ready) return;
  const res = await window.whatsapp.sendDelivered({
    phone: inv.customer_phone,
    customerName: inv.customer_name,
    invoiceNumber: inv.invoice_number,
  });
  if (!res.success) {
    showToast('فشل إرسال واتساب: ' + res.error, 'warning');
    console.error('[WhatsApp]', res.error);
  }
}

async function payInvoiceDebt(id, maxAmount) {
  const { value: formValues } = await Swal.fire({
    title: 'سداد مديونية الفاتورة',
    html: `
      <div class="form-group" style="text-align:right;">
        <label>المبلغ المتبقي: ${maxAmount} جنيه</label>
        <input id="swal-amount" type="number" class="swal2-input" style="margin: 10px 0; width: 90%;" value="${maxAmount}" max="${maxAmount}" min="0.01" step="0.01">
      </div>
      <div class="form-group" style="text-align:right;">
        <label>إيداع في</label>
        <select id="swal-safe" class="swal2-select" style="display: flex; margin: 10px 0; width: 90%;">
          <option value="الخزينة">الخزنة النقدية</option>
          <option value="فودافون كاش">فودافون كاش</option>
          <option value="إنستا باي">إنستا باي</option>
        </select>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'تسديد',
    cancelButtonText: 'إلغاء',
    preConfirm: () => {
      const amount = document.getElementById('swal-amount').value;
      const safeType = document.getElementById('swal-safe').value;
      if (!amount || amount <= 0) {
        Swal.showValidationMessage('الرجاء إدخال مبلغ صحيح');
        return false;
      }
      if (parseFloat(amount) > maxAmount) {
        Swal.showValidationMessage('المبلغ المدخل أكبر من المتبقي');
        return false;
      }
      return { amount: parseFloat(amount), safeType };
    }
  });

  if (!formValues) return;

  const res = await window.db.payInvoiceRemaining(id, formValues.amount, formValues.safeType);
  if (!res.success) {
    Swal.fire('خطأ', res.error, 'error');
    return;
  }

  // جيب بيانات الفاتورة بعد التسديد لإرسال واتساب
  const invRes = await window.db.queryOne(
    `SELECT i.invoice_number, i.net_total, i.amount_paid, i.remaining,
            c.name as customer_name, c.phone as customer_phone
     FROM invoices i LEFT JOIN customers c ON i.customer_id = c.id WHERE i.id = ?`,
    [id]
  );

  loadSalesReport();

  // إرسال واتساب للعميل
  if (invRes.success && invRes.data && invRes.data.customer_phone &&
      invRes.data.customer_phone !== 'null' && invRes.data.customer_phone.trim() !== '') {

    const inv = invRes.data;
    let waPhone = inv.customer_phone.replace(/\s+/g, '');
    if (waPhone.startsWith('01')) waPhone = '2' + waPhone;
    let cName = inv.customer_name || 'عميلنا العزيز';
    if (cName !== 'عميلنا العزيز' && !cName.startsWith('أ/')) {
      cName = 'أ/ ' + cName;
    }
    const invNum = inv.invoice_number || '—';
    const paidNow = fmt(formValues.amount);
    const totalPaid = fmt(inv.amount_paid);
    const remaining = parseFloat(inv.remaining) || 0;
    const customerMethod = formValues.safeType === 'الخزينة' ? 'نقدي' : 'تحويل';

    const waStatus = await window.whatsapp.getStatus();
    if (waStatus.ready) {
      if (remaining <= 0) {
        await window.whatsapp.sendFullPayment({
          phone: inv.customer_phone,
          customerName: inv.customer_name,
          invoiceNumber: inv.invoice_number,
          paidNow: paidNow,
          paymentMethod: formValues.safeType,
        });
      } else {
        await window.whatsapp.sendPartialPayment({
          phone: inv.customer_phone,
          customerName: inv.customer_name,
          invoiceNumber: inv.invoice_number,
          paidNow: paidNow,
          totalPaid: totalPaid,
          remaining: fmt(remaining),
          paymentMethod: formValues.safeType,
        });
      }
    }
  } else {
    Swal.fire('تم السداد', 'تم تسديد المبلغ بنجاح', 'success');
  }
}


// ─── Purchases Report ─────────────────────────────────────────────────────────
async function loadPurchasesReport() {
  const from = document.getElementById('purFrom').value;
  const to = document.getElementById('purTo').value;
  
  const res = await window.db.query(`
    SELECT p.*, s.name as supplier_name 
    FROM purchases p 
    LEFT JOIN suppliers s ON p.supplier_id = s.id
    WHERE p.purchase_date BETWEEN ? AND ?
    ORDER BY p.id DESC
  `, [from || '2000-01-01', to || '2099-12-31']);
  
  const tbody = document.getElementById('purchasesTableBody');
  
  if(!res.success || !res.data.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="table-empty">لا توجد مشتريات في هذه الفترة</td></tr>';
    document.getElementById('purTotal').textContent = '0.00';
    document.getElementById('purPaid').textContent = '0.00';
    document.getElementById('purRemaining').textContent = '0.00';
    return;
  }
  
  let total = 0, paid = 0, rem = 0;
  
  tbody.innerHTML = res.data.map(r => {
    total += (r.total || 0); paid += (r.amount_paid || 0); rem += (r.remaining || 0);
    return `
      <tr style="border-bottom:1px solid var(--border);">
        <td style="font-weight:700;">${r.purchase_date}</td>
        <td>${r.supplier_name || '—'}</td>
        <td style="color:var(--accent); font-weight:700;">${fmt(r.total)}</td>
        <td style="color:var(--success);">${fmt(r.amount_paid)}</td>
        <td style="color:var(--danger);">${fmt(r.remaining)}</td>
        <td>${r.notes || '—'}</td>
      </tr>
    `;
  }).join('');
  
  document.getElementById('purTotal').textContent = fmt(total);
  document.getElementById('purPaid').textContent = fmt(paid);
  document.getElementById('purRemaining').textContent = fmt(rem);
}

// ─── Shifts Report ────────────────────────────────────────────────────────────
async function loadShiftsReport() {
  const from = document.getElementById('shiftFrom').value;
  const to = document.getElementById('shiftTo').value;
  
  const res = await window.db.query(`
    SELECT s.*, e.name as emp_name, date(s.start_time) as shift_date
    FROM shifts s 
    LEFT JOIN employees e ON s.employee_id = e.id
    WHERE date(s.start_time) BETWEEN ? AND ?
    ORDER BY s.id DESC
  `, [from || '2000-01-01', to || '2099-12-31']);
  
  const tbody = document.getElementById('shiftsTableBody');
  if(!res.success || !res.data.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="table-empty">لا توجد شيفتات في هذه الفترة</td></tr>';
    return;
  }
  
  tbody.innerHTML = res.data.map(r => `
    <tr>
      <td style="font-weight:700;">#${r.id}</td>
      <td>${r.shift_date || '—'}</td>
      <td>${r.emp_name || '—'}</td>
      <td>${r.start_time ? r.start_time.split('T').pop()?.split(' ').pop()?.slice(0,5) || r.start_time.slice(11,16) : '—'}</td>
      <td>${r.end_time ? r.end_time.split('T').pop()?.split(' ').pop()?.slice(0,5) || r.end_time.slice(11,16) : '<span class="badge badge-success">مفتوح</span>'}</td>
      <td style="color:var(--success);font-weight:700;">${fmt(r.total_sales)}</td>
      <td style="color:var(--danger);font-weight:700;">${fmt(r.total_expenses)}</td>
    </tr>
  `).join('');
}

// ─── Income Statement ─────────────────────────────────────────────────────────
async function loadIncomeStatement() {
  const month = document.getElementById('incomeMonth').value; // YYYY-MM
  if(!month) return;
  
  const startDate = `${month}-01`;
  const endDate = `${month}-31`; // sqlite between handles invalid days gracefully
  
  // Sales
  const salesRes = await window.db.queryOne(`SELECT COALESCE(SUM(net_total),0) as t FROM invoices WHERE invoice_date BETWEEN ? AND ?`, [startDate, endDate]);
  const sales = salesRes.data?.t || 0;
  
  // Other Rev
  const revRes = await window.db.queryOne(`SELECT COALESCE(SUM(amount),0) as t FROM revenues WHERE date BETWEEN ? AND ?`, [startDate, endDate]);
  const otherRev = revRes.data?.t || 0;
  
  // Returns
  const retRes = await window.db.queryOne(`SELECT COALESCE(SUM(total_returned),0) as t FROM returns WHERE return_date BETWEEN ? AND ?`, [startDate, endDate]);
  const returns = retRes.data?.t || 0;
  
  // Expenses
  const expRes = await window.db.queryOne(`SELECT COALESCE(SUM(amount),0) as t FROM expenses WHERE date BETWEEN ? AND ?`, [startDate, endDate]);
  const expenses = expRes.data?.t || 0;
  
  // Salaries Paid
  const salRes = await window.db.queryOne(`SELECT COALESCE(SUM(net_salary),0) as t FROM salary_payments WHERE month=?`, [month]);
  const salaries = salRes.data?.t || 0;
  
  // COGS (Approximate via items for the period)
  const cogsRes = await window.db.queryOne(`
    SELECT COALESCE(SUM(ii.quantity * s.cost_price),0) as t 
    FROM invoice_items ii 
    JOIN invoices i ON ii.invoice_id = i.id 
    LEFT JOIN services s ON ii.service_id = s.id
    WHERE i.invoice_date BETWEEN ? AND ?
  `, [startDate, endDate]);
  const cogs = cogsRes.data?.t || 0;
  
  const totalRev = sales + otherRev;
  const totalExp = cogs + returns + expenses + salaries;
  const netIncome = totalRev - totalExp;
  
  document.getElementById('inc_sales').textContent = fmt(sales);
  document.getElementById('inc_other_rev').textContent = fmt(otherRev);
  document.getElementById('inc_total_rev').textContent = fmt(totalRev);
  
  document.getElementById('inc_cogs').textContent = fmt(cogs);
  document.getElementById('inc_returns').textContent = fmt(returns);
  document.getElementById('inc_expenses').textContent = fmt(expenses);
  document.getElementById('inc_salaries').textContent = fmt(salaries);
  document.getElementById('inc_total_exp').textContent = fmt(totalExp);
  
  const netEl = document.getElementById('inc_net_income');
  netEl.textContent = fmt(netIncome);
  netEl.style.color = netIncome >= 0 ? 'var(--success)' : 'var(--danger)';
}

// ─── Cleanup Functions ────────────────────────────────────────────────────────
async function truncateInvoices() {
  const { value: text } = await Swal.fire({
    title: 'حذف الفواتير نهائياً',
    text: 'اكتب كلمة "تأكيد" في المربع أدناه للمتابعة:',
    input: 'text',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#3085d6',
    confirmButtonText: 'تأكيد الحذف',
    cancelButtonText: 'إلغاء'
  });
  if (text !== 'تأكيد') {
    showToast('تم إلغاء العملية','info'); return;
  }
  await window.db.run('DELETE FROM invoice_items',[]);
  await window.db.run('DELETE FROM return_items',[]);
  await window.db.run('DELETE FROM returns',[]);
  await window.db.run('DELETE FROM invoices',[]);
  await window.db.run('UPDATE invoice_sequence SET last_number=0',[]);
  showToast('تم حذف الفواتير وتصفير العداد','success');
}

async function truncateFinance() {
  const { value: text } = await Swal.fire({
    title: 'حذف المالية نهائياً',
    text: 'اكتب كلمة "تأكيد" في المربع أدناه للمتابعة:',
    input: 'text',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#3085d6',
    confirmButtonText: 'تأكيد الحذف',
    cancelButtonText: 'إلغاء'
  });
  if (text !== 'تأكيد') {
    showToast('تم إلغاء العملية','info'); return;
  }
  await window.db.run('DELETE FROM expenses',[]);
  await window.db.run('DELETE FROM revenues',[]);
  await window.db.run('DELETE FROM treasury',[]);
  await window.db.run('DELETE FROM salary_payments',[]);
  // add default treasury back
  await window.db.run(`INSERT INTO treasury (type, description, amount, balance_after, treasury_type) VALUES ('إيراد', 'رصيد افتتاحي', 0, 0, 'الخزينة')`,[]);
  showToast('تم مسح سجلات الخزينة والمصروفات','success');
}

async function reprintPastInvoice(inv) {
  try {
    const itemsRes = await window.db.query('SELECT * FROM invoice_items WHERE invoice_id = ?', [inv.id]);
    inv.items = itemsRes.data || [];
    const settingsRes = await window.db.getSettings();
    const settings = settingsRes.success ? settingsRes.data : {};
    
    // جلب أحدث بيانات الفاتورة للتأكد من الكاشير
    let cashierName = inv.emp_name || '';
    if (inv.id) {
      const freshInv = await window.db.queryOne(
        `SELECT i.*, c.name as customer_name, c.phone as customer_phone,
                e.name as cashier_name
         FROM invoices i
         LEFT JOIN customers c ON i.customer_id = c.id
         LEFT JOIN employees e ON i.employee_id = e.id
         WHERE i.id = ?`,
        [inv.id]
      );
      if (freshInv.success && freshInv.data) {
        inv = Object.assign({}, inv, freshInv.data);
        cashierName = freshInv.data.cashier_name || '';
      }
    }
    
    const curr = settings.currency || 'ج.م';
    const hasDiscount = parseFloat(inv.discount_amount || 0) > 0;
    const deliveryFee = parseFloat(inv.delivery_fee || 0);

    const safeLogo = settings.logo_path ? 'file:///' + settings.logo_path.replace(/\\/g, '/') : '';
    const logoHTML = safeLogo ? `<div style="text-align:center; margin-bottom:2px;"><img src="${safeLogo}" style="max-height:42px; max-width:140px; object-fit:contain;"></div>` : '';
    
    let contactDetails = [];
    if (settings.phone) contactDetails.push(`ت: ${settings.phone}`);
    if (settings.address) contactDetails.push(settings.address);
    const contactHTML = contactDetails.length > 0 
      ? `<div style="text-align:center; font-size:11px; font-weight:800; color:#333; margin-bottom:2px;">${contactDetails.join(' | ')}</div>` 
      : '';

    const itemsRows = inv.items.map((item) => `
      <tr style="border-bottom:1px dashed #666;">
        <td style="padding:3px 1px; vertical-align:middle;">
          <div style="font-size:13px; font-weight:900; line-height:1.2; color:#000;">${item.service_name}</div>
          ${item.notes ? `<div style="font-size:11px; font-weight:800; color:#333; margin-top:1px;">↳ ${item.notes}</div>` : ''}
        </td>
        <td style="text-align:center; padding:3px 1px; font-size:14px; font-weight:900; vertical-align:middle; width:38px;">${item.quantity}</td>
        <td style="text-align:left; padding:3px 1px; font-size:13px; font-weight:900; vertical-align:middle; width:65px;">${fmt(item.total)}</td>
      </tr>
    `).join('');

    const invNum = inv.invoice_number;
    const date = inv.invoice_date;
    const subtotal = fmt(inv.subtotal||0);
    const discount = fmt(inv.discount_amount||0);
    const net = fmt(inv.net_total||0);
    const paid = fmt(inv.amount_paid||0);
    const remaining = fmt(inv.remaining||0);

    let custName = (inv.customer_name && inv.customer_name !== 'عميل نقدي') ? inv.customer_name : '';
    const notesStr = inv.notes || '';
    const invoiceNotesHTML = notesStr ? `<div style="font-size:11px; font-weight:800; border-top:1px dashed #000; padding-top:2px; margin-top:2px;">ملاحظات: ${notesStr}</div>` : '';
    const settingsNotesHTML = settings.receipt_notes ? `<div style="text-align:center; font-size:10px; font-weight:700; margin-top:1px; color:#444;">${settings.receipt_notes}</div>` : '';
    const receiptFooterHTML = settings.receipt_footer ? `<div style="text-align:center; font-weight:900; font-size:12px; margin-top:3px;">${settings.receipt_footer}</div>` : `<div style="text-align:center; font-weight:900; font-size:12px; margin-top:3px;">شكراً لزيارتكم ☕</div>`;

    const receiptHTML = `
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
        <div style="text-align:center; font-size:18px; font-weight:900; line-height:1.2; margin-bottom:2px; letter-spacing:0.3px;">${settings.company_name || 'كافيه ومطعم برو'}</div>
        ${contactHTML}

        <div style="border-top:1.5px dashed #000; margin:2px 0;"></div>
        <div style="display:flex; justify-content:space-between; font-size:12px; font-weight:900; line-height:1.3;">
          <span>فاتورة: #${invNum}</span>
          <span>${inv.invoice_type || 'طلب بيع'}</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:11px; font-weight:800; color:#222; line-height:1.3;">
          <span>${date}</span>
          ${custName ? `<span>العميل: ${custName}</span>` : ''}
        </div>
        ${cashierName ? `<div style="font-size:11px; font-weight:800; color:#444;">الكاشير: ${cashierName}</div>` : ''}
        <div style="border-top:1.5px dashed #000; margin:2px 0;"></div>

        <table style="width:100%; border-collapse:collapse; text-align:right; margin:2px 0;">
          <thead>
            <tr style="border-bottom:1.5px solid #000; font-size:12px; font-weight:900;">
              <th style="padding:2px 1px;">الصنف والتخصيص</th>
              <th style="text-align:center; width:38px; padding:2px 1px;">الكمية</th>
              <th style="text-align:left; width:65px; padding:2px 1px;">الإجمالي</th>
            </tr>
          </thead>
          <tbody>${itemsRows}</tbody>
        </table>

        <div style="border-top:1px dashed #000; margin:2px 0;"></div>
        ${hasDiscount ? `
          <div style="display:flex; justify-content:space-between; font-size:11px; font-weight:800;">
            <span>الإجمالي:</span>
            <span>${subtotal} ${curr}</span>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:11px; font-weight:800;">
            <span>الخصم:</span>
            <span>-${discount} ${curr}</span>
          </div>
        ` : ''}
        ${deliveryFee > 0 ? `
          <div style="display:flex; justify-content:space-between; font-size:11px; font-weight:800;">
            <span>خدمة التوصيل:</span>
            <span>+${fmt(deliveryFee)} ${curr}</span>
          </div>
        ` : ''}

        <div style="border-top:2px solid #000; border-bottom:2px solid #000; padding:2px 0; margin:2px 0; display:flex; justify-content:space-between; font-size:17px; font-weight:900;">
          <span>الصافي المطلوب:</span>
          <span>${net} ${curr}</span>
        </div>

        <div style="display:flex; justify-content:space-between; font-size:12px; font-weight:800; margin-top:2px;">
          <span>المدفوع: ${paid} ${curr}</span>
          <span>${parseFloat(inv.remaining || 0) > 0 ? `المتبقي: ${remaining}` : `الباقي: 0.00`} ${curr}</span>
        </div>

        ${invoiceNotesHTML}
        <div style="border-top:1px dashed #000; margin:3px 0 2px;"></div>
        ${receiptFooterHTML}
        ${settingsNotesHTML}
      </div>`;

    Swal.fire({
      title: 'معاينة الطباعة',
      html: `<div style="display:flex;justify-content:center;max-height:400px;overflow-y:auto;background:#fff;padding:10px;border:1px solid #ddd;border-radius:8px;width:100%;max-width:80mm;margin:0 auto;">${receiptHTML}</div>`,
      showCancelButton: true,
      confirmButtonText: 'طباعة الآن',
      cancelButtonText: 'إلغاء',
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      width: 'auto'
    }).then(async (result) => {
      if (result.isConfirmed) {
        document.getElementById('receiptPrint').innerHTML = receiptHTML;
        await new Promise(r => setTimeout(r, 120));
        await window.electron.print();
        await new Promise(r => setTimeout(r, 500));
      }
    });
  } catch (err) {
    alert('خطأ في الطباعة: ' + err.message);
  }
}

async function factoryReset() {
  const { value: text } = await Swal.fire({
    title: 'تحذير شديد!',
    text: 'هذا سيمسح النظام بالكامل. اكتب "مسح النظام بالكامل" للتأكيد:',
    input: 'text',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#3085d6',
    confirmButtonText: 'حذف كل شيء',
    cancelButtonText: 'إلغاء'
  });
  if (text !== 'مسح النظام بالكامل') {
    showToast('تم إلغاء العملية','info'); return;
  }
  
  const tables = ['invoice_items','invoices','return_items','returns','attendance','leaves','advances',
    'deductions','incentives','salary_payments','custody','shifts','expenses','revenues','treasury',
    'purchase_items','purchases','customers','suppliers','employees','services'];
    
  for(let t of tables) await window.db.run(`DELETE FROM ${t}`,[]);
  
  await window.db.run('UPDATE invoice_sequence SET last_number=0',[]);
  for (const trs of ['الخزينة', 'فودافون كاش', 'إنستا باي', 'فيزا']) {
    await window.db.run(`INSERT INTO treasury (type, description, amount, balance_after, treasury_type) VALUES ('إيراد', 'رصيد افتتاحي', 0, 0, ?)`, [trs]);
  }
  
  showToast('تم ضبط المصنع بنجاح','success');
  setTimeout(()=>goBack(), 2000);
}

// ─── Delivery Performance Report ──────────────────────────────────────────────
async function loadDeliveryReport() {
  const from = document.getElementById('delFrom')?.value || '2000-01-01';
  const to = document.getElementById('delTo')?.value || '2099-12-31';

  const tbodyDrivers = document.getElementById('deliveryDriversTableBody');
  const tbodyInvoices = document.getElementById('deliveryInvoicesTableBody');
  if (tbodyDrivers) tbodyDrivers.innerHTML = '<tr><td colspan="8" class="table-empty">جاري تحميل بيانات الدليفري...</td></tr>';
  if (tbodyInvoices) tbodyInvoices.innerHTML = '<tr><td colspan="8" class="table-empty">جاري تحميل فواتير الدليفري...</td></tr>';

  try {
    const res = await window.delivery.getReport({ from, to });
    const drivers = (res.success && res.data) ? res.data : [];

    let totalOrders = 0;
    let totalFees = 0;
    let totalEarnings = 0;
    let totalReturned = 0;

    if (!drivers.length) {
      if (tbodyDrivers) tbodyDrivers.innerHTML = '<tr><td colspan="8" class="table-empty">لا يوجد طيارين مسجلين أو لا توجد عمليات دليفري في هذه الفترة</td></tr>';
    } else {
      let h = '';
      drivers.forEach(d => {
        const dOrders = Number(d.delivered_orders || 0);
        const dFees = Number(d.total_delivery_fees || 0);
        const dEarn = Number(d.total_earnings || 0);
        const dRet = Number(d.returned_orders || 0);

        totalOrders += (dOrders + dRet);
        totalFees += dFees;
        totalEarnings += dEarn;
        totalReturned += dRet;

        const feeTypeBadge = d.delivery_fee_type === 'نسبة'
          ? `<span class="badge badge-primary">نسبة (${d.delivery_fee_value}%)</span>`
          : `<span class="badge badge-success">مبلغ ثابت (${d.delivery_fee_value} ج)</span>`;

        h += `
          <tr>
            <td style="font-weight:700;color:var(--primary);">${escapeHtml(d.name)}</td>
            <td>${escapeHtml(d.phone || '—')}</td>
            <td>${feeTypeBadge}</td>
            <td><strong>${fmt(d.delivery_fee_value)}</strong></td>
            <td style="font-weight:700;color:var(--success);">${dOrders}</td>
            <td style="color:var(--danger);">${dRet}</td>
            <td style="font-weight:700;">${fmt(dFees)} ج</td>
            <td style="font-weight:800;color:var(--accent); font-size:14px;">${fmt(dEarn)} ج</td>
          </tr>
        `;
      });
      if (tbodyDrivers) tbodyDrivers.innerHTML = h;
    }

    // Load detailed delivery invoices
    const invRes = await window.db.query(
      `SELECT i.id, i.invoice_number, i.invoice_date, i.delivery_status, i.delivery_fee, i.driver_earning, i.net_total,
              c.name as customer_name, e.name as driver_name
       FROM invoices i
       LEFT JOIN customers c ON i.customer_id = c.id
       LEFT JOIN employees e ON i.driver_id = e.id
       WHERE i.invoice_type = 'دليفري' AND i.invoice_date BETWEEN ? AND ?
       ORDER BY i.id DESC`,
      [from, to]
    );

    const invoices = (invRes.success && invRes.data) ? invRes.data : [];
    if (!invoices.length) {
      if (tbodyInvoices) tbodyInvoices.innerHTML = '<tr><td colspan="8" class="table-empty">لا توجد فواتير دليفري في هذه الفترة</td></tr>';
    } else {
      if (tbodyInvoices) {
        tbodyInvoices.innerHTML = invoices.map(inv => {
          const statusColor = inv.delivery_status === 'تم التسليم' ? 'badge-success'
            : inv.delivery_status === 'مرتجع' ? 'badge-danger'
            : 'badge-warning';
          return `
            <tr>
              <td style="font-weight:700;color:var(--primary);">${escapeHtml(inv.invoice_number)}</td>
              <td>${escapeHtml(inv.invoice_date || '—')}</td>
              <td>${escapeHtml(inv.customer_name || 'عميل نقدي')}</td>
              <td>${escapeHtml(inv.driver_name || '—')}</td>
              <td><span class="badge ${statusColor}">${escapeHtml(inv.delivery_status || 'قيد التجهيز')}</span></td>
              <td>${fmt(inv.delivery_fee)} ج</td>
              <td style="font-weight:700;color:var(--accent);">${fmt(inv.driver_earning)} ج</td>
              <td style="font-weight:800;">${fmt(inv.net_total)} ج</td>
            </tr>
          `;
        }).join('');
      }
    }

    if (document.getElementById('delOrdersCount')) document.getElementById('delOrdersCount').textContent = totalOrders || invoices.length;
    if (document.getElementById('delTotalFees')) document.getElementById('delTotalFees').textContent = fmt(totalFees) + ' ج';
    if (document.getElementById('delDriverEarnings')) document.getElementById('delDriverEarnings').textContent = fmt(totalEarnings) + ' ج';
    if (document.getElementById('delReturnedCount')) document.getElementById('delReturnedCount').textContent = totalReturned;

  } catch (err) {
    console.error('Error loading delivery report:', err);
    showToast('خطأ في تحميل تقرير الدليفري: ' + err.message, 'error');
  }
}

// ─── Raw Materials & Waste Report ─────────────────────────────────────────────
let allRawMaterialsCache = [];

async function loadRawInventoryReport() {
  const tbody = document.getElementById('rawInventoryTableBody');
  const wasteTbody = document.getElementById('rawWasteTableBody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="table-empty">جاري تحميل المواد الخام...</td></tr>';
  if (wasteTbody) wasteTbody.innerHTML = '<tr><td colspan="5" class="table-empty">جاري تحميل حركات الهالك...</td></tr>';

  try {
    const [rawRes, wasteRes] = await Promise.all([
      window.rawMaterials.list(),
      window.db.query(
        `SELECT m.id, m.created_at, m.movement_type, m.quantity_change, m.notes,
                r.name as raw_name, s.name as service_name
         FROM inventory_movements m
         LEFT JOIN raw_materials r ON m.raw_material_id = r.id
         LEFT JOIN services s ON m.service_id = s.id
         WHERE m.movement_type IN ('waste', 'manual_edit')
         ORDER BY m.id DESC LIMIT 60`
      )
    ]);

    allRawMaterialsCache = (rawRes.success && rawRes.data) ? rawRes.data : [];
    filterRawInventoryTable();

    // Waste movements
    const wasteList = (wasteRes.success && wasteRes.data) ? wasteRes.data : [];
    if (document.getElementById('rawWasteCount')) {
      document.getElementById('rawWasteCount').textContent = wasteList.length;
    }

    if (!wasteList.length) {
      if (wasteTbody) wasteTbody.innerHTML = '<tr><td colspan="5" class="table-empty">لا توجد حركات هالك أو تسوية يدوية مسجلة</td></tr>';
    } else {
      if (wasteTbody) {
        wasteTbody.innerHTML = wasteList.map(w => {
          const itemName = escapeHtml(w.raw_name || w.service_name || 'عنصر غير محدد');
          const typeBadge = w.movement_type === 'waste'
            ? `<span class="badge badge-danger">هالك (Waste)</span>`
            : `<span class="badge badge-warning">تعديل جرد يدوي</span>`;
          return `
            <tr>
              <td>${escapeHtml(w.created_at || '—')}</td>
              <td>${typeBadge}</td>
              <td style="font-weight:700;">${itemName}</td>
              <td style="font-weight:800;color:var(--danger);">${fmt(w.quantity_change)}</td>
              <td>${escapeHtml(w.notes || '—')}</td>
            </tr>
          `;
        }).join('');
      }
    }

  } catch (err) {
    console.error('Error loading raw inventory report:', err);
    showToast('خطأ في تحميل تقرير المواد الخام: ' + err.message, 'error');
  }
}

function filterRawInventoryTable() {
  const tbody = document.getElementById('rawInventoryTableBody');
  if (!tbody) return;

  const search = (document.getElementById('rawSearchInput')?.value || '').trim().toLowerCase();
  const filter = document.getElementById('rawStockFilter')?.value || '';

  let filtered = allRawMaterialsCache.filter(r => {
    if (search && !r.name.toLowerCase().includes(search)) return false;
    const isLow = Number(r.quantity || 0) <= Number(r.low_stock_threshold || 0);
    if (filter === 'low' && !isLow) return false;
    if (filter === 'ok' && isLow) return false;
    return true;
  });

  let totalCount = allRawMaterialsCache.length;
  let lowCount = 0;
  let totalValuation = 0;

  allRawMaterialsCache.forEach(r => {
    const qty = Number(r.quantity || 0);
    const cost = Number(r.cost_per_unit || 0);
    const threshold = Number(r.low_stock_threshold || 0);
    if (qty <= threshold) lowCount++;
    totalValuation += (qty * cost);
  });

  if (document.getElementById('rawTotalCount')) document.getElementById('rawTotalCount').textContent = totalCount;
  if (document.getElementById('rawLowStockCount')) document.getElementById('rawLowStockCount').textContent = lowCount;
  if (document.getElementById('rawTotalValuation')) document.getElementById('rawTotalValuation').textContent = fmt(totalValuation) + ' ج';

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="table-empty">لا توجد مواد خام مطابقة للبحث</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(r => {
    const qty = Number(r.quantity || 0);
    const cost = Number(r.cost_per_unit || 0);
    const threshold = Number(r.low_stock_threshold || 0);
    const val = qty * cost;
    const isLow = qty <= threshold;
    const statusBadge = isLow
      ? `<span class="badge badge-danger">منخفض / أوشك على النفاد</span>`
      : `<span class="badge badge-success">رصيد آمن</span>`;

    return `
      <tr class="${isLow ? 'bg-red-50' : ''}">
        <td style="font-weight:700;color:var(--primary);">${escapeHtml(r.name)}</td>
        <td><span class="badge badge-secondary">${escapeHtml(r.unit || 'قطعة')}</span></td>
        <td style="font-weight:800; font-size:14px; color:${isLow ? 'var(--danger)' : 'var(--success)'};">${fmt(qty)}</td>
        <td style="color:var(--text-muted);">${fmt(threshold)}</td>
        <td>${fmt(cost)} ج</td>
        <td style="font-weight:700;">${fmt(val)} ج</td>
        <td>${statusBadge}</td>
      </tr>
    `;
  }).join('');
}

// ─── Role Check & Quit ────────────────────────────────────────────────────────
async function applyRoleVisibility() {
  const role = sessionStorage.getItem('photoStudio_role');
  if (role === 'cashier') {
    const cleanupTab = document.getElementById('cleanupTab');
    if(cleanupTab) cleanupTab.style.display = 'none';
  }
}

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

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Init first tab
applyRoleVisibility();
loadSalesReport();