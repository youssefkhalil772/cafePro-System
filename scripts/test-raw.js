const path = require('path');
const { app } = require('electron');
const { getDb } = require('../database/db');

app.whenReady().then(() => {
  const db = getDb(app);
  const rows = db.prepare('SELECT * FROM raw_materials').all();
  console.log('Raw Materials count:', rows.length);
  console.log('Raw Materials sample:', rows.slice(0, 10));
  app.quit();
});
