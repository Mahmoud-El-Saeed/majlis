import { LoginForm, ResetForm, SignupForm, VerifyForm } from "../features/auth/forms";
import type { Lang } from "../i18n";

/** Thin route shells (architecture §4 pages/). Logic lives in features/auth. */

export function SignupPage({ lang }: { lang: Lang }) {
  return <SignupForm lang={lang} />;
}

export function LoginPage({ lang, onToken }: { lang: Lang; onToken: (t: string) => void }) {
  return <LoginForm lang={lang} onToken={onToken} />;
}

export function VerifyPage({ lang }: { lang: Lang }) {
  return <VerifyForm lang={lang} />;
}

export function ResetPage({ lang }: { lang: Lang }) {
  return <ResetForm lang={lang} />;
}
