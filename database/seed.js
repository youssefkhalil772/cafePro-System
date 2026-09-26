'use strict';

const bcrypt = require('bcryptjs');

function seedData(db) {
  // ─── Company Settings ────────────────────────────────────────────────────────
  const settings = db.prepare('SELECT COUNT(*) as cnt FROM company_settings').get();
  if (settings.cnt === 0) {
    db.prepare(`
      INSERT INTO company_settings (id, company_name, receipt_footer, receipt_notes, show_customer_phone, currency, recipe_mode_enabled, delivery_enabled)
      VALUES (1, 'كافيه ومطعم برو', 'شكراً لزيارتكم ونتمنى لكم وقتاً ممتعاً', '', 1, 'جنيه', 0, 0)
    `).run();
  } else {
    try {
      db.prepare(`
        UPDATE company_settings
        SET receipt_notes       = COALESCE(receipt_notes, ''),
            show_customer_phone = COALESCE(show_customer_phone, 1)
        WHERE id = 1
      `).run();
    } catch (e) { /* columns may not exist yet in old schema */ }
  }

  // ─── Invoice Sequence ────────────────────────────────────────────────────────
  const seqRow = db.prepare('SELECT COUNT(*) as cnt FROM invoice_sequence').get();
  if (seqRow.cnt === 0) {
    const year = new Date().getFullYear();
    db.prepare('INSERT INTO invoice_sequence (id, last_number, year) VALUES (1, 0, ?)').run(year);
  }

  // ─── Default Admin Employee ──────────────────────────────────────────────────
  const empCount = db.prepare('SELECT COUNT(*) as cnt FROM employees').get();
  if (empCount.cnt === 0) {
    db.prepare(`
      INSERT INTO employees (name, job_title, employee_type, username, password, is_active, monthly_salary)
      VALUES ('مدير النظام', 'مدير', 'مدير', 'admin', 'admin', 1, 0)
    `).run();
  }

  // ─── Default Admin User (bcrypt hashed) ─────────────────────────────────────
  const userCount = db.prepare('SELECT COUNT(*) as cnt FROM users').get();
  if (userCount.cnt === 0) {
    const adminEmp = db.prepare(`SELECT id FROM employees WHERE username = 'admin' OR job_title = 'مدير' LIMIT 1`).get();
    const empId = adminEmp ? adminEmp.id : null;
    const hash = bcrypt.hashSync('1234', 10);
    db.prepare(`
      INSERT INTO users (employee_id, username, password_hash, role, is_active)
      VALUES (?, 'admin', ?, 'admin', 1)
    `).run(empId, hash);
  }

  // ─── Default Treasury (zero opening balance for all 4 types) ────────────────
  const treasuryTypes = ['الخزينة', 'فودافون كاش', 'إنستا باي', 'فيزا'];
  for (const tType of treasuryTypes) {
    const exists = db.prepare('SELECT id FROM treasury WHERE treasury_type = ? LIMIT 1').get(tType);
    if (!exists) {
      db.prepare(`
        INSERT INTO treasury (type, description, amount, balance_after, treasury_type)
        VALUES ('إيراد', 'رصيد افتتاحي', 0, 0, ?)
      `).run(tType);
    }
  }

  // ─── Default Tables (إذا كان جدول الترابيزات فارغاً) ──────────────────────────
  try {
    const tableCount = db.prepare('SELECT COUNT(*) as cnt FROM tables').get();
    if (tableCount && tableCount.cnt === 0) {
      const insTable = db.prepare('INSERT INTO tables (name, section, seats, status) VALUES (?, ?, ?, ?)');
      insTable.run('ترابيزة 1', 'داخلي', 4, 'فاضية');
      insTable.run('ترابيزة 2', 'داخلي', 4, 'فاضية');
      insTable.run('ترابيزة 3', 'داخلي', 4, 'فاضية');
      insTable.run('ترابيزة 4 (عائلات)', 'عائلات', 6, 'فاضية');
      insTable.run('ترابيزة 5 (شرفة)', 'شرفة خارجي', 4, 'فاضية');
      insTable.run('ترابيزة 6 (شرفة)', 'شرفة خارجي', 4, 'فاضية');
    }
  } catch (e) {
    /* table may not exist yet before migration */
  }

  // ─── Default Categories for Cafe/Restaurant ─────────────────────────────────
  try {
    const catCount = db.prepare('SELECT COUNT(*) as cnt FROM service_categories').get();
    if (catCount && catCount.cnt === 0) {
      const insCat = db.prepare('INSERT INTO service_categories (name) VALUES (?)');
      insCat.run('مشروبات ساخنة');
      insCat.run('مشروبات باردة وعصائر');
      insCat.run('ساندوتشات ووجبات');
      insCat.run('حلو ومخبوزات');
    }
  } catch (e) {}
}

module.exports = { seedData };
