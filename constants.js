'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
//  ثوابت النظام — constants.js
//  نظام إدارة الكافيه والمطعم والكاشير (CafePro POS & Restaurant System)
//  تُستخدم في backend و frontend (عبر preload)
// ═══════════════════════════════════════════════════════════════════════════════

const ROLES = {
  ADMIN: 'admin',
  CASHIER: 'cashier',
};

const SHIFT_STATUS = {
  OPEN: 'مفتوح',
  CLOSED: 'مغلق',
};

const INVOICE_STATUS = {
  OPEN: 'مفتوحة',                   // بديل 'تحت الشغل'
  SENT_TO_KITCHEN: 'مرسلة للمطبخ',  // بديل 'جاهز للاستلام'
  CLOSED: 'محاسَبة',                 // بديل 'تم التسليم'
  RETURNED: 'مرتجع',
  // Backward compatibility aliases
  IN_PROGRESS: 'مفتوحة',
  READY: 'مرسلة للمطبخ',
  DELIVERED: 'محاسَبة',
};

const TREASURY_TYPES = {
  CASH: 'الخزينة',
  VODAFONE: 'فودافون كاش',
  INSTAPAY: 'إنستا باي',
  VISA: 'فيزا',
};

const ENTRY_TYPES = {
  INCOME: 'إيراد',
  EXPENSE: 'مصروف',
};

const PAYMENT_METHODS = {
  CASH: 'نقدي',
  VODAFONE: 'فودافون كاش',
  INSTAPAY: 'إنستا باي',
  VISA: 'فيزا',
  DEFERRED: 'آجل',
};

const EMPLOYEE_TYPES = {
  MANAGER: 'مدير',
  CASHIER: 'كاشير',
  SELLER: 'بائع',
  DRIVER: 'دليفري',
  WAITER: 'ويتر / صالة',
  CHEF: 'شيف / مطبخ',
};

const SALARY_TYPES = {
  FIXED: 'ثابت',
  COMMISSION: 'عمولة',
  MIXED: 'مختلط',
};

const TABLE_STATUS = {
  EMPTY: 'فاضية',
  OCCUPIED: 'مشغولة',
  RESERVED: 'محجوزة',
};

const ORDER_TYPES = {
  DINE_IN: 'صالة',
  TAKEAWAY: 'تيك أواي',
  DELIVERY: 'دليفري',
};

const DELIVERY_STATUS = {
  PREPARING: 'قيد التجهيز',
  ON_THE_WAY: 'مع الدليفري',
  DELIVERED: 'تم التسليم',
  RETURNED: 'مرتجع',
};

module.exports = {
  ROLES,
  SHIFT_STATUS,
  INVOICE_STATUS,
  TREASURY_TYPES,
  ENTRY_TYPES,
  PAYMENT_METHODS,
  EMPLOYEE_TYPES,
  SALARY_TYPES,
  TABLE_STATUS,
  ORDER_TYPES,
  DELIVERY_STATUS,
};
