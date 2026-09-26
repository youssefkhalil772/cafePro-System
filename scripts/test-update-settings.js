const path = require('path');
const { app } = require('electron');
const { getDb } = require('../database/db');

app.whenReady().then(async () => {
  const db = getDb(app);

  // Simulate payload sent by renderer saveSettings()
  const data = {
    company_name: 'كافيه ومطعم برو',
    address: 'شارع الجمهورية - وسط البلد',
    phone: '01012345678',
    logo_path: null,
    tax_number: '123-456-789',
    receipt_footer: 'أهلاً بكم في كافيه ومطعم برو',
    receipt_notes: 'الأسعار شاملة ضريبة القيمة المضافة',
    show_customer_phone: 1,
    prevent_cashier_price_edit: 1,
    currency: 'ج.م',
    cashier_hide_reports: 1,
    cashier_hide_hr: 1,
    cashier_prevent_returns: 0,
    cashier_hide_finance: 1,
    cashier_prevent_discount: 1,
    cashier_prevent_settings: 1,
    stock_out_behavior: 'warn',
    wa_phone1: '',
    wa_phone2: '',
    wa_tpl_invoice_confirm: 'شكراً لزيارتكم',
    wa_tpl_order_ready: 'طلبك جاهز للاستلام',
    wa_tpl_delivered: 'تم تسليم الطلب بنجاح',
    wa_tpl_full_payment: 'تم سداد الحساب بالكامل',
    wa_tpl_partial_payment: 'تم تسجيل دفعة',
    admin_wa_phone: '',
    report_save_path: '',
    day_cutoff_hour: 4,
    recipe_mode_enabled: 1,
    delivery_enabled: 1,
    printer_receipt: '',
    printer_kitchen: '',
    printer_barcode: '',
    printer_reports: '',
    barcode_width: 38,
    barcode_height: 25,
    barcode_bar_height: 15,
    barcode_orientation: 'portrait',
    barcode_show_price: 1,
    barcode_show_name: 1,
    barcode_show_studio: 1,
  };

  // Inspect columns
  const tableCols = db.prepare('PRAGMA table_info(company_settings)').all().map(c => c.name);
  console.log('Available columns in company_settings:', tableCols);

  const keys = Object.keys(data).filter(k => tableCols.includes(k));
  console.log('Valid keys matched for update:', keys);

  const setClause = keys.map(k => `${k} = ?`).join(', ');
  const values = keys.map(k => data[k]);

  try {
    const info = db.prepare(`UPDATE company_settings SET ${setClause} WHERE id = 1`).run(...values);
    console.log('Update result changes:', info.changes);
    const updated = db.prepare('SELECT company_name, day_cutoff_hour, recipe_mode_enabled FROM company_settings WHERE id = 1').get();
    console.log('Verification read:', updated);
  } catch (err) {
    console.error('Update failed with error:', err);
  }

  app.quit();
});
