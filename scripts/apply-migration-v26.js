const path = require('path');
const { app } = require('electron');
const { getDb } = require('../database/db');

app.whenReady().then(() => {
  const db = getDb(app);

  function runSafe(sql) {
    try {
      db.exec(sql);
    } catch (e) {
      if (!e.message.includes('duplicate column') && !e.message.includes('already exists')) {
        console.warn('[Migration Safe Warning]', e.message);
      }
    }
  }

  console.log('--- Applying Migration v26 ---');

  // 1. Company settings: tax & service charge columns
  runSafe("ALTER TABLE company_settings ADD COLUMN tax_enabled INTEGER DEFAULT 0");
  runSafe("ALTER TABLE company_settings ADD COLUMN tax_rate REAL DEFAULT 14");
  runSafe("ALTER TABLE company_settings ADD COLUMN tax_type TEXT DEFAULT 'inclusive'");
  runSafe("ALTER TABLE company_settings ADD COLUMN tax_exempt_takeaway INTEGER DEFAULT 1");
  runSafe("ALTER TABLE company_settings ADD COLUMN service_charge_enabled INTEGER DEFAULT 1");
  runSafe("ALTER TABLE company_settings ADD COLUMN service_charge_rate REAL DEFAULT 12");

  // 2. Services: item_type & is_taxable
  runSafe("ALTER TABLE services ADD COLUMN item_type TEXT DEFAULT 'prepared'");
  runSafe("ALTER TABLE services ADD COLUMN is_taxable INTEGER DEFAULT 1");

  // 3. Invoices: order_type, tax, service charge
  runSafe("ALTER TABLE invoices ADD COLUMN order_type TEXT DEFAULT 'صالة'");
  runSafe("ALTER TABLE invoices ADD COLUMN tax_rate REAL DEFAULT 0");
  runSafe("ALTER TABLE invoices ADD COLUMN tax_amount REAL DEFAULT 0");
  runSafe("ALTER TABLE invoices ADD COLUMN service_rate REAL DEFAULT 0");
  runSafe("ALTER TABLE invoices ADD COLUMN service_amount REAL DEFAULT 0");

  // Enable recipe mode and service charge in settings
  db.prepare(`
    UPDATE company_settings SET
      recipe_mode_enabled = 1,
      service_charge_enabled = 1,
      service_charge_rate = 12,
      tax_enabled = 1,
      tax_rate = 14,
      tax_type = 'inclusive',
      tax_exempt_takeaway = 1
    WHERE id = 1
  `).run();

  // 4. Seed Raw Materials if empty
  const rawCount = db.prepare('SELECT COUNT(*) as cnt FROM raw_materials WHERE is_active = 1').get().cnt;
  console.log('Existing active raw materials:', rawCount);

  if (rawCount === 0) {
    console.log('Seeding Cafe Raw Materials...');
    const insRaw = db.prepare(`
      INSERT INTO raw_materials (name, unit, quantity, low_stock_threshold, cost_per_unit)
      VALUES (?, ?, ?, ?, ?)
    `);

    // Raw materials with realistic cafe units and costs
    insRaw.run('بن اسبريسو حبوب (Espresso Beans)', 'جرام', 5000, 1000, 0.50); // 500 EGP/kg
    insRaw.run('حليب كامل الدسم فريش (Fresh Milk)', 'مل', 10000, 2000, 0.04);   // 40 EGP/L
    insRaw.run('سكر أبيض ناعم (Sugar)', 'جرام', 5000, 1000, 0.04);
    insRaw.run('سيرب كراميل مركز (Caramel Syrup)', 'مل', 1000, 200, 0.30);
    insRaw.run('سيرب فانيليا مركز (Vanilla Syrup)', 'مل', 1000, 200, 0.30);
    insRaw.run('شاي أحمر فاخر (Red Tea)', 'جرام', 2000, 500, 0.15);
    insRaw.run('أكواب ورقية 8 أونص (Paper Cups 8oz)', 'قطعة', 500, 100, 1.50);
    insRaw.run('أكواب ورقية 12 أونص (Paper Cups 12oz)', 'قطعة', 500, 100, 2.00);
    insRaw.run('ماصات وشاليموه (Straws)', 'قطعة', 1000, 200, 0.25);
    insRaw.run('خبز برجر سمسم (Burger Buns)', 'قطعة', 50, 10, 5.00);
    insRaw.run('شريحة برجر بيف 150 جرام (Beef Patty)', 'قطعة', 50, 10, 35.00);
    insRaw.run('جبنة شيدر شرائح (Cheddar Slices)', 'قطعة', 100, 20, 4.00);
    insRaw.run('بطاطس فارم فرايز مجمدة (Fries)', 'جرام', 10000, 2000, 0.05);

    console.log('Seeded 13 raw materials successfully!');
  }

  // Fetch raw materials map by name
  const rawMap = {};
  db.prepare('SELECT id, name, cost_per_unit FROM raw_materials').all().forEach(r => {
    rawMap[r.name] = r;
  });

  // 5. Seed recipes for core menu items
  const services = db.prepare('SELECT id, name FROM services').all();
  const insRecipe = db.prepare('INSERT OR REPLACE INTO recipe_items (service_id, raw_material_id, quantity_used) VALUES (?, ?, ?)');
  const updateServiceCost = db.prepare('UPDATE services SET cost_price = ?, item_type = ? WHERE id = ?');

  for (const s of services) {
    if (s.name.includes('اسبريسو سنجل')) {
      const bean = Object.values(rawMap).find(r => r.name.includes('بن اسبريسو'));
      const cup = Object.values(rawMap).find(r => r.name.includes('8 أونص'));
      if (bean && cup) {
        db.prepare('DELETE FROM recipe_items WHERE service_id = ?').run(s.id);
        insRecipe.run(s.id, bean.id, 9);  // 9g beans
        insRecipe.run(s.id, cup.id, 1);   // 1 cup
        const totalCost = (9 * bean.cost_per_unit) + (1 * cup.cost_per_unit);
        updateServiceCost.run(totalCost, 'prepared', s.id);
      }
    } else if (s.name.includes('اسبريسو دبل')) {
      const bean = Object.values(rawMap).find(r => r.name.includes('بن اسبريسو'));
      const cup = Object.values(rawMap).find(r => r.name.includes('8 أونص'));
      if (bean && cup) {
        db.prepare('DELETE FROM recipe_items WHERE service_id = ?').run(s.id);
        insRecipe.run(s.id, bean.id, 18); // 18g beans
        insRecipe.run(s.id, cup.id, 1);
        const totalCost = (18 * bean.cost_per_unit) + (1 * cup.cost_per_unit);
        updateServiceCost.run(totalCost, 'prepared', s.id);
      }
    } else if (s.name.includes('كابتشينو')) {
      const bean = Object.values(rawMap).find(r => r.name.includes('بن اسبريسو'));
      const milk = Object.values(rawMap).find(r => r.name.includes('حليب'));
      const cup = Object.values(rawMap).find(r => r.name.includes('8 أونص'));
      if (bean && milk && cup) {
        db.prepare('DELETE FROM recipe_items WHERE service_id = ?').run(s.id);
        insRecipe.run(s.id, bean.id, 18);
        insRecipe.run(s.id, milk.id, 150);
        insRecipe.run(s.id, cup.id, 1);
        const totalCost = (18 * bean.cost_per_unit) + (150 * milk.cost_per_unit) + (1 * cup.cost_per_unit);
        updateServiceCost.run(totalCost, 'prepared', s.id);
      }
    } else if (s.name.includes('لاتيه')) {
      const bean = Object.values(rawMap).find(r => r.name.includes('بن اسبريسو'));
      const milk = Object.values(rawMap).find(r => r.name.includes('حليب'));
      const cup = Object.values(rawMap).find(r => r.name.includes('12 أونص'));
      if (bean && milk && cup) {
        db.prepare('DELETE FROM recipe_items WHERE service_id = ?').run(s.id);
        insRecipe.run(s.id, bean.id, 18);
        insRecipe.run(s.id, milk.id, 200);
        insRecipe.run(s.id, cup.id, 1);
        const totalCost = (18 * bean.cost_per_unit) + (200 * milk.cost_per_unit) + (1 * cup.cost_per_unit);
        updateServiceCost.run(totalCost, 'prepared', s.id);
      }
    } else if (s.name.includes('برجر')) {
      const bun = Object.values(rawMap).find(r => r.name.includes('خبز برجر'));
      const patty = Object.values(rawMap).find(r => r.name.includes('شريحة برجر'));
      const cheese = Object.values(rawMap).find(r => r.name.includes('جبنة شيدر'));
      if (bun && patty && cheese) {
        db.prepare('DELETE FROM recipe_items WHERE service_id = ?').run(s.id);
        insRecipe.run(s.id, bun.id, 1);
        insRecipe.run(s.id, patty.id, 1);
        insRecipe.run(s.id, cheese.id, 1);
        const totalCost = (1 * bun.cost_per_unit) + (1 * patty.cost_per_unit) + (1 * cheese.cost_per_unit);
        updateServiceCost.run(totalCost, 'prepared', s.id);
      }
    }
  }

  // 6. Ensure we also have a Ready/Packaged item category and items
  let packagedCat = db.prepare("SELECT id FROM service_categories WHERE name LIKE '%معلبات%' OR name LIKE '%مشروبات باردة%' LIMIT 1").get();
  if (packagedCat) {
    const existingCan = db.prepare("SELECT id FROM services WHERE name LIKE '%كوكاكولا%'").get();
    if (!existingCan) {
      db.prepare(`
        INSERT INTO services (category_id, name, barcode, sell_price, cost_price, track_inventory, quantity, low_stock_threshold, item_type)
        VALUES (?, 'كانز كوكاكولا 330 مل', '6221001001', 25.00, 12.00, 1, 48, 12, 'ready')
      `).run(packagedCat.id);
      db.prepare(`
        INSERT INTO services (category_id, name, barcode, sell_price, cost_price, track_inventory, quantity, low_stock_threshold, item_type)
        VALUES (?, 'مياه معدنية طبيعية 500 مل', '6221001002', 12.00, 5.00, 1, 100, 20, 'ready')
      `).run(packagedCat.id);
      db.prepare(`
        INSERT INTO services (category_id, name, barcode, sell_price, cost_price, track_inventory, quantity, low_stock_threshold, item_type)
        VALUES (?, 'مشروب طاقة ريد بول', '6221001003', 70.00, 45.00, 1, 24, 6, 'ready')
      `).run(packagedCat.id);
      console.log('Seeded ready-to-sell packaged items with inventory!');
    }
  }

  // Register in schema_migrations
  try {
    db.prepare('INSERT OR IGNORE INTO schema_migrations (version) VALUES (26)').run();
  } catch (_) {}

  console.log('--- Migration v26 Completed Successfully! ---');
  app.quit();
});
