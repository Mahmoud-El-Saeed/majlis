import { InviteAcceptForm, InviteCreateForm } from "../features/invites/forms";
import type { Lang } from "../i18n";

/** Thin route shells (architecture §4 pages/). Logic lives in features/invites. */

export function InviteCreatePage({ lang, token }: { lang: Lang; token: string }) {
  return <InviteCreateForm lang={lang} token={token} />;
}

export function InviteAcceptPage({ lang }: { lang: Lang }) {
  return <InviteAcceptForm lang={lang} />;
}
