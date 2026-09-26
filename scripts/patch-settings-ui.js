const fs = require('fs');
const path = require('path');

const settingsHtmlPath = path.join(__dirname, '..', 'renderer', 'settings.html');
let html = fs.readFileSync(settingsHtmlPath, 'utf8');

html = html.replace(/<title>نظام إدارة استوديو التصوير — الإعدادات<\/title>/g, '<title>CafePro POS — إعدادات النظام والتهيئة</title>');
html = html.replace(/<div class="logo-icon">[\s\S]*?<\/div>\s*<div>\s*<div class="logo-text">استوديو التصوير<\/div>/g, 
  `<div class="logo-icon"><img src="../assets/logo.png" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" alt="Logo" onerror="this.src='../assets/icon.png'" /></div>
      <div>
        <div class="logo-text">كافيه ومطعم برو</div>`);

html = html.replace(/بيانات الاستوديو/g, 'بيانات الكافيه والمطعم');
html = html.replace(/اختر شعار الاستوديو/g, 'اختر شعار الكافيه');
html = html.replace(/اسم الاستوديو/g, 'اسم الكافيه والمطعم');
html = html.replace(/value="استوديو التصوير"/g, 'value="كافيه ومطعم برو"');
html = html.replace(/Photography Studio System • v2\.0/g, 'CafePro System • v2.0');
html = html.replace(/إظهار اسم الاستوديو على الملصق/g, 'إظهار اسم الكافيه على ملصق الباركود');
html = html.replace(/<div id="previewStudioName"[^>]*>استوديو التصوير<\/div>/g, '<div id="previewStudioName" style="font-size:11px; font-weight:800; color:#111; margin-bottom:2px; max-width:95%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">كافيه ومطعم برو</div>');

fs.writeFileSync(settingsHtmlPath, html, 'utf8');
console.log('Successfully updated settings.html');

const settingsJsPath = path.join(__dirname, '..', 'renderer', 'js', 'settings.js');
let js = fs.readFileSync(settingsJsPath, 'utf8');

js = js.replace(/'استوديو التصوير'/g, "'كافيه ومطعم برو'");
js = js.replace(/photoStudio_dayCutoffHour/g, 'cafepro_dayCutoffHour');

fs.writeFileSync(settingsJsPath, js, 'utf8');
console.log('Successfully updated settings.js');
