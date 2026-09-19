export type Lang = "ar" | "en";

const ar = {
  nav_signup: "حساب جديد",
  nav_login: "دخول",
  nav_verify: "تفعيل",
  nav_reset: "استعادة",
  language_toggle: "English",
  signup_title: "مجلس — إنشاء حساب طالب",
  login_title: "مجلس — تسجيل الدخول",
  verify_title: "تفعيل الحساب",
  reset_title: "استعادة كلمة المرور",
  reset_confirm_title: "تعيين كلمة مرور جديدة",
  email: "البريد",
  password: "كلمة المرور",
  password_with_min: "كلمة المرور (8+)",
  new_password: "كلمة المرور الجديدة (8+)",
  reset_token: "رمز الاستعادة",
  signup_submit: "إنشاء الحساب",
  login_submit: "دخول",
  verify_submit: "فعّل حسابي",
  reset_submit: "إرسال رابط الاستعادة",
  reset_confirm_submit: "تغيير كلمة المرور",
  email_placeholder: "بريدك",
  signup_success: "تم إنشاء الحساب. تحقق من بريدك للتفعيل.",
  login_success: "تم الدخول بنجاح.",
  verify_success: "تم التفعيل. يمكنك تسجيل الدخول.",
  reset_success: "إذا كان البريد مسجلًا ستصلك رسالة استعادة.",
  reset_confirm_success: "تم تغيير كلمة المرور. سجل الدخول مجددًا.",
  generic_error: "خطأ",
};

const en: typeof ar = {
  nav_signup: "Sign up",
  nav_login: "Log in",
  nav_verify: "Verify",
  nav_reset: "Reset",
  language_toggle: "العربية",
  signup_title: "Majlis — Create student account",
  login_title: "Majlis — Log in",
  verify_title: "Activate account",
  reset_title: "Reset password",
  reset_confirm_title: "Set a new password",
  email: "Email",
  password: "Password",
  password_with_min: "Password (8+)",
  new_password: "New password (8+)",
  reset_token: "Reset token",
  signup_submit: "Create account",
  login_submit: "Log in",
  verify_submit: "Activate my account",
  reset_submit: "Send reset link",
  reset_confirm_submit: "Change password",
  email_placeholder: "Your email",
  signup_success: "Account created. Check your email to activate.",
  login_success: "Logged in successfully.",
  verify_success: "Activated. You can now log in.",
  reset_success: "If the email is registered, you will receive a reset message.",
  reset_confirm_success: "Password changed. Please log in again.",
  generic_error: "Error",
};

export const dict: Record<Lang, typeof ar> = { ar, en };

export type UIText = (typeof dict)["ar"];

/** Backend speaks English only. Map known API details to the UI language
 *  (Arabic-first: default `ar`). Unknown messages pass through untouched. */
const backendErrors: Record<string, { ar: string; en: string }> = {
  "Email already registered.": {
    ar: "هذا البريد مسجل بالفعل.",
    en: "Email already registered.",
  },
  "Invalid or expired activation link.": {
    ar: "رابط التفعيل غير صالح أو منتهي.",
    en: "Invalid or expired activation link.",
  },
  "Incorrect email or password.": {
    ar: "بيانات الدخول غير صحيحة.",
    en: "Incorrect email or password.",
  },
  "Account disabled.": { ar: "الحساب موقوف.", en: "Account disabled." },
  "Please verify your email before logging in.": {
    ar: "فعّل حسابك عبر البريد قبل تسجيل الدخول.",
    en: "Please verify your email before logging in.",
  },
  "Session expired. Please log in again.": {
    ar: "جلسة منتهية. سجل الدخول مجددًا.",
    en: "Session expired. Please log in again.",
  },
  "Invalid or expired reset link.": {
    ar: "رابط الاستعادة غير صالح أو منتهي.",
    en: "Invalid or expired reset link.",
  },
  "Failed to send activation email.": {
    ar: "تعذر إرسال بريد التفعيل.",
    en: "Failed to send activation email.",
  },
  "Could not validate session.": {
    ar: "تعذر التحقق من الجلسة.",
    en: "Could not validate session.",
  },
  "Too many requests. Try again in a minute.": {
    ar: "طلبات كثيرة جدًا. حاول مرة أخرى بعد دقيقة.",
    en: "Too many requests. Try again in a minute.",
  },
};

export function tError(lang: Lang, detail: string): string {
  return backendErrors[detail]?.[lang] ?? detail;
}

export function dirFor(lang: Lang): "rtl" | "ltr" {
  return lang === "ar" ? "rtl" : "ltr";
}
