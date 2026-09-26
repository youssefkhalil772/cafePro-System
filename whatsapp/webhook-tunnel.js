'use strict';

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const os = require('os');
const logFile = path.join(os.homedir(), 'Desktop', 'photostudio-error.txt');
function logTunnel(msg) {
  try { fs.appendFileSync(logFile, `\n[${new Date().toISOString()}] [Tunnel] ${msg}`); } catch(e){}
  console.log('[Tunnel]', msg);
}

let tunnelProcess = null;
let tunnelUrl = null;
let tunnelStatus = 'stopped'; // 'stopped' | 'starting' | 'connected' | 'error'
let lastError = null;
let mainWindowRef = null;

function getCloudflaredPath() {
  // 1. مسار resources خارج الـ asar (بعد التجميع والتثبيت - ملف حقيقي قابل للتشغيل)
  if (process.resourcesPath) {
    const resBin = path.join(process.resourcesPath, 'bin', 'cloudflared.exe');
    try {
      if (fs.existsSync(resBin)) return resBin;
    } catch (e) {}
  }

  // 2. مسار مجاور لمسار تشغيل Electron
  try {
    if (process.execPath) {
      const exeDirBin = path.join(path.dirname(process.execPath), 'resources', 'bin', 'cloudflared.exe');
      if (fs.existsSync(exeDirBin)) return exeDirBin;
    }
  } catch (e) {}

  // 3. مسار أثناء التطوير (فقط إذا لم يكن داخل app.asar)
  const localBin = path.join(__dirname, '..', 'bin', 'cloudflared.exe');
  if (!localBin.includes('app.asar') && fs.existsSync(localBin)) {
    return localBin;
  }

  // 4. مسار userData
  try {
    const { app } = require('electron');
    if (app) {
      const userBin = path.join(app.getPath('userData'), 'bin', 'cloudflared.exe');
      if (fs.existsSync(userBin)) return userBin;
    }
  } catch (e) {}

  return null;
}

function startTunnel(port = 3000, mainWindow = null) {
  mainWindowRef = mainWindow;

  if (tunnelProcess && tunnelStatus === 'connected' && tunnelUrl) {
    return Promise.resolve(getTunnelStatus());
  }

  stopTunnel();

  const binPath = getCloudflaredPath();
  if (!binPath) {
    tunnelStatus = 'error';
    lastError = 'ملف cloudflared.exe غير موجود في مسار التطبيق';
    logTunnel('⚠️ ' + lastError);
    return Promise.resolve(getTunnelStatus());
  }

  tunnelStatus = 'starting';
  lastError = null;
  tunnelUrl = null;

  logTunnel('🚀 تشغيل النفق السحابي باستخدام: ' + binPath + ' على المنفذ ' + port);

  return new Promise((resolve) => {
    let resolved = false;
    const finish = () => {
      if (!resolved) {
        resolved = true;
        resolve(getTunnelStatus());
      }
    };

    // مهلة 30 ثانية للحصول على الرابط
    const timeout = setTimeout(() => {
      if (tunnelStatus === 'starting') {
        tunnelStatus = 'error';
        lastError = 'استغرق إنشاء النفق وقتاً أطول من المتوقع';
        logTunnel('⏰ ' + lastError);
        finish();
      }
    }, 30000);

    try {
      tunnelProcess = spawn(binPath, ['tunnel', '--url', 'http://127.0.0.1:' + port], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      const handleOutput = (data) => {
        const text = data.toString();
        // البحث عن رابط trycloudflare.com
        const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
        if (match && !tunnelUrl) {
          tunnelUrl = match[0];
          tunnelStatus = 'connected';
          clearTimeout(timeout);
          logTunnel('🟢 تم إنشاء النفق بنجاح: ' + tunnelUrl);
          logTunnel('🔗 رابط الـ Webhook: ' + tunnelUrl + '/webhook');

          if (mainWindowRef && !mainWindowRef.isDestroyed()) {
            mainWindowRef.webContents.send('whatsapp:tunnel-status', getTunnelStatus());
          }
          finish();
        }
      };

      tunnelProcess.stdout.on('data', handleOutput);
      tunnelProcess.stderr.on('data', handleOutput);

      tunnelProcess.on('error', (err) => {
        logTunnel('❌ خطأ في تشغيل cloudflared: ' + err.message);
        tunnelStatus = 'error';
        lastError = err.message;
        clearTimeout(timeout);
        finish();
      });

      tunnelProcess.on('close', (code) => {
        logTunnel('ℹ️ توقف نفق Cloudflare برمز خروج: ' + code);
        tunnelStatus = 'stopped';
        tunnelProcess = null;
        if (mainWindowRef && !mainWindowRef.isDestroyed()) {
          mainWindowRef.webContents.send('whatsapp:tunnel-status', getTunnelStatus());
        }
      });

    } catch (err) {
      clearTimeout(timeout);
      tunnelStatus = 'error';
      lastError = err.message;
      logTunnel('💥 استثناء عند تشغيل النفق: ' + err.message);
      finish();
    }
  });
}

function stopTunnel() {
  if (tunnelProcess) {
    try {
      tunnelProcess.kill('SIGTERM');
    } catch (e) {
      try { tunnelProcess.kill('SIGKILL'); } catch {}
    }
    tunnelProcess = null;
  }
  tunnelStatus = 'stopped';
  tunnelUrl = null;
  lastError = null;
  return getTunnelStatus();
}

function getTunnelStatus() {
  return {
    status: tunnelStatus,
    url: tunnelUrl,
    webhookUrl: tunnelUrl ? (tunnelUrl + '/webhook') : null,
    error: lastError,
    binFound: !!getCloudflaredPath()
  };
}

async function restartTunnel(port = 3000, mainWindow = null) {
  stopTunnel();
  return await startTunnel(port, mainWindow);
}

module.exports = {
  startTunnel,
  stopTunnel,
  getTunnelStatus,
  restartTunnel,
  getCloudflaredPath
};
