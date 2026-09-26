const path = require('path');
const { app } = require('electron');
const { getDb } = require('../database/db');

app.whenReady().then(() => {
  const db = getDb(app);
  
  // Check if invoices use services
  const invoiceItemsCount = db.prepare('SELECT COUNT(*) as count FROM invoice_items').get().count;
  console.log('Total invoice items:', invoiceItemsCount);

  // Check categories
  const categories = db.prepare('SELECT * FROM service_categories').all();
  console.log('Current categories:', categories);

  // Check if categories are legacy studio categories
  const studioCatNames = ['جلسات تصوير (Sessions)', 'طباعة وتكبير صور', 'ألبومات وبراويز', 'خدمات استوديو وتعديل'];
  const hasStudioCats = categories.some(c => studioCatNames.includes(c.name));

  if (hasStudioCats && invoiceItemsCount === 0) {
    console.log('Resetting categories to Cafe Menu categories...');
    db.prepare('DELETE FROM service_categories').run();
    db.prepare('DELETE FROM services').run();

    const insertCat = db.prepare('INSERT INTO service_categories (id, name) VALUES (?, ?)');
    insertCat.run(1, 'مشروبات ساخنة (Hot Drinks)');
    insertCat.run(2, 'مشروبات باردة ومثلجة (Cold Drinks)');
    insertCat.run(3, 'حلويات ومخبوزات (Bakery & Desserts)');
    insertCat.run(4, 'وجبات وسندوتشات (Food & Snacks)');
    insertCat.run(5, 'إضافات ونكهات (Add-ons)');

    const insertItem = db.prepare(`
      INSERT INTO services (category_id, name, barcode, sell_price, cost_price, track_inventory, quantity, low_stock_threshold)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // 1. Hot Drinks
    insertItem.run(1, 'اسبريسو سنجل', '1001', 35, 10, 0, 0, 5);
    insertItem.run(1, 'اسبريسو دبل', '1002', 45, 15, 0, 0, 5);
    insertItem.run(1, 'كابتشينو', '1003', 55, 20, 0, 0, 5);
    insertItem.run(1, 'لاتيه', '1004', 55, 20, 0, 0, 5);
    insertItem.run(1, 'ميكياتو كراميل', '1005', 65, 25, 0, 0, 5);
    insertItem.run(1, 'شاي كرك', '1006', 30, 8, 0, 0, 5);
    insertItem.run(1, 'شاي أحمر / أخضر', '1007', 20, 5, 0, 0, 5);

    // 2. Cold Drinks
    insertItem.run(2, 'آيس لاتيه', '2001', 60, 22, 0, 0, 5);
    insertItem.run(2, 'آيس كراميل ماكياتو', '2002', 70, 26, 0, 0, 5);
    insertItem.run(2, 'موهيتو بلو بيري', '2003', 60, 18, 0, 0, 5);
    insertItem.run(2, 'سموذي مانجو فريش', '2004', 65, 22, 0, 0, 5);
    insertItem.run(2, 'عصير برتقال فريش', '2005', 50, 15, 0, 0, 5);
    insertItem.run(2, 'ميلك شيك شوكولاتة', '2006', 65, 24, 0, 0, 5);

    // 3. Bakery & Desserts
    insertItem.run(3, 'تشيز كيك فراولة', '3001', 75, 30, 1, 15, 3);
    insertItem.run(3, 'مولتن كيك شكولاتة', '3002', 80, 32, 1, 10, 2);
    insertItem.run(3, 'وافل بلجيكي بالنوتيلا', '3003', 70, 28, 1, 12, 3);
    insertItem.run(3, 'كرواسون زبدة سادة', '3004', 40, 15, 1, 20, 5);
    insertItem.run(3, 'كوكيز شوكليت شيبس', '3005', 30, 10, 1, 25, 5);

    // 4. Food & Snacks
    insertItem.run(4, 'كلوب ساندوتش ديك رومي وجبنة', '4001', 85, 38, 1, 10, 2);
    insertItem.run(4, 'برجر لحم كلاسيك بيف', '4002', 110, 50, 1, 10, 2);
    insertItem.run(4, 'ساندوتش دجاج كرسبي', '4003', 95, 42, 1, 10, 2);
    insertItem.run(4, 'بطاطس مقلية فارم فرايز', '4004', 40, 12, 1, 30, 5);

    // 5. Add-ons
    insertItem.run(5, 'شوت اسبريسو إضافي', '5001', 15, 5, 0, 0, 0);
    insertItem.run(5, 'سيرب كراميل إضافي', '5002', 12, 4, 0, 0, 0);
    insertItem.run(5, 'سيرب فانيليا إضافي', '5003', 12, 4, 0, 0, 0);
    insertItem.run(5, 'زيادة كريمة خفق (Whipped Cream)', '5004', 15, 5, 0, 0, 0);
    insertItem.run(5, 'حليب لوز / شوفان نباتي بديل', '5005', 20, 10, 0, 0, 0);

    console.log('Categories and Cafe Menu items successfully seeded!');
  } else {
    // If categories had studio names but have invoices, rename them nicely
    for (const cat of categories) {
      if (cat.name === 'جلسات تصوير (Sessions)') {
        db.prepare('UPDATE service_categories SET name = ? WHERE id = ?').run('مشروبات ساخنة', cat.id);
      } else if (cat.name === 'طباعة وتكبير صور') {
        db.prepare('UPDATE service_categories SET name = ? WHERE id = ?').run('مشروبات باردة', cat.id);
      } else if (cat.name === 'ألبومات وبراويز') {
        db.prepare('UPDATE service_categories SET name = ? WHERE id = ?').run('حلويات ومخبوزات', cat.id);
      } else if (cat.name === 'خدمات استوديو وتعديل') {
        db.prepare('UPDATE service_categories SET name = ? WHERE id = ?').run('وجبات وسندوتشات', cat.id);
      }
    }
  }

  // Update company_settings default name and business_field
  db.prepare(`
    UPDATE company_settings 
    SET company_name = 'كافيه ومطعم برو',
        business_field = 'كافيه ومطعم'
    WHERE id = 1 AND (company_name LIKE '%استوديو%' OR company_name = '' OR company_name IS NULL)
  `).run();

  const finalSettings = db.prepare('SELECT company_name, business_field FROM company_settings WHERE id = 1').get();
  console.log('Final Settings:', finalSettings);

  app.quit();
});
