const path = require('path');
const { app } = require('electron');
const { getDb } = require('../database/db');

app.whenReady().then(() => {
  const db = getDb(app);
  
  console.log('--- Services Table Info ---');
  console.log(db.prepare('PRAGMA table_info(services)').all().map(c => c.name));

  console.log('--- Products Table Info ---');
  console.log(db.prepare('PRAGMA table_info(products)').all().map(c => c.name));

  console.log('--- Existing Services ---');
  console.log(db.prepare('SELECT * FROM services').all());

  console.log('--- Existing Products ---');
  console.log(db.prepare('SELECT * FROM products').all());

  console.log('--- Company Settings ---');
  console.log(db.prepare('SELECT * FROM company_settings WHERE id = 1').get());

  app.quit();
});
