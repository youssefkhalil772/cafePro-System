'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Fix Windows focus issue by requesting the main process to natively refocus
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    ipcRenderer.invoke('window:requestFocus').catch(() => {});
  }, 100);
});


contextBridge.exposeInMainWorld('auth', {
  login: (username, password) => ipcRenderer.invoke('auth:login', username, password),
  logout: () => ipcRenderer.invoke('auth:logout'),
  getSession: () => ipcRenderer.invoke('auth:getSession'),
  verifyAdminPassword: (password) => ipcRenderer.invoke('auth:verifyAdminPassword', password),
});

contextBridge.exposeInMainWorld('shift', {
  start: (openingCash) => ipcRenderer.invoke('shift:start', openingCash),
  end: (shiftId, actualCash, actualVodafone, actualInstapay, actualVisa, notes) => ipcRenderer.invoke('shift:end', shiftId, actualCash, actualVodafone, actualInstapay, actualVisa, notes),
  getSummary: (shiftId) => ipcRenderer.invoke('shift:getSummary', shiftId),
  getCurrent: () => ipcRenderer.invoke('shift:getCurrent'),
});

contextBridge.exposeInMainWorld('tables', {
  list: () => ipcRenderer.invoke('tables:list'),
  save: (data) => ipcRenderer.invoke('tables:save', data),
  delete: (id) => ipcRenderer.invoke('tables:delete', id),
  updateStatus: (id, status) => ipcRenderer.invoke('tables:updateStatus', id, status),
  reserve: (data) => ipcRenderer.invoke('tables:reserve', data),
  transfer: (fromId, toId) => ipcRenderer.invoke('tables:transfer', fromId, toId),
  merge: (fromId, toId) => ipcRenderer.invoke('tables:merge', fromId, toId),
});

contextBridge.exposeInMainWorld('audit', {
  log: (action, tableName, recordId, oldValue, newValue) => ipcRenderer.invoke('audit:log', action, tableName, recordId, oldValue, newValue),
});



contextBridge.exposeInMainWorld('suppliers', {
  list: () => ipcRenderer.invoke('suppliers:list'),
  save: (data) => ipcRenderer.invoke('suppliers:save', data),
  delete: (id) => ipcRenderer.invoke('suppliers:delete', id),
  getStatement: (id) => ipcRenderer.invoke('suppliers:getStatement', id),
  pay: (data) => ipcRenderer.invoke('suppliers:pay', data),
});

contextBridge.exposeInMainWorld('purchases', {
  save: (data, items) => ipcRenderer.invoke('purchases:save', data, items),
  list: (opts) => ipcRenderer.invoke('purchases:list', opts),
  getDetails: (id) => ipcRenderer.invoke('purchases:getDetails', id),
});

contextBridge.exposeInMainWorld('delivery', {
  getActiveOrders: () => ipcRenderer.invoke('delivery:getActiveOrders'),
  updateStatus: (id, status) => ipcRenderer.invoke('delivery:updateStatus', id, status),
  getReport: (opts) => ipcRenderer.invoke('delivery:getReport', opts),
});

contextBridge.exposeInMainWorld('users', {
  list: () => ipcRenderer.invoke('users:list'),
  create: (userData) => ipcRenderer.invoke('users:create', userData),
  toggleActive: (userId) => ipcRenderer.invoke('users:toggleActive', userId),
  resetPassword: (userId, newPassword) => ipcRenderer.invoke('users:resetPassword', userId, newPassword),
});

contextBridge.exposeInMainWorld('backup', {
  create: (type) => ipcRenderer.invoke('backup:create', type),
  list: () => ipcRenderer.invoke('backup:list'),
  restore: (filePath) => ipcRenderer.invoke('backup:restore', filePath),
  getExternalPath: () => ipcRenderer.invoke('backup:getExternalPath'),
  setExternalPath: (dir) => ipcRenderer.invoke('backup:setExternalPath', dir),
  clearExternalPath: () => ipcRenderer.invoke('backup:clearExternalPath'),
});

contextBridge.exposeInMainWorld('db', {
  // Generic SQL operations
  query: (sql, params) => ipcRenderer.invoke('db:query', sql, params),
  queryOne: (sql, params) => ipcRenderer.invoke('db:queryOne', sql, params),
  run: (sql, params) => ipcRenderer.invoke('db:run', sql, params),
  getDailyReport: (date) => ipcRenderer.invoke('db:getDailyReport', date),

  // Invoice
  generateInvoiceNumber: () => ipcRenderer.invoke('db:previewInvoiceNumber'),
  saveInvoice: (invoiceData, items) => ipcRenderer.invoke('db:saveInvoice', invoiceData, items),
  updateInvoiceStatus: (invoiceId, status) => ipcRenderer.invoke('db:updateInvoiceStatus', invoiceId, status),
  payInvoiceRemaining: (invoiceId, amount, safeType) => ipcRenderer.invoke('db:payInvoiceRemaining', invoiceId, amount, safeType),
  reversePayment: (invoiceId, amount) => ipcRenderer.invoke('db:reversePayment', invoiceId, amount),

  // Returns
  saveReturn: (returnData, items) => ipcRenderer.invoke('db:saveReturn', returnData, items),

  // Treasury
  getTreasuryBalance: (type) => ipcRenderer.invoke('db:getTreasuryBalance', type),
  addTreasuryEntry: (type, desc, amount, tType) => ipcRenderer.invoke('db:addTreasuryEntry', type, desc, amount, tType),

  // Salary
  paySalary: (data) => ipcRenderer.invoke('db:paySalary', data),
  reverseSalaryPayment: (employeeId, month) => ipcRenderer.invoke('db:reverseSalaryPayment', employeeId, month),

  // Settings
  getSettings: () => ipcRenderer.invoke('db:getSettings'),
  updateSettings: (data) => ipcRenderer.invoke('db:updateSettings', data),
  copyLogo: (sourcePath) => ipcRenderer.invoke('settings:copyLogo', sourcePath),

  // Backup (legacy)
  backup: (destPath) => ipcRenderer.invoke('db:backup', destPath),

  // Selective Reset
  selectiveReset: (options) => ipcRenderer.invoke('db:selectiveReset', options),

  // WhatsApp Messages & Conversations
  getWhatsAppConversations: (query) => ipcRenderer.invoke('db:getWhatsAppConversations', query),
  getWhatsAppMessages: (phone) => ipcRenderer.invoke('db:getWhatsAppMessages', phone),
  saveWhatsAppMessage: (msg) => ipcRenderer.invoke('db:saveWhatsAppMessage', msg),
  markWhatsAppConversationAsRead: (phone) => ipcRenderer.invoke('db:markWhatsAppConversationAsRead', phone),
  getWhatsAppUnreadTotal: () => ipcRenderer.invoke('db:getWhatsAppUnreadTotal'),
  deleteWhatsAppConversation: (phone) => ipcRenderer.invoke('db:deleteWhatsAppConversation', phone),
  deleteWhatsAppMessage: (id) => ipcRenderer.invoke('db:deleteWhatsAppMessage', id),
});

contextBridge.exposeInMainWorld('electron', {
  // Navigation
  navigate: (page) => ipcRenderer.invoke('navigate', page),

  // Request keyboard focus back (fix Windows focus loss)
  requestFocus: () => ipcRenderer.invoke('window:requestFocus'),

  // Printing
  print: (options) => ipcRenderer.invoke('print', options),
  getPrinters: () => ipcRenderer.invoke('printers:list'),

  // Dialogs
  showSaveDialog: (options) => ipcRenderer.invoke('dialog:showSaveDialog', options),
  showOpenDialog: (options) => ipcRenderer.invoke('dialog:showOpenDialog', options),

  // External
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  // App info
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getUserDataPath: () => ipcRenderer.invoke('app:getUserDataPath'),
  getLogoPath: (dbPath) => ipcRenderer.invoke('app:getLogoPath', dbPath),
  restart: () => ipcRenderer.invoke('app:restart'),
  factoryReset: () => ipcRenderer.invoke('app:factoryReset'),
  printToPDF: (path) => ipcRenderer.invoke('app:printToPDF', path),
  selectFolder: () => ipcRenderer.invoke('app:selectFolder'),
  generateAndSendReport: (opts) => ipcRenderer.invoke('app:generateAndSendReport', opts),

  // Silent thermal printing — no dialog
  printThermal: (html, printerName) => ipcRenderer.invoke('print:thermal', { html, printerName: printerName || '' }),

  // Quit flow — listen for backup confirmation from main process
  onConfirmBackupBeforeQuit: (callback) => {
    ipcRenderer.on('confirm-backup-before-quit', () => callback());
  },
  quitWithBackup: () => ipcRenderer.send('quit-with-backup'),
  quitWithoutBackup: () => ipcRenderer.send('quit-without-backup'),
  cancelQuit: () => ipcRenderer.send('cancel-quit'),
});

// ─── WhatsApp API ──────────────────────────────────────────────────────────────
contextBridge.exposeInMainWorld('whatsapp', {
  // الحالة والـ QR
  getStatus:                   () => ipcRenderer.invoke('whatsapp:getStatus'),
  getQR:                       () => ipcRenderer.invoke('whatsapp:getQR'),

  // إرسال الرسائل (الـ channels القديمة — لا تتغير)
  send:            (phone, msg) => ipcRenderer.invoke('whatsapp:send', phone, msg),
  sendInvoiceConfirm:       (d) => ipcRenderer.invoke('whatsapp:sendInvoiceConfirm', d),
  sendOrderReady:           (d) => ipcRenderer.invoke('whatsapp:sendOrderReady', d),
  sendDelivered:            (d) => ipcRenderer.invoke('whatsapp:sendDelivered', d),
  sendDeliveredWithFullPayment: (d) => ipcRenderer.invoke('whatsapp:sendDeliveredWithFullPayment', d),
  sendPartialPayment:       (d) => ipcRenderer.invoke('whatsapp:sendPartialPayment', d),
  sendFullPayment:          (d) => ipcRenderer.invoke('whatsapp:sendFullPayment', d),
  sendReminder:             (d) => ipcRenderer.invoke('whatsapp:sendReminder', d),
  disconnect:               () => ipcRenderer.invoke('whatsapp:disconnect'),

  // ─── إدارة المزوّدين (Multi-Provider) ───────────────────────────────────────
  getProviderSettings: ()    => ipcRenderer.invoke('whatsapp:getSettings'),
  saveProviderSettings: (s)  => ipcRenderer.invoke('whatsapp:saveSettings', s),
  testConnection: (cfg)      => ipcRenderer.invoke('whatsapp:testConnection', cfg),
  getTemplateMap: ()         => ipcRenderer.invoke('whatsapp:getTemplates'),
  saveTemplateMap: (map)     => ipcRenderer.invoke('whatsapp:saveTemplates', map),
  verifyTemplates: (cfg)     => ipcRenderer.invoke('whatsapp:verifyTemplates', cfg),

  // إرسال حر لرقم محدد (for admin report etc.)
  sendMessage:     (phone, msg)              => ipcRenderer.invoke('whatsapp:send', phone, msg),
  sendFile:        (phone, caption, filePath, extraData) => ipcRenderer.invoke('whatsapp:sendFile', phone, caption, filePath, extraData),

  // ─── محادثات الواتساب والـ Webhook ──────────────────────────────────────────
  sendChatMessage: (phone, text)             => ipcRenderer.invoke('whatsapp:sendChatMessage', phone, text),
  getWebhookInfo:  ()                        => ipcRenderer.invoke('whatsapp:getWebhookInfo'),
  restartTunnel:   ()                        => ipcRenderer.invoke('whatsapp:restartTunnel'),
  testWebhookPing: (phone)                   => ipcRenderer.invoke('whatsapp:testWebhookPing', phone),
  deleteConversation: (phone)                => ipcRenderer.invoke('db:deleteWhatsAppConversation', phone),
  deleteMessage: (id)                        => ipcRenderer.invoke('db:deleteWhatsAppMessage', id),

  syncMetaWebhook: (url)                     => ipcRenderer.invoke('whatsapp:syncMetaWebhook', url),

  // جلب التسجيل الصوتي من Meta كـ base64
  fetchAudio:      (mediaId)                 => ipcRenderer.invoke('whatsapp:fetchAudio', mediaId),

  // أحداث واتساب من Main → Renderer
  onQR:           (cb) => ipcRenderer.on('whatsapp:qr',            (_, data)   => cb(data)),
  onReady:        (cb) => ipcRenderer.on('whatsapp:ready',          ()         => cb()),
  onAuthenticated:(cb) => ipcRenderer.on('whatsapp:authenticated',  ()         => cb()),
  onDisconnected: (cb) => ipcRenderer.on('whatsapp:disconnected',   (_, reason)=> cb(reason)),
  onLoading:      (cb) => ipcRenderer.on('whatsapp:loading',        (_, pct)   => cb(pct)),
  onError:        (cb) => ipcRenderer.on('whatsapp:error',          (_, msg)   => cb(msg)),
  onNewMessage:   (cb) => {
    const h = (_, data) => cb(data);
    ipcRenderer.on('whatsapp:new-message', h);
    return () => ipcRenderer.removeListener('whatsapp:new-message', h);
  },
  onStatusUpdate: (cb) => {
    const h = (_, data) => cb(data);
    ipcRenderer.on('whatsapp:status-update', h);
    return () => ipcRenderer.removeListener('whatsapp:status-update', h);
  },
  onTunnelStatus: (cb) => {
    const h = (_, data) => cb(data);
    ipcRenderer.on('whatsapp:tunnel-status', h);
    return () => ipcRenderer.removeListener('whatsapp:tunnel-status', h);
  },
  onMetaSynced:   (cb) => {
    const h = (_, data) => cb(data);
    ipcRenderer.on('whatsapp:meta-synced', h);
    return () => ipcRenderer.removeListener('whatsapp:meta-synced', h);
  },
});

// ─── Activation API ────────────────────────────────────────────────────────────
contextBridge.exposeInMainWorld('activation', {
  getStatus:     ()       => ipcRenderer.invoke('activation:getStatus'),
  activate:      (serial) => ipcRenderer.invoke('activation:activate', serial),
  getHwId:       ()       => ipcRenderer.invoke('activation:getHwId'),
  getInstallId:  ()       => ipcRenderer.invoke('activation:getInstallId'),
});

// ─── Inventory & Stocktake API ─────────────────────────────────────────────────
contextBridge.exposeInMainWorld('inventory', {
  // Items
  list:           (opts)                    => ipcRenderer.invoke('inventory:list', opts),
  update:         (serviceId, fields)       => ipcRenderer.invoke('inventory:update', serviceId, fields),
  restock:        (serviceId, qty, notes)   => ipcRenderer.invoke('inventory:restock', serviceId, qty, notes),
  setQuantity:    (serviceId, qty, notes)   => ipcRenderer.invoke('inventory:setQuantity', serviceId, qty, notes),
  getLowStock:    ()                        => ipcRenderer.invoke('inventory:getLowStock'),
  getMovements:   (serviceId, opts)         => ipcRenderer.invoke('inventory:getMovements', serviceId, opts),
  getLiveReport:  ()                        => ipcRenderer.invoke('inventory:getLiveReport'),
  printBarcodeLabels: (items, copies)       => ipcRenderer.invoke('inventory:printBarcodeLabels', items, copies),

  // Stocktake
  stocktakeStart:      (notes)              => ipcRenderer.invoke('stocktake:start', notes),
  stocktakeSaveCount:  (sessionId, svcId, qty, itemType) => ipcRenderer.invoke('stocktake:saveCount', sessionId, svcId, qty, itemType),
  stocktakeComplete:   (sessionId)          => ipcRenderer.invoke('stocktake:complete', sessionId),
  stocktakeList:       ()                   => ipcRenderer.invoke('stocktake:list'),
  stocktakeGetReport:  (sessionId)          => ipcRenderer.invoke('stocktake:getReport', sessionId),
});

// ─── Recipes & Raw Materials API ──────────────────────────────────────────────
contextBridge.exposeInMainWorld('recipes', {
  getForService:  (serviceId)               => ipcRenderer.invoke('recipes:getForService', serviceId),
  saveForService: (serviceId, items)        => ipcRenderer.invoke('recipes:saveForService', serviceId, items),
});

contextBridge.exposeInMainWorld('rawMaterials', {
  list:        ()                           => ipcRenderer.invoke('rawMaterials:list'),
  save:        (data)                       => ipcRenderer.invoke('rawMaterials:save', data),
  delete:      (id)                         => ipcRenderer.invoke('rawMaterials:delete', id),
  adjustStock: (data)                       => ipcRenderer.invoke('rawMaterials:adjustStock', data),
});

// ─── Service Sizes API ────────────────────────────────────────────────────────
contextBridge.exposeInMainWorld('services', {
  getSizes:    (serviceId)                  => ipcRenderer.invoke('services:getSizes', serviceId),
  getAllSizes: ()                           => ipcRenderer.invoke('services:getAllSizes'),
  saveSizes:   (serviceId, sizesList)       => ipcRenderer.invoke('services:saveSizes', serviceId, sizesList),
});




