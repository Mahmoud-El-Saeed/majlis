// Arabic-first strings. Backend messages stay English; map them here.
// RTL only — codes/numbers/timers use dir="ltr" inline in components.

export const str = {
  appName: 'مجلس',
  tagline: 'الحلقة الخاصة',
  night: 'ليلي',
  day: 'نهاري',
  login: 'تسجيل الدخول',
  signup: 'حساب جديد',
  logout: 'خروج',
  email: 'البريد الإلكتروني',
  password: 'كلمة المرور',
  fullName: 'الاسم الكامل',
  verify: 'تفعيل الحساب',
  reset: 'استعادة كلمة المرور',
  joinWithCode: 'انضم برمز الكتاب',
  joinPlaceholder: 'أدخل رمز الكتاب',
  join: 'انضم',
  myCourses: 'كتبي',
  pendingWait: 'طلبك بانتظار مراجعة الشيخ',
  lessons: 'الدروس',
  exams: 'الاختبارات',
  gradebook: 'سجل الدرجات',
  chat: 'المحادثة',
  vault: 'مخزن المفاتيح',
  admin: 'الإدارة',
  teacher: 'المعلم',
  student: 'الطالب',
  approve: 'قبول',
  reject: 'رفض',
  block: 'حظر',
  unblock: 'فك الحظر',
  copyOnce: 'انسخ الرمز الآن — لن يظهر مجددًا',
  copy: 'نسخ',
  copied: 'تم النسخ',
  retry: 'إعادة المحاولة',
  retryFreshUrl: 'رابط جديد وإعادة المحاولة',
  play: 'تشغيل',
  pause: 'إيقاف مؤقت',
  submit: 'تسليم',
  publish: 'نشر',
  exportCsv: 'تصدير CSV',
  tooMany: 'طلبات كثيرة — حاول مجددًا بعد قليل',
  busy: 'الذكاء الاصطناعي مشغول — حاول لاحقًا',
  quota: 'الاستعلامات اليومية',
  refused: 'لم يُشرح في الدروس',
  citation: 'الاستشهاد',
  stubNote: 'واجهة تجريبية — تُفعّل بعد بناء الواجهة الخلفية',
  notFound: 'غير موجود (404)',
  forbidden: 'لا صلاحية (403)',
  unauthorized: 'سجّل الدخول أولًا (401)',
} as const

// Backend English detail → Arabic UI message (pass-through fallback keeps English).
const detailMap: Array<[RegExp, string]> = [
  [/too many requests/i, str.tooMany],
  [/not authenticated|invalid.*token|expired/i, str.unauthorized],
  [/not (a )?member|forbidden|not enrolled/i, str.forbidden],
  [/not found/i, str.notFound],
]

export function localizeDetail(detail: string): string {
  for (const [re, ar] of detailMap) {
    if (re.test(detail)) return ar
  }
  return detail
}
