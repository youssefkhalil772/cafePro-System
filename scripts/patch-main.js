const fs = require('fs');
const path = require('path');

const mainPath = path.join(__dirname, '..', 'main.js');
let content = fs.readFileSync(mainPath, 'utf8');

const startIdx = content.indexOf("mainWindow.webContents.once('did-finish-load'");
if (startIdx === -1) {
  console.error("Could not find did-finish-load in main.js");
  process.exit(1);
}

const endMarker = "  });\n\n  //";
const endIdx = content.indexOf(endMarker, startIdx);
if (endIdx === -1) {
  console.error("Could not find endMarker in main.js");
  process.exit(1);
}

const targetBlock = content.substring(startIdx, endIdx + 5);

const replacement = `let whatsAppStarted = false;
  function triggerBackgroundServices() {
    if (whatsAppStarted) return;
    whatsAppStarted = true;
    setTimeout(() => {
      try {
        const { getDb } = require('./database/db');
        const db = getDb(app);
        initWhatsAppManagerWithApp(db, mainWindow, app).catch(err => {
          logError('[Main] WhatsApp Manager: ' + err.message);
        });
        initWebhookAndTunnel(db, mainWindow).catch(err => {
          logError('[Main] Webhook/Tunnel: ' + err.message);
        });
      } catch (err) {
        logError('[Main] Background service start error: ' + err.message);
      }
    }, 2000);
  }

  mainWindow.webContents.on('did-navigate', (event, url) => {
    if (url && !url.includes('login.html')) {
      triggerBackgroundServices();
    }
  });`;

content = content.replace(targetBlock, replacement);
content = content.replace("app.setAppUserModelId('com.deltatech.studiopro')", "app.setAppUserModelId('com.deltatech.cafepro')");

fs.writeFileSync(mainPath, content, 'utf8');
console.log("Successfully patched main.js");
