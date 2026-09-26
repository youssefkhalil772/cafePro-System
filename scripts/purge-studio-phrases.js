const fs = require('fs');
const path = require('path');

const replacements = [
  {
    file: 'renderer/activation.html',
    from: '<title>نظام إدارة استوديو التصوير — تفعيل النظام</title>',
    to: '<title>CafePro POS — تفعيل النظام</title>'
  },
  {
    file: 'renderer/activation.html',
    from: '<div class="shop-name" id="shopNameDisplay">استوديو التصوير</div>',
    to: '<div class="shop-name" id="shopNameDisplay">كافيه ومطعم برو</div>'
  },
  {
    file: 'renderer/activation.html',
    from: "'استوديو التصوير'",
    to: "'كافيه ومطعم برو'"
  },
  {
    file: 'renderer/customers.html',
    from: '<title>نظام إدارة استوديو التصوير — إدارة العملاء</title>',
    to: '<title>CafePro POS — إدارة العملاء</title>'
  },
  {
    file: 'renderer/daily-report.html',
    from: '<title>نظام إدارة استوديو التصوير — التقرير اليومي الشامل</title>',
    to: '<title>CafePro POS — التقرير اليومي الشامل</title>'
  },
  {
    file: 'renderer/daily-report.html',
    from: 'تقرير مُصدَّر بواسطة نظام إدارة استوديو التصوير — Photography Studio System',
    to: 'تقرير مُصدَّر بواسطة نظام كافيه برو — CafePro POS System'
  },
  {
    file: 'renderer/finance.html',
    from: '<title>نظام إدارة استوديو التصوير — الحسابات والمالية</title>',
    to: '<title>CafePro POS — الحسابات والمالية</title>'
  },
  {
    file: 'renderer/returns.html',
    from: '<title>نظام إدارة استوديو التصوير — المرتجعات</title>',
    to: '<title>CafePro POS — المرتجعات</title>'
  },
  {
    file: 'renderer/start-shift.html',
    from: '<title>استوديو التصوير — بدء الشيفت</title>',
    to: '<title>CafePro POS — بدء الشيفت</title>'
  },
  {
    file: 'renderer/whatsapp-chat.html',
    from: '<title>نظام إدارة استوديو التصوير — محادثات الواتساب</title>',
    to: '<title>CafePro POS — محادثات الواتساب</title>'
  },
  {
    file: 'renderer/whatsapp-chat.html',
    from: '<div class="logo-text">استوديو التصوير</div>',
    to: '<div class="logo-text">كافيه ومطعم برو</div>'
  },
  {
    file: 'renderer/login.html',
    from: 'يرجى إدخال كود التفعيل للمتابعة واستخدام الاستوديو.',
    to: 'يرجى إدخال كود التفعيل للمتابعة واستخدام نظام كافيه برو.'
  },
  {
    file: 'renderer/settings.html',
    from: '<div id="sidebarShopName" style="font-weight:700; color:rgba(255,255,255,0.7);">استوديو التصوير</div>',
    to: '<div id="sidebarShopName" style="font-weight:700; color:rgba(255,255,255,0.7);">كافيه ومطعم برو</div>'
  },
  {
    file: 'renderer/js/daily-report.js',
    from: "'استوديو التصوير'",
    to: "'كافيه ومطعم برو'",
    all: true
  },
  {
    file: 'renderer/js/finance.js',
    from: 'Photography Studio System — نظام إدارة استوديو التصوير',
    to: 'CafePro System — نظام كافيه ومطعم برو'
  },
  {
    file: 'renderer/js/finance.js',
    from: 'طُبع من نظام إدارة استوديو التصوير',
    to: 'طُبع من نظام كافيه برو'
  },
  {
    file: 'renderer/js/finance.js',
    from: '<div class="center bold" style="font-size:18px;margin-bottom:3px;">استوديو التصوير</div>',
    to: '<div class="center bold" style="font-size:18px;margin-bottom:3px;">كافيه ومطعم برو</div>'
  },
  {
    file: 'renderer/js/finance.js',
    from: 'نظام إدارة استوديو التصوير',
    to: 'نظام كافيه ومطعم برو',
    all: true
  },
  {
    file: 'renderer/js/hr.js',
    from: "'استوديو التصوير'",
    to: "'كافيه ومطعم برو'",
    all: true
  },
  {
    file: 'renderer/js/hr.js',
    from: 'نظام إدارة استوديو التصوير',
    to: 'نظام كافيه برو',
    all: true
  },
  {
    file: 'renderer/js/pos-invoice.js',
    from: "'استوديو التصوير'",
    to: "'كافيه ومطعم برو'",
    all: true
  },
  {
    file: 'renderer/js/shared/common.js',
    from: "'استوديو التصوير'",
    to: "'كافيه ومطعم برو'",
    all: true
  },
  {
    file: 'renderer/js/shared/common.js',
    from: "'استوديو التصوير الملكي'",
    to: "'كافيه ومطعم برو'",
    all: true
  }
];

for (const r of replacements) {
  const filePath = path.join(__dirname, '..', r.file);
  if (!fs.existsSync(filePath)) continue;
  let content = fs.readFileSync(filePath, 'utf8');
  if (r.all) {
    content = content.split(r.from).join(r.to);
  } else {
    content = content.replace(r.from, r.to);
  }
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Updated ${r.file}`);
}
console.log('All studio phrases purged successfully!');
