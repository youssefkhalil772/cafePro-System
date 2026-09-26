/**
 * show-ids.js — أداة تشخيص: تعرض كود الجهاز وكود التثبيت والسيريال المتوقع
 * التشغيل: node show-ids.js
 */
'use strict';

const crypto = require('crypto');
const os     = require('os');
const fs     = require('fs');
const path   = require('path');

// ─── المفاتيح ────────────────────────────────────────────────────────────────
const SECRET_KEY        = 'PHOTOGRAPHY-STUDIO-DEVBLUETECH-2026-SECRET-X9K3M7P2';
const LEGACY_SECRET_KEY = 'EL-TARZY-DEVBLUETECH-2024-SECRET-X9K3M7P2';

// ─── كود الجهاز ──────────────────────────────────────────────────────────────
function getHardwareId() {
  const cpus     = os.cpus();
  const cpuModel = cpus.length > 0 ? cpus[0].model : 'UNKNOWN';
  const rawId    = `${cpuModel}-${os.totalmem()}-${os.hostname()}-${os.platform()}-${os.arch()}`;
  const hash     = crypto.createHash('sha256').update(rawId).digest('hex');
  const short    = hash.substring(0, 16).toUpperCase();
  return `${short.slice(0,4)}-${short.slice(4,8)}-${short.slice(8,12)}-${short.slice(12,16)}`;
}

// ─── كود التثبيت ─────────────────────────────────────────────────────────────
function getInstallId() {
  // نفس المسار الذي يستخدمه البرنامج: userData
  const appData  = process.env.APPDATA || os.homedir();
  const filePath = path.join(appData, 'Photography Studio System', '.install.id');
  try {
    if (fs.existsSync(filePath)) {
      const id = fs.readFileSync(filePath, 'utf8').trim();
      if (id && id.length >= 8) return id;
    }
  } catch (_) {}
  // fallback: مجلد المشروع
  const local = path.join(__dirname, '.install.id');
  try {
    if (fs.existsSync(local)) {
      return fs.readFileSync(local, 'utf8').trim();
    }
  } catch (_) {}
  return 'NOT-FOUND';
}

// ─── توليد سيريال ────────────────────────────────────────────────────────────
function generateSerial(hwId, installId, key) {
  const cleanHw      = hwId.replace(/-/g, '').toUpperCase();
  const cleanInstall = installId.replace(/-/g, '').toUpperCase();
  const hmac = crypto.createHmac('sha256', key)
                     .update(cleanHw + cleanInstall)
                     .digest('hex').toUpperCase();
  const part = hmac.substring(0, 20);
  return `${part.slice(0,5)}-${part.slice(5,10)}-${part.slice(10,15)}-${part.slice(15,20)}`;
}

// ─── تشغيل ───────────────────────────────────────────────────────────────────
const hwId     = getHardwareId();
const installId = getInstallId();
const newSerial    = generateSerial(hwId, installId, SECRET_KEY);
const legacySerial = generateSerial(hwId, installId, LEGACY_SECRET_KEY);

console.log('\n════════════════════════════════════════════════════════');
console.log('   معلومات التفعيل — Photography Studio System');
console.log('════════════════════════════════════════════════════════');
console.log(`\n  كود الجهاز   (HwId):      ${hwId}`);
console.log(`  كود التثبيت (InstallId): ${installId}`);
console.log('\n─────────────────────────────────────────────────────────');
console.log('  السيريال المتوقع (مفتاح جديد):');
console.log(`    ${newSerial}`);
console.log('\n  السيريال المتوقع (مفتاح قديم — Legacy Keygen):');
console.log(`    ${legacySerial}`);
console.log('\n════════════════════════════════════════════════════════\n');
