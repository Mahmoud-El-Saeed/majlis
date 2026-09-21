import { Dashboard } from "../features/dashboard/Dashboard";
import type { Lang } from "../i18n";

/** Thin route shell. Logic lives in features/dashboard. */
export function DashboardPage({ lang, token }: { lang: Lang; token: string }) {
  return <Dashboard lang={lang} token={token} />;
}
