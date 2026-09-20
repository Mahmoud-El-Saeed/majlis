import { CodesPanel, JoinForm, MyEnrollments, QueuePanel } from "../features/enrollments/forms";
import type { Lang } from "../i18n";

/** Thin route shells (architecture §4 pages/). Logic lives in features/enrollments. */

export function EnrollmentsPage({ lang, token }: { lang: Lang; token: string }) {
  return (
    <>
      <JoinForm lang={lang} token={token} />
      <MyEnrollments lang={lang} token={token} />
      <CodesPanel lang={lang} token={token} />
      <QueuePanel lang={lang} token={token} />
    </>
  );
}
