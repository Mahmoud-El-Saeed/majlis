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
  joinWithCode: 'انضم برمز السلسلة',
  joinPlaceholder: 'أدخل رمز السلسلة',
  join: 'انضم',
  myCourses: 'سلاسلي',
  pendingWait: 'طلبك بانتظار مراجعة الشيخ',
  lessons: 'الدروس',
  exams: 'الاختبارات',
  lessonExam: 'اختبار الدرس',
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
  // Ticket 16 backend messages.
  kindFixed: 'نوع السلسلة ثابت منذ الإنشاء — لا يمكن تغيير الكتاب',
  pagesBookOnly: 'الصفحات لسلسلة الكتاب فقط',
  badFormat: 'صيغة غير مدعومة — المسموح مذكور في الرسالة',
  fileTooLarge: 'الملف كبير (أقصى 100MB) — يفضل ضغطه ثم إعادة المحاولة',
  mainBookOnly: 'الكتاب الأساسي لسلسلة الكتاب فقط',
  invalidCredentials: 'البريد أو كلمة المرور غير صحيحة — تحقق وحاول مجددًا',
  unverifiedLogin: 'حسابك غير مفعّل — فعّله من الرابط في بريدك',
  accountDisabled: 'الحساب موقوف — تواصل مع الإدارة',
  emailRegistered: 'هذا البريد مسجل بالفعل — سجّل الدخول',
  search: 'بحث',
  clearSearch: 'مسح البحث',
  noResults: 'لا نتائج مطابقة',
  resultCount: 'عدد النتائج',
  itemNumber: 'رقم',
  lessonNumber: 'الدرس رقم',
  // Ticket 17 tactile strings.
  saveIdle: 'حفظ',
  saveBusy: 'جارٍ الحفظ…',
  saveDone: 'تم الحفظ',
  holdHint: 'اضغط مطولًا للتأكيد',
  // Ticket 19: the hold button's idle label now names the hold explicitly
  // (`اضغط مطولًا — {label}`) so a plain click rolling back is unmissable.
  holdConfirmLabel: (label: string): string => `اضغط مطولًا — ${label}`,
  holding: 'استمر بالضغط…',
  holdDone: 'تم التنفيذ',
  undoAutoClose: 'تُغلق هذه الرسالة تلقائيًا خلال ٥ ثوانٍ',
  cancel: 'إلغاء',
  dropHint: 'اسحب الملف هنا أو انقر للاختيار',
  chosenFile: 'الملف المختار:',
  pdfFileLabel: 'ملف PDF (أقصى 100MB)',
  ok: 'حسنًا',
  createLesson: 'إنشاء الدرس',
  creatingLesson: 'جارٍ الإنشاء…',
  // Ticket 18 auth hardening.
  missingFields: 'يرجى ملء جميع الحقول المطلوبة',
  passwordMin: 'كلمة المرور 8 أحرف على الأقل',
  passwordMismatch: 'كلمتا المرور غير متطابقتين',
  confirmPassword: 'تأكيد كلمة المرور',
  tokenReadonlyHint: 'رمز الدعوة من الرابط — لا حاجة لتعديله',
  pwStrength: 'قوة كلمة المرور',
  pwWeak: 'ضعيفة',
  pwFair: 'متوسطة',
  pwGood: 'جيدة',
  pwStrong: 'قوية',
  pwTip: 'استخدم 12+ حرفًا مع كبير وصغير وأرقام ورموز',
  upload: 'رفع',
  uploadingNow: 'جارٍ الرفع…',
  uploadDone: 'تم الرفع',
  addAndUpload: 'إضافة ورفع',
  // Ticket 19 cassette volume.
  volume: 'مستوى الصوت',
  mute: 'كتم الصوت',
  unmute: 'إلغاء الكتم',
  formatPages: (from: string, to: string): string => `صفحات ${from} – ${to}`,
  // Ticket 19 codes repair: generate-form knobs + unblock-restore message.
  // Server defaults (50 uses / 7 days from CODE_DEFAULT_* in config.py) are
  // NOT exposed by any endpoint, so the placeholders below hardcode them —
  // update here if the backend defaults ever change.
  codeMaxUses: 'الحد الأقصى للاستخدامات',
  codeExpiryDays: 'مدة الصلاحية (بالأيام)',
  codeGenerateHint: 'فارغ = الافتراضي (50 استخدامًا، 7 أيام) — 0 أيام يعني منتهيًا فورًا',
  codeUsesInvalid: 'عدد الاستخدامات: عدد صحيح من 1 إلى 1000',
  codeDaysInvalid: 'عدد الأيام: عدد صحيح من 0 إلى 365',
  unblockRestores: (name: string): string =>
    `سيستعيد «${name}» وصوله السابق فورًا دون الحاجة لرمز جديد.`,
  // Ticket 19 lesson-manage redesign (LESSON-MANAGE stream): collapsible
  // info form + audio summary + attachment cards. Values match the
  // previously hardcoded Arabic so UI text stays byte-identical.
  expandInfo: 'توسيع بيانات الدرس',
  collapseInfo: 'طي بيانات الدرس',
  openFile: 'فتح',
  replaceFile: 'استبدال',
  deleteFile: 'حذف',
} as const

// Backend English detail → Arabic UI message (pass-through fallback keeps English).
const detailMap: Array<[RegExp, string]> = [
  [/too many requests/i, str.tooMany],
  [/incorrect email or password/i, str.invalidCredentials],
  [/verify your email/i, str.unverifiedLogin],
  [/account disabled/i, str.accountDisabled],
  [/already registered/i, str.emailRegistered],
  [/not authenticated|invalid.*token|expired/i, str.unauthorized],
  [/not (a )?member|forbidden|not enrolled/i, str.forbidden],
  [/not found/i, str.notFound],
  [/keeps its book|cannot gain a book/i, str.kindFixed],
  [/only allowed on book-based courses/i, str.pagesBookOnly],
  [/attachments are supported/i, str.badFormat],
  [/too large/i, str.fileTooLarge],
  [/have a main book/i, str.mainBookOnly],
]

export function localizeDetail(detail: string): string {
  for (const [re, ar] of detailMap) {
    if (re.test(detail)) return ar
  }
  return 'تعذّر — حاول مجددًا'
}
