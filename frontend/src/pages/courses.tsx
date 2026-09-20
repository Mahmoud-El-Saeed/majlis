import { CourseCreateForm, CourseEditForm, CourseList } from "../features/courses/forms";
import type { Lang } from "../i18n";

/** Thin route shells (architecture §4 pages/). Logic lives in features/courses. */

export function CoursesPage({ lang, token }: { lang: Lang; token: string }) {
  return (
    <>
      <CourseCreateForm lang={lang} token={token} />
      <CourseEditForm lang={lang} token={token} />
      <CourseList lang={lang} token={token} />
    </>
  );
}
