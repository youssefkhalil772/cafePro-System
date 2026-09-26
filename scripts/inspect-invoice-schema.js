const path = require('path');
const { app } = require('electron');
const { getDb } = require('../database/db');

app.whenReady().then(() => {
  const db = getDb(app);
  
  console.log('--- invoices columns ---');
  console.log(db.prepare('PRAGMA table_info(invoices)').all().map(c => c.name));

  console.log('--- company_settings columns ---');
  console.log(db.prepare('PRAGMA table_info(company_settings)').all().map(c => c.name));

  console.log('--- services columns ---');
  console.log(db.prepare('PRAGMA table_info(services)').all().map(c => c.name));

  app.quit();
});
