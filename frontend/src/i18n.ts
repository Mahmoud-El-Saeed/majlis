// Arabic-first strings. Backend messages stay English; map them here.
// RTL only — codes/numbers/timers use dir="ltr" inline in components.
import details from './i18n/details.json'

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
  // The last resort when the backend sent something we do not know. It never
  // says "try again": an unknown failure is not necessarily retryable, and a
  // retry hint on a deterministic failure sends the user in circles.
  unexpectedError: 'تعذّر إتمام الطلب',
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
  // Ticket 20: the exam-taking flow (intro card, recovery, history). Shared
  // by the course exam card, the exam page and the attempts history page.
  resumeExam: 'متابعة الاختبار',
  enterExam: 'دخول الاختبار',
  myAttempts: 'محاولاتي',
  inProgress: 'قيد الأداء',
  submitted: 'تم التسليم',
  awaitingGrading: 'بانتظار التصحيح',
  awaitingPublish: 'بانتظار النشر',
  noAttempts: 'لا توجد محاولات بعد',
  backToCourse: 'عودة إلى السلسلة',
  examNotFound: 'الاختبار غير موجود',
  examNoDescription: 'لا يوجد وصف لهذا الاختبار',
  loadingExam: 'جار تحميل الاختبار',
  resume: 'متابعة',
  attemptsExhausted: 'نفدت محاولاتك',
  startAttempt: 'بدء المحاولة',
  // Ticket 20: the states around the exam card.
  examLoadFailed: 'تعذّر تحميل الاختبار',
  examNotOpenYet: 'لم يبدأ الاختبار بعد',
  examWindowClosed: 'انتهى وقت الاختبار',
  examStartFailed: 'تعذّر بدء المحاولة',
  examSubmitFailed: 'تعذّر التسليم',
  examAttemptsFailed: 'تعذّر تحميل المحاولات',
  examAutosaveFailed: 'تعذّر الحفظ التلقائي — ستُحفظ إجاباتك عند التسليم',
  examScore: (score: number | string, max: number | string): string => `الدرجة ${score} / ${max}`,
  // Ticket 20: labels that used to be inline in the exam page.
  examDurationLabel: 'المدة',
  examQuestionsLabel: 'الأسئلة',
  examYourAttemptsLabel: 'محاولاتك',
  examMinutesUnit: 'دقيقة',
  examTrue: 'صح',
  examFalse: 'خطأ',
  examReview: 'مراجعة',
  examAnswerPrompt: (max: number | string): string => `إجابتك (الدرجة العظمى ${max})`,
  examTeacherNote: 'ملاحظة المعلم:',
  examConfirmTitle: 'تأكيد التسليم',
  examConfirmBody: 'لن تتمكن من التعديل بعد التسليم — راجع إجاباتك أولًا.',
  examConfirmSubmit: 'تأكيد التسليم',
  examTimeLeft: 'الوقت المتبقي',
  examTimeUp: 'انتهى وقت المحاولة — لم يعد التعديل ممكنًا',
} as const

// --- Error copy -------------------------------------------------------------
//
// The backend answers in English (AGENTS.md) and the UI shows Arabic. The
// mapping lives in details.json: one entry per detail the backend can send,
// carrying the Arabic the user reads. `ar: null` means the English passes
// through on purpose, with a note saying why.
//
// details.json is the contract between the two packages:
// backend/tests/test_error_details_contract.py fails when a service raises a
// detail that has no entry here, so a new error can never ship untranslated.

type CatalogEntry = {
  id: string
  detail?: string
  pattern?: string
  sample?: string
  ar: string | null
  note?: string
  framework?: boolean
}

const catalog = details.entries as CatalogEntry[]

const matchers = catalog.map((entry) => ({
  entry,
  matches: entry.detail
    ? (detail: string) => detail === entry.detail
    : (detail: string) => new RegExp(entry.pattern as string).test(detail),
}))

function localizeOne(detail: string): string {
  for (const { entry, matches } of matchers) {
    if (matches(detail)) return entry.ar ?? detail
  }
  return str.unexpectedError
}

/**
 * The Arabic message for a backend error detail.
 *
 * A 422 carries one validation message per field; the transport joins them
 * with newlines and each is translated on its own.
 */
export function localizeDetail(detail: string): string {
  const lines = detail.split('\n')
  if (lines.length > 1) return lines.map(localizeOne).join('، ')
  return localizeOne(detail)
}

// The exam seams answer in English and the SERVER knows who the caller is,
// so the message is picked from the detail instead of re-deriving the writer
// rule in the browser. A writer (ADR-0007) is told to use the preview; anyone
// else is told they are not enrolled.
export function localizeExamError(detail: string): string {
  if (/not authorized/i.test(detail)) return localizeDetail('Not enrolled in this course.')
  return localizeDetail(detail)
}
