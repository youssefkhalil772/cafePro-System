const path = require('path');
const { app } = require('electron');
const { getDb } = require('../database/db');

app.whenReady().then(() => {
  const db = getDb(app);
  const cols = db.prepare('PRAGMA table_info(company_settings)').all().map(c => c.name);
  console.log('company_settings columns:', cols);

  db.prepare(`UPDATE company_settings SET company_name = 'كافيه ومطعم برو' WHERE id = 1`).run();
  const s = db.prepare('SELECT company_name FROM company_settings WHERE id = 1').get();
  console.log('Updated company_name:', s);
  app.quit();
});
