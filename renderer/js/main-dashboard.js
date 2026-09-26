// ─── Clock ────────────────────────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  document.getElementById('clockDisplay').textContent = now.toLocaleTimeString('ar-EG-u-nu-latn');
  document.getElementById('dateDisplay').textContent = now.toLocaleDateString('ar-EG-u-nu-latn', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
}
setInterval(updateClock, 1000);
updateClock();



// ─── Dashboard Stats & Recent Activity ──────────────────────────────────────────
async function loadStats() {
  if (document.hidden) return; // Skip DB queries when window/tab is hidden
  const today = getLocalISODate();

  try {
    const [salesRes, expRes, netCashRes, netVCRes, netIPRes, netVisaRes, advRes, balRes] = await Promise.all([
      window.db.queryOne(
        `SELECT COALESCE(SUM(net_total),0) as total, COUNT(*) as cnt FROM invoices WHERE invoice_date=? AND is_returned=0`,
        [today]
      ),
      window.db.queryOne(
        `SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE date=?`,
        [today]
      ),
      window.db.queryOne(
        `SELECT COALESCE(SUM(CASE WHEN type='إيراد' THEN amount ELSE -amount END),0) as net FROM treasury WHERE date=? AND treasury_type='الخزينة'`,
        [today]
      ),
      window.db.queryOne(
        `SELECT COALESCE(SUM(CASE WHEN type='إيراد' THEN amount ELSE -amount END),0) as net FROM treasury WHERE date=? AND treasury_type='فودافون كاش'`,
        [today]
      ),
      window.db.queryOne(
        `SELECT COALESCE(SUM(CASE WHEN type='إيراد' THEN amount ELSE -amount END),0) as net FROM treasury WHERE date=? AND treasury_type='إنستا باي'`,
        [today]
      ),
      window.db.queryOne(
        `SELECT COALESCE(SUM(CASE WHEN type='إيراد' THEN amount ELSE -amount END),0) as net FROM treasury WHERE date=? AND treasury_type='فيزا'`,
        [today]
      ),
      window.db.queryOne(
        `SELECT COALESCE(SUM(amount),0) as total FROM advances WHERE date=?`,
        [today]
      ),
      window.db.getTreasuryBalance('الخزينة')
    ]);

    const elSales = document.getElementById('todaySales');
    if (elSales && salesRes.success && salesRes.data) {
      elSales.textContent = Number(salesRes.data.total).toLocaleString('en-US');
    }

    const elExp = document.getElementById('todayExpenses');
    if (elExp && expRes.success && expRes.data) {
      elExp.textContent = Number(expRes.data.total).toLocaleString('en-US');
    }

    const elCash = document.getElementById('dailyNetCash');
    if (elCash && netCashRes.success && netCashRes.data) {
      elCash.textContent = Number(netCashRes.data.net).toLocaleString('en-US');
    }

    const elVC = document.getElementById('dailyNetVodafone');
    if (elVC && netVCRes.success && netVCRes.data) {
      elVC.textContent = Number(netVCRes.data.net).toLocaleString('en-US');
    }

    const elIP = document.getElementById('dailyNetInstapay');
    if (elIP && netIPRes.success && netIPRes.data) {
      elIP.textContent = Number(netIPRes.data.net).toLocaleString('en-US');
    }

    const elVisa = document.getElementById('dailyNetVisa');
    if (elVisa && netVisaRes.success && netVisaRes.data) {
      elVisa.textContent = Number(netVisaRes.data.net).toLocaleString('en-US');
    }

    const elAdv = document.getElementById('todayAdvances');
    if (elAdv && advRes.success && advRes.data) {
      elAdv.textContent = Number(advRes.data.total).toLocaleString('en-US');
    }

    const elBal = document.getElementById('treasuryBalance');
    if (elBal && balRes.success) {
      elBal.textContent = Number(balRes.data).toLocaleString('en-US');
    }
  } catch (err) {
    console.error('Error loading dashboard stats:', err);
  }
}

async function loadTodayInvoices() {
  const today = getLocalISODate();
  try {
    const res = await window.db.query(
      `SELECT id, invoice_number, customer_name, net_total, paid_amount, amount_paid, is_returned, created_at
       FROM invoices
       WHERE invoice_date = ?
       ORDER BY id DESC
       LIMIT 15`,
      [today]
    );
    const tbody = document.getElementById('todayInvoicesBody');
    if (!tbody) return;

    if (!res.success || !res.data || res.data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:28px; color:#94A3B8; font-size:13px;">لا توجد فواتير اليوم بعد</td></tr>`;
      return;
    }

    tbody.innerHTML = res.data.map(inv => {
      const paid = Number(inv.paid_amount || inv.amount_paid || 0);
      const total = Number(inv.net_total || 0);
      const isReturned = inv.is_returned == 1;
      const isPartial = !isReturned && paid < total && total > 0;
      const statusBadge = isReturned
        ? `<span style="background:#FEE2E2; color:#DC2626; padding:2px 8px; border-radius:4px; font-size:10px; font-weight:700;">مُرتجع</span>`
        : isPartial
          ? `<span style="background:#FEF3C7; color:#D97706; padding:2px 8px; border-radius:4px; font-size:10px; font-weight:700;">جزئي</span>`
          : `<span style="background:#DCFCE7; color:#16A34A; padding:2px 8px; border-radius:4px; font-size:10px; font-weight:700;">مكتمل</span>`;

      // Extract time from created_at
      let timeStr = '';
      if (inv.created_at) {
        try {
          const d = new Date(inv.created_at);
          timeStr = d.toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' });
        } catch(e) { timeStr = '—'; }
      }

      return `<tr>
        <td style="font-weight:800; color:#0F172A;">${inv.invoice_number || '—'}</td>
        <td style="color:#475569;">${inv.customer_name || 'عميل نقدي'}</td>
        <td style="color:#64748B; font-variant-numeric:tabular-nums;">${timeStr || '—'}</td>
        <td style="font-weight:700; color:#0F172A; text-align:left;">${Number(total).toLocaleString('en-US')} <span style="font-size:11px; color:#94A3B8;">ج.م</span></td>
        <td style="text-align:center;">${statusBadge}</td>
      </tr>`;
    }).join('');
  } catch(err) {
    console.error('Error loading today invoices feed:', err);
  }
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────


// ─── WhatsApp ─────────────────────────────────────────────────────────────────
async function openWhatsApp() {
  const result = await Swal.fire({
    title: 'الدعم الفني',
    text: 'اختر رقم الدعم الفني للتواصل معنا عبر واتساب (Dev Blue Tech):',
    icon: 'info',
    showCancelButton: true,
    showDenyButton: true,
    confirmButtonText: 'تواصل مع 01129021377',
    denyButtonText: 'تواصل مع 01204165586',
    cancelButtonText: 'إلغاء',
    confirmButtonColor: '#25d366',
    denyButtonColor: '#128c7e'
  });

  if (result.isConfirmed) {
    window.electron.openExternal('https://wa.me/201129021377');
  } else if (result.isDenied) {
    window.electron.openExternal('https://wa.me/201204165586');
  }
}

// ─── Current User & Role-Based Visibility ─────────────────────────────────────
let currentUser = { id: null, name: '', role: 'admin' };

async function loadSystemLogo() {
  const res = await window.db.getSettings();
  if (res.success && res.data) {
    if (res.data.logo_path) {
      const iconDiv = document.getElementById('navbarLogoIcon');
      const safeLogo = 'file:///' + res.data.logo_path.replace(/\\/g, '/');
      iconDiv.innerHTML = `<img src="${safeLogo}" style="width:100%; height:100%; object-fit:contain; border-radius:12px;">`;
      iconDiv.style.background = 'transparent';
      iconDiv.style.boxShadow = 'none';
    }
    if (res.data.company_name) {
      document.getElementById('navbarLogoText').textContent = res.data.company_name;
    }
  }
}

async function loadCurrentUser() {
  // Try from auth session first
  const sessionRes = await window.auth.getSession();
  if (sessionRes.success && sessionRes.data) {
    const s = sessionRes.data;
    currentUser = { id: s.employeeId, name: s.employeeName, role: s.role };
    document.getElementById('currentUserName').textContent = s.employeeName;
    document.getElementById('userAvatarLetter').textContent = (s.employeeName || 'م').charAt(0);
    document.getElementById('userRoleBadge').textContent = s.role === 'admin' ? 'أدمن' : 'كاشير';

    // Store in sessionStorage for other pages
    sessionStorage.setItem('photoStudio_userId', s.userId);
    sessionStorage.setItem('photoStudio_employeeId', s.employeeId);
    sessionStorage.setItem('photoStudio_employeeName', s.employeeName);
    sessionStorage.setItem('photoStudio_role', s.role);
    sessionStorage.setItem('photoStudio_shiftId', s.shiftId || '');

    // Apply role-based visibility
    applyRoleVisibility(s.role);

    // Show shift indicator if there's an active shift
    if (s.shiftId) {
      document.getElementById('shiftIndicator').style.display = 'flex';
    }
  } else {
    // Not logged in — fallback (check sessionStorage)
    const role = sessionStorage.getItem('photoStudio_role');
    if (!role) {
      // Redirect to login
      window.electron.navigate('login.html');
      return;
    }
    currentUser = {
      id: parseInt(sessionStorage.getItem('photoStudio_employeeId')) || 1,
      name: sessionStorage.getItem('photoStudio_employeeName') || 'مستخدم',
      role: role
    };
    document.getElementById('currentUserName').textContent = currentUser.name;
    document.getElementById('userAvatarLetter').textContent = currentUser.name.charAt(0);
    document.getElementById('userRoleBadge').textContent = role === 'admin' ? 'أدمن' : 'كاشير';
    applyRoleVisibility(role);

    if (sessionStorage.getItem('photoStudio_shiftId')) {
      document.getElementById('shiftIndicator').style.display = 'flex';
    }
  }
}

async function applyRoleVisibility(role) {
  if (role === 'cashier') {
    // Hide standard admin-only sections first
    document.querySelectorAll('.admin-only').forEach(el => {
      el.style.display = 'none';
    });

    // Fetch granular settings
    const res = await window.db.getSettings();
    if (res.success && res.data) {
      const s = res.data;
      if (Number(s.cashier_lock_to_pos) === 1) {
        window.electron.navigate('pos-invoice.html');
        return;
      }
      
      // Sidebar items
      const sidebarItems = document.querySelectorAll('.sidebar-nav-item');
      sidebarItems.forEach(item => {
        const text = item.textContent.trim();
        if (s.cashier_hide_reports && (text.includes('التقارير') || text.includes('سجل الفواتير'))) item.style.display = 'none';
        if (s.cashier_hide_hr && text.includes('شئون الموظفين')) item.style.display = 'none';
        if (s.cashier_prevent_returns && text.includes('المرتجعات')) item.style.display = 'none';
        if (s.cashier_hide_finance && text.includes('الحسابات')) item.style.display = 'none';
        if (s.cashier_prevent_settings && text.includes('الإعدادات')) item.style.display = 'none';
      });

      // Quick action buttons and tiles
      document.querySelectorAll('.action-btn, .action-tile').forEach(btn => {
        const label = btn.querySelector('.action-btn-label, .action-tile-label');
        if (!label) return;
        const text = label.textContent.trim();
        
        if (s.cashier_prevent_returns && text.includes('مرتجع')) {
          btn.style.display = 'none';
        }
        if (s.cashier_hide_finance && (text.includes('المصروفات') || text.includes('الحسابات') || text.includes('سلفة'))) {
          btn.style.display = 'none';
        }
        if (s.cashier_hide_reports && (text.includes('التقرير اليومي') || text.includes('سجل الفواتير'))) {
          btn.style.display = 'none';
        }
      });

      // Financial KPI visibility for cashier
      if (s.cashier_hide_finance) {
        document.querySelectorAll('.kpi-sales, .kpi-expenses').forEach(el => {
          el.style.display = 'none';
        });
      }
    } else {
      // Fallback if DB fetch fails
      document.querySelectorAll('.action-btn, .action-tile').forEach(btn => {
        const label = btn.querySelector('.action-btn-label, .action-tile-label');
        if (!label) return;
        const text = label.textContent.trim();
        const cashierAllowed = ['حضور', 'طلب / فاتورة جديدة', 'انصراف', 'إغلاق الوردية', 'عميل جديد'];
        if (!cashierAllowed.some(a => text.includes(a))) {
          btn.style.display = 'none';
        }
      });
    }
  }
}


// ─── Logout ───────────────────────────────────────────────────────────────────
async function handleLogout() {
  const result = await Swal.fire({
    title: 'تسجيل الخروج',
    text: 'هل تريد بالتأكيد تسجيل الخروج من النظام؟',
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#E05252',
    cancelButtonColor: '#94A3B8',
    confirmButtonText: 'نعم، خروج',
    cancelButtonText: 'إلغاء'
  });
  if (!result.isConfirmed) return;
  await window.auth.logout();
  sessionStorage.clear();
  window.electron.navigate('login.html');
}

// ─── Attendance Modal Logic ───────────────────────────────────────────────────
async function handleAttendance(type) { // type = 'in' or 'out'
  document.getElementById('attendanceModal').classList.add('open');
  
  // Set default date and time
  const now = new Date();
  document.getElementById('attDate').value = now.toISOString().split('T')[0];
  document.getElementById('attTimeIn').value = now.toTimeString().substring(0, 5);
  document.getElementById('attTimeOut').value = now.toTimeString().substring(0, 5);

  // Toggle fields based on type
  if (type === 'in') {
    document.getElementById('attModalTitle').innerHTML = 'تسجيل حضور';
    document.getElementById('attTimeInGroup').style.display = 'block';
    document.getElementById('attTimeOutGroup').style.display = 'none';
    document.getElementById('btnSubmitAttIn').style.display = 'block';
    document.getElementById('btnSubmitAttOut').style.display = 'none';
    document.getElementById('btnSubmitAttOutAll').style.display = 'none';
  } else {
    document.getElementById('attModalTitle').innerHTML = 'تسجيل انصراف';
    document.getElementById('attTimeInGroup').style.display = 'none';
    document.getElementById('attTimeOutGroup').style.display = 'block';
    document.getElementById('btnSubmitAttIn').style.display = 'none';
    document.getElementById('btnSubmitAttOut').style.display = 'block';
    document.getElementById('btnSubmitAttOutAll').style.display = 'block';
  }

  // Load active employees
  const sel = document.getElementById('attEmpSelect');
  sel.innerHTML = '<option value="">-- اختر الموظف --</option>';
  const res = await window.db.query('SELECT id, name FROM employees WHERE is_active=1 ORDER BY name', []);
  if (res.success) {
    res.data.forEach(e => {
      sel.innerHTML += `<option value="${e.id}">${e.name}</option>`;
    });
  }
}

async function saveDashboardAttendance() {
  const empId = document.getElementById('attEmpSelect').value;
  const date = document.getElementById('attDate').value;
  const timeIn = document.getElementById('attTimeIn').value;
  
  if (!empId || !date || !timeIn) {
    showToast('يجب اختيار الموظف وإدخال التاريخ ووقت الحضور', 'warning');
    return;
  }
  
  const dateTime = `${date}T${timeIn}:00`;
  const currentShift = await window.shift.getCurrent();
  const shiftId = currentShift?.id || null;

  await window.db.run(
    `INSERT INTO attendance (employee_id, date, check_in, shift_id) VALUES (?,?,?,?)`,
    [empId, date, dateTime, shiftId]
  );
  showToast('تم تسجيل الحضور بنجاح', 'success');
  closeModal('attendanceModal');
}

async function saveDashboardCheckout() {
  const empId = document.getElementById('attEmpSelect').value;
  const date = document.getElementById('attDate').value;
  const timeOut = document.getElementById('attTimeOut').value;
  
  if (!empId || !date || !timeOut) {
    showToast('يجب اختيار الموظف وإدخال التاريخ ووقت الانصراف', 'warning');
    return;
  }
  
  // Check if check in exists
  const attRes = await window.db.queryOne(
    `SELECT * FROM attendance WHERE employee_id=? AND date=? AND check_out IS NULL ORDER BY id DESC LIMIT 1`,
    [empId, date]
  );
  if (!attRes.success || !attRes.data) {
    showToast('لا يوجد حضور مسجل لليوم، لا يمكن تسجيل انصراف', 'warning');
    return;
  }

  const dateTime = `${date}T${timeOut}:00`;
  const outDate = new Date(dateTime);
  const checkInTime = new Date(attRes.data.check_in);
  
  const empRes = await window.db.queryOne('SELECT work_hours_per_day FROM employees WHERE id=?', [empId]);
  const workHours = empRes.data?.work_hours_per_day || 8;
  const requiredMinutes = Math.floor(workHours * 60);

  const workedMinutes = Math.floor((outDate - checkInTime) / 60000);
  
  let lateMinutes = 0;
  let extraMinutes = 0;
  
  if (workedMinutes < requiredMinutes) {
    lateMinutes = requiredMinutes - workedMinutes;
  } else if (workedMinutes > requiredMinutes) {
    extraMinutes = workedMinutes - requiredMinutes;
  }

  await window.db.run(
    `UPDATE attendance SET check_out=?, late_minutes=?, extra_minutes=? WHERE id=?`, 
    [dateTime, lateMinutes, extraMinutes, attRes.data.id]
  );
  showToast('تم تسجيل الانصراف بنجاح', 'success');
  closeModal('attendanceModal');
}

async function saveDashboardCheckoutAll() {
  const chkRes = await Swal.fire({
    title: 'انصراف جماعي',
    text: 'هل تريد تسجيل انصراف لكل من سجل حضور اليوم ولم ينصرف بعد؟ (سيتم احتساب وقت الانصراف ليتطابق مع ساعات عملهم الرسمية بدون تأخير أو زيادة)',
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#1B2A4A',
    cancelButtonColor: '#94A3B8',
    confirmButtonText: 'نعم، سجّل الانصراف',
    cancelButtonText: 'إلغاء'
  });
  if (!chkRes.isConfirmed) return;

  const date = document.getElementById('attDate').value;
  if (!date) {
    showToast('يجب تحديد التاريخ أولاً', 'error');
    return;
  }

  // Get all active attendances without checkout for this date
  const attListRes = await window.db.query(
    `SELECT a.*, e.work_hours_per_day FROM attendance a JOIN employees e ON a.employee_id = e.id WHERE a.date=? AND a.check_out IS NULL`,
    [date]
  );

  if (!attListRes.success || !attListRes.data || attListRes.data.length === 0) {
    showToast('لا يوجد موظفين حاضرين بدون انصراف لهذا اليوم', 'info');
    return;
  }

  let count = 0;
  for (const att of attListRes.data) {
    const checkInTime = new Date(att.check_in);
    const workHours = att.work_hours_per_day || 8;
    
    // Add workHours to check_in time to get ideal check_out time
    const idealCheckOut = new Date(checkInTime.getTime() + workHours * 60 * 60 * 1000);
    
    // Format to local ISO string keeping local timezone (since the DB expects local time)
    // We can just construct it manually or use simple string slicing if we offset by timezone
    const offsetMs = idealCheckOut.getTimezoneOffset() * 60000;
    const localIso = new Date(idealCheckOut.getTime() - offsetMs).toISOString().slice(0,19);

    await window.db.run(
      `UPDATE attendance SET check_out=?, late_minutes=0, extra_minutes=0 WHERE id=?`,
      [localIso, att.id]
    );
    count++;
  }

  showToast(`تم تسجيل الانصراف لعدد ${count} موظفين بنجاح`, 'success');
  closeModal('attendanceModal');
}

// ─── Auto-Checkout Missing Previous Days ──────────────────────────────────────
async function autoCheckoutMissing() {
  const today = getLocalISODate();
  // Select attendance older than today without checkout
  const res = await window.db.query(
    `SELECT a.*, e.work_hours_per_day FROM attendance a JOIN employees e ON a.employee_id = e.id WHERE a.date < ? AND a.check_out IS NULL`,
    [today]
  );
  if (res.success && res.data && res.data.length > 0) {
    for (const att of res.data) {
      const checkInTime = new Date(att.check_in);
      const workHours = att.work_hours_per_day || 8;
      const idealCheckOut = new Date(checkInTime.getTime() + workHours * 60 * 60 * 1000);
      const offsetMs = idealCheckOut.getTimezoneOffset() * 60000;
      const localIso = new Date(idealCheckOut.getTime() - offsetMs).toISOString().slice(0,19);
      await window.db.run(
        `UPDATE attendance SET check_out=?, late_minutes=0, extra_minutes=0 WHERE id=?`,
        [localIso, att.id]
      );
    }
    console.log(`[Auto-Checkout] Fixed ${res.data.length} missing checkouts from previous days.`);
  }
}
// Run auto checkout silently when dashboard loads
setTimeout(autoCheckoutMissing, 2000);



// ─── End Shift — Navigate to end-shift screen (cashier only) ────────────────────
function endShift() {
  const role = sessionStorage.getItem('photoStudio_role');
  if (role === 'admin') {
    showToast('إنهاء الشيفت مخصص للكاشير فقط وليس لمدير النظام', 'warning');
    return;
  }
  navigate('end-shift.html');
}

// ─── New Customer ─────────────────────────────────────────────────────────────
function showNewCustomerModal() { openModal('newCustomerModal'); }
async function saveNewCustomer() {
  const name = document.getElementById('newCustName').value.trim();
  if (!name) { showToast('الرجاء إدخال اسم العميل', 'error'); return; }
  const phone = document.getElementById('newCustPhone').value.trim();
  const address = document.getElementById('newCustAddress').value.trim();
  const balance = parseFloat(document.getElementById('newCustBalance').value) || 0;

  // التحقق من عدم تكرار رقم التليفون
  if (phone) {
    const checkPhone = await window.db.queryOne(
      `SELECT id, name FROM customers WHERE phone=? LIMIT 1`, [phone]
    );
    if (checkPhone.success && checkPhone.data) {
      showToast(`رقم التليفون "${phone}" مسجل مسبقاً للعميل: ${checkPhone.data.name}`, 'error');
      return;
    }
  }

  const res = await window.db.run(
    `INSERT INTO customers (name, phone, address, opening_balance, current_balance) VALUES (?,?,?,?,?)`,
    [name, phone, address, balance, balance]
  );
  if (res.success) {
    showToast(`تم إضافة العميل "${name}" بنجاح `, 'success');
    closeModal('newCustomerModal');
    document.getElementById('newCustName').value = '';
    document.getElementById('newCustPhone').value = '';
    document.getElementById('newCustAddress').value = '';
    document.getElementById('newCustBalance').value = '0';
  } else {
    showToast('حدث خطأ: ' + res.error, 'error');
  }
}

// ─── New Supplier ─────────────────────────────────────────────────────────────
function showNewSupplierModal() { openModal('newSupplierModal'); }
async function saveNewSupplier() {
  const name = document.getElementById('newSuppName').value.trim();
  if (!name) { showToast('الرجاء إدخال اسم المورد', 'error'); return; }
  const phone = document.getElementById('newSuppPhone').value.trim();
  const address = document.getElementById('newSuppAddress').value.trim();
  const balance = parseFloat(document.getElementById('newSuppBalance').value) || 0;
  const res = await window.db.run(
    `INSERT INTO suppliers (name, phone, address, opening_balance, current_balance) VALUES (?,?,?,?,?)`,
    [name, phone, address, balance, balance]
  );
  if (res.success) {
    showToast(`تم إضافة المورد "${name}" بنجاح `, 'success');
    closeModal('newSupplierModal');
    document.getElementById('newSuppName').value = '';
    document.getElementById('newSuppPhone').value = '';
    document.getElementById('newSuppAddress').value = '';
    document.getElementById('newSuppBalance').value = '0';
  } else {
    showToast('حدث خطأ: ' + res.error, 'error');
  }
}

// ─── Advance ──────────────────────────────────────────────────────────────────
async function showAdvanceModal() {
  openModal('advanceModal');
  const res = await window.db.query(`SELECT id, name FROM employees WHERE is_active=1`, []);
  const sel = document.getElementById('advEmpId');
  sel.innerHTML = '<option value="">اختر الموظف</option>';
  if (res.success) {
    res.data.forEach(e => { sel.innerHTML += `<option value="${e.id}">${e.name}</option>`; });
  }
}

async function saveAdvance() {
  const empId = document.getElementById('advEmpId').value;
  const amount = parseFloat(document.getElementById('advAmount').value);
  const notes = document.getElementById('advNotes').value.trim();
  const treasury = document.getElementById('advTreasury').value || 'الخزينة';
  if (!empId || !amount || amount <= 0) { showToast('يرجى اختيار الموظف وإدخال المبلغ', 'error'); return; }
  const res = await window.db.run(
    `INSERT INTO advances (employee_id, amount, notes) VALUES (?,?,?)`, [empId, amount, notes]
  );
  if (res.success) {
    await window.db.addTreasuryEntry('مصروف', `سلفة موظف`, amount, treasury);
    showToast('تم تسجيل السلفة بنجاح ', 'success');
    closeModal('advanceModal');
    document.getElementById('advAmount').value = '';
    document.getElementById('advNotes').value = '';
    loadStats();
  } else {
    showToast('حدث خطأ: ' + res.error, 'error');
  }
}


// ─── Keyboard Shortcuts ───────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'F1') { e.preventDefault(); navigate('pos-invoice.html'); }
  if (e.key === 'F2') { e.preventDefault(); navigate('daily-report.html'); }
  if (e.key === 'F3') { e.preventDefault(); navigate('finance.html'); }
  if (e.key === 'F4') { e.preventDefault(); showAdvanceModal(); }
});

// ─── Trial Check ─────────────────────────────────────────────────────────────
async function checkTrialStatus() {
  try {
    const status = await window.activation.getStatus();
    const banner = document.getElementById('trialBanner');
    const bannerText = document.getElementById('trialBannerText');

    if (!status.activated && !status.trialExpired) {
      // فترة تجربة نشطة — اعرض التحذير
      banner.style.display = 'flex';
      const days = status.daysLeft;
      bannerText.textContent = days === 1
        ? 'باقي يوم واحد فقط على انتهاء فترة التجربة المجانية!'
        : `باقي ${days} ${days <= 10 ? 'أيام' : 'يوم'} على انتهاء فترة التجربة المجانية`;
      if (days <= 2) {
        banner.style.background = 'linear-gradient(135deg,#7f1d1d,#991b1b)';
        bannerText.style.color = '#FCA5A5';
      }
    } else if (status.trialExpired && !status.activated) {
      // انتهت التجربة أو التفعيل المؤقت — إغلاق كامل للنظام
      banner.style.display = 'flex';
      bannerText.textContent = 'انتهت فترة الصلاحية. الرجاء تفعيل النظام للاستمرار.';
      banner.style.background = 'linear-gradient(135deg,#4a1d1d,#5c1a1a)';
      bannerText.style.color = '#FCA5A5';
      showFullLockOverlay();
    } else if (status.activated && status.isTimed) {
      // تفعيل مؤقت نشط — اعرض الأيام المتبقية كمعلومة
      banner.style.display = 'flex';
      const days = status.daysLeft;
      bannerText.textContent = days === 1
        ? 'باقي يوم واحد فقط على انتهاء اشتراكك!'
        : `اشتراكك الحالي ساري ومتبقي ${days} ${days <= 10 ? 'أيام' : 'يوم'} على انتهائه.`;
      
      // تغيير لون البانر ليكون مختلف (مثلاً أزرق/ذهبي)
      if (days <= 5) {
        banner.style.background = 'linear-gradient(135deg,#7f1d1d,#991b1b)'; // تحذير إذا اقترب الانتهاء
        bannerText.style.color = '#FCA5A5';
      } else {
        banner.style.background = 'linear-gradient(135deg,#1B2A4A,#2d4373)';
        banner.style.borderColor = '#C9A84C';
        bannerText.style.color = '#F8FAFC';
      }
    }
  } catch (e) { /* ignore if activation API not available */ }
}

function showFullLockOverlay() {
  let overlay = document.getElementById('lockOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'lockOverlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.backgroundColor = 'rgba(15, 23, 42, 0.95)';
    overlay.style.zIndex = '99999';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';
    overlay.style.backdropFilter = 'blur(10px)';
    
    overlay.innerHTML = `
      <div style="background:var(--card); padding:40px; border-radius:16px; border:1px solid var(--danger); text-align:center; max-width:500px; box-shadow:0 10px 40px rgba(0,0,0,0.5);">
        <div style="margin-bottom:16px;">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        </div>
        <h2 style="color:var(--danger); font-size:24px; font-weight:900; margin-bottom:12px;">انتهت فترة التجربة</h2>
        <p style="color:var(--text-secondary); font-size:15px; line-height:1.6; margin-bottom:24px;">
          لقد انتهت فترة التجربة المجانية للنظام. لم يعد بإمكانك استخدام البرنامج إلا بعد شراء النسخة الكاملة وتفعيلها.
        </p>
        <button class="btn btn-primary" style="width:100%; padding:12px; font-size:16px;" onclick="window.electron.navigate('activation.html')">
          الانتقال لصفحة التفعيل
        </button>
      </div>
    `;
    document.body.appendChild(overlay);
  }
}

// ─── WhatsApp Unread Badge ──────────────────────────────────────────────────
async function updateWhatsAppUnreadBadge() {
  try {
    if (!window.db || !window.db.getWhatsAppUnreadTotal) return;
    const res = await window.db.getWhatsAppUnreadTotal();
    const sideBadge = document.getElementById('sidebarWaBadge');
    const headBadge = document.getElementById('headerWaBadge');

    if (res.success && res.total > 0) {
      if (sideBadge) { sideBadge.textContent = res.total; sideBadge.style.display = 'inline-block'; }
      if (headBadge) { headBadge.textContent = res.total; headBadge.style.display = 'inline-block'; }
    } else {
      if (sideBadge) sideBadge.style.display = 'none';
      if (headBadge) headBadge.style.display = 'none';
    }
  } catch (e) {}
}

if (window.whatsapp && typeof window.whatsapp.onNewMessage === 'function') {
  window.whatsapp.onNewMessage((msg) => {
    // تشغيل صوت الرنين العالي والواضح
    if (typeof playWhatsAppChime === 'function') {
      playWhatsAppChime();
    }
    updateWhatsAppUnreadBadge();

    // إشعار فوري لطيف في أعلى الشاشة يوضح اسم العميل وبداية الرسالة
    if (typeof showToast === 'function') {
      const sender = msg?.sender_name || msg?.phone || 'عميل';
      const text = msg?.message_body ? (msg.message_body.length > 40 ? msg.message_body.substring(0, 40) + '...' : msg.message_body) : 'رسالة جديدة';
      showToast(`رسالة واتساب من [${sender}]: ${text}`, 'info');
    }
  });
}

// ─── Quit Confirmation ────────────────────────────────────────────────────────
window.electron.onConfirmBackupBeforeQuit(() => {
  document.getElementById('quitModal').classList.add('open');
});

// ─── Init ─────────────────────────────────────────────────────────────────────
loadCurrentUser();
loadSystemLogo();
loadStats();
updateWhatsAppUnreadBadge();
updateLowStockBadge();
checkTrialStatus();

// Optimized polling intervals (only run when document is visible)
setInterval(() => {
  if (!document.hidden) {
    loadStats();
  }
}, 8000); // 8s polling is responsive yet gentle on SQLite IPC

setInterval(() => {
  if (!document.hidden) updateWhatsAppUnreadBadge();
}, 15000);

setInterval(() => {
  if (!document.hidden) updateLowStockBadge();
}, 60000);

// Immediate refresh on window focus (e.g. returning from pos-invoice or another tab)
window.addEventListener('focus', () => {
  loadStats();
  updateWhatsAppUnreadBadge();
  updateLowStockBadge();
});

// ─── Low Stock Badge ──────────────────────────────────────────────────────────
async function updateLowStockBadge() {
  try {
    if (!window.inventory) return;
    const res = await window.inventory.getLowStock();
    const count = (res.success && res.data) ? res.data.length : 0;
    const sideBadge = document.getElementById('sidebarInventoryBadge');
    const btnBadge  = document.getElementById('lowStockBadge');
    const dashCount = document.getElementById('dashLowStockCount');
    if (count > 0) {
      if (sideBadge) { sideBadge.textContent = count; sideBadge.style.display = 'inline-block'; }
      if (btnBadge)  { btnBadge.textContent = count;  btnBadge.style.display = 'flex'; }
      if (dashCount) dashCount.innerHTML = `${count} <small style="font-size:11px; font-weight:600; color:#DC2626;">صنف</small>`;
    } else {
      if (sideBadge) sideBadge.style.display = 'none';
      if (btnBadge)  btnBadge.style.display  = 'none';
      if (dashCount) dashCount.innerHTML = `0 <small>صنف</small>`;
    }
  } catch (e) {}
}

// ─── Barcode Print Modal ──────────────────────────────────────────────────────
let _allBarcodeItems = [];
let _selectedBarcodeIds = new Set();

async function openPrintBarcodeModal() {
  _selectedBarcodeIds.clear();
  document.getElementById('barcodeSearchInput').value = '';
  document.getElementById('barcodeCopiesInput').value = '1';
  openModal('printBarcodeModal');
  const res = await window.inventory.list({ trackedOnly: false });
  _allBarcodeItems = (res.success && res.data) ? res.data.filter(i => i.barcode) : [];
  searchBarcodeItems();
}

function searchBarcodeItems() {
  const q = (document.getElementById('barcodeSearchInput').value || '').toLowerCase();
  const filtered = _allBarcodeItems.filter(i =>
    i.name.toLowerCase().includes(q) || (i.barcode||'').toLowerCase().includes(q)
  );
  const list = document.getElementById('barcodeItemsList');
  if (!filtered.length) {
    list.innerHTML = '<div style="padding:16px; text-align:center; color:var(--text-muted); font-size:13px;">لا توجد أصناف مطابقة</div>';
    updateBarcodeSelectedCount();
    return;
  }
  list.innerHTML = filtered.map(i => {
    const qty = i.quantity != null ? Number(i.quantity) : 0;
    const isAvailable = qty > 0;
    const isChecked = _selectedBarcodeIds.has(i.id);
    return `
    <label style="display:flex; align-items:center; gap:12px; padding:10px 14px; border-bottom:1px solid var(--border); cursor:pointer; transition:background 0.15s; background:${isChecked ? 'rgba(37,99,235,0.04)' : ''};"
           onmouseover="this.style.background='var(--hover)'" onmouseout="this.style.background='${isChecked ? 'rgba(37,99,235,0.04)' : ''}'">
      <input type="checkbox" ${isChecked ? 'checked' : ''}
             onchange="toggleBarcodeItem(${i.id}, this.checked)" style="width:17px;height:17px;cursor:pointer;accent-color:var(--primary);" />
      <div style="flex:1; min-width:0;">
        <div style="font-weight:700; font-size:13px; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${i.name}</div>
        <div style="font-size:11px; color:var(--text-muted); display:flex; gap:8px; align-items:center; margin-top:2px;">
          <span>${i.barcode}</span>
          ${i.category_name ? `<span style="color:var(--border);">•</span><span>${i.category_name}</span>` : ''}
        </div>
      </div>
      <div style="text-align:left; display:flex; flex-direction:column; align-items:flex-end; gap:3px; flex-shrink:0;">
        <span style="font-size:11px; font-weight:700; padding:2px 8px; border-radius:10px; ${isAvailable ? 'background:#e6f4ea; color:#137333;' : 'background:#fce8e6; color:#c5221f;'}">
          المتوفر: ${qty}
        </span>
        <span style="font-size:12px; color:var(--success); font-weight:700;">${Number(i.sell_price||0).toFixed(2)} ج.م</span>
      </div>
    </label>
    `;
  }).join('');
  updateBarcodeSelectedCount();
}

function toggleBarcodeItem(id, checked) {
  if (checked) _selectedBarcodeIds.add(id);
  else _selectedBarcodeIds.delete(id);
  updateBarcodeSelectedCount();
}

function selectAllBarcodeItems(check) {
  const q = (document.getElementById('barcodeSearchInput').value || '').toLowerCase();
  const currentList = _allBarcodeItems.filter(i =>
    !q || i.name.toLowerCase().includes(q) || (i.barcode||'').toLowerCase().includes(q)
  );
  currentList.forEach(i => {
    if (check) _selectedBarcodeIds.add(i.id);
    else _selectedBarcodeIds.delete(i.id);
  });
  searchBarcodeItems();
}

function selectAvailableBarcodeItems() {
  const q = (document.getElementById('barcodeSearchInput').value || '').toLowerCase();
  const currentList = _allBarcodeItems.filter(i =>
    !q || i.name.toLowerCase().includes(q) || (i.barcode||'').toLowerCase().includes(q)
  );
  _selectedBarcodeIds.clear();
  currentList.forEach(i => {
    if ((Number(i.quantity) || 0) > 0) {
      _selectedBarcodeIds.add(i.id);
    }
  });
  searchBarcodeItems();
}

function updateBarcodeSelectedCount() {
  const el = document.getElementById('barcodeSelectedCount');
  if (!el) return;
  const n = _selectedBarcodeIds.size;
  if (n === 0) {
    el.innerHTML = '<span style="color:var(--text-muted); font-weight:normal;">لا توجد أصناف محددة</span>';
    return;
  }
  let totalStock = 0;
  _allBarcodeItems.forEach(i => {
    if (_selectedBarcodeIds.has(i.id)) {
      totalStock += Math.max(0, parseInt(i.quantity) || 0);
    }
  });
  el.innerHTML = `تم تحديد <strong style="color:var(--primary);">${n}</strong> صنف &nbsp;|&nbsp; إجمالي الرصيد بالمخزن: <strong style="color:var(--success); font-size:13px;">${totalStock}</strong> قطعة`;
}

// طباعة بعدد نسخ ثابت لكل صنف محدد
async function doPrintBarcodeLabels() {
  if (_selectedBarcodeIds.size === 0) { showToast('يرجى تحديد صنف واحد على الأقل', 'warning'); return; }
  const copies = parseInt(document.getElementById('barcodeCopiesInput').value) || 1;
  const items = _allBarcodeItems.filter(i => _selectedBarcodeIds.has(i.id)).map(i => ({
    id: i.id, name: i.name, barcode: i.barcode, sell_price: i.sell_price, copies
  }));
  showToast(`جارٍ طباعة ${items.length * copies} ملصق...`, 'info');
  const res = await window.inventory.printBarcodeLabels(items, copies);
  if (res.success) showToast('تمت الطباعة بنجاح', 'success');
  else showToast('خطأ في الطباعة: ' + (res.error || ''), 'error');
}

// طباعة بعدد الكمية المتاحة في المخزن لكل صنف محدد بضغطة واحدة
async function doPrintBarcodeByStock() {
  if (_selectedBarcodeIds.size === 0) {
    showToast('يرجى تحديد الأصناف المراد طباعتها أولاً', 'warning');
    return;
  }
  const selectedItems = _allBarcodeItems.filter(i => _selectedBarcodeIds.has(i.id));
  const availableItems = selectedItems.filter(i => (parseInt(i.quantity) || 0) > 0);

  if (availableItems.length === 0) {
    showToast('الأصناف المحددة رصيدها 0 في المخزن، لا توجد كمية متاحة للطباعة', 'warning');
    return;
  }

  const itemsToPrint = availableItems.map(i => ({
    id: i.id,
    name: i.name,
    barcode: i.barcode,
    sell_price: i.sell_price,
    copies: parseInt(i.quantity)
  }));

  const totalLabels = itemsToPrint.reduce((s, it) => s + it.copies, 0);
  showToast(`جارٍ طباعة ${totalLabels} ملصق بعدد الكمية المتاحة...`, 'info');

  const res = await window.inventory.printBarcodeLabels(itemsToPrint, 1);
  if (res.success) {
    showToast(`تمت طباعة ${totalLabels} ملصق باركود بنجاح`, 'success');
  } else {
    showToast('خطأ في الطباعة: ' + (res.error || ''), 'error');
  }
}