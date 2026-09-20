import { CourseCreateForm, CourseEditForm, CourseList } from "../features/courses/forms";
import { JoinForm, MyEnrollments } from "../features/enrollments/forms";
import type { Lang } from "../i18n";

/** Thin route shells (architecture §4 pages/). Logic lives in features/courses. */

export function CoursesPage({ lang, token }: { lang: Lang; token: string }) {
  return (
    <>
      <CourseList lang={lang} token={token} />
      <MyEnrollments lang={lang} token={token} />
      <JoinForm lang={lang} token={token} />
      <CourseCreateForm lang={lang} token={token} />
      <CourseEditForm lang={lang} token={token} />
    </>
  );
}
