import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { authApi } from "../api/auth";
import { coursesApi, type Course } from "../api/courses";
import { isContentVisible } from "../api/dashboard";
import { enrollmentsApi } from "../api/enrollments";
import { lessonsApi, type LessonSummary } from "../api/lessons";
import { Notice, Page } from "../components/ui";
import { dashboardStatusLabel } from "../features/dashboard/Dashboard";
import { dict, tError, type Lang } from "../i18n";

/** Thin route shell: one course + its lessons.
 *  Scoped calls only (course + my-enrollment + me, then lessons): no
 *  full-list fetch to render one course. The backend stays the gate —
 *  lessons load only once the relation resolves as content-visible. */
export function CourseDetailPage({ lang, token }: { lang: Lang; token: string }) {
  const t = dict[lang];
  const { id } = useParams();
  const [course, setCourse] = useState<Course | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [lessons, setLessons] = useState<LessonSummary[]>([]);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!token || !id) return;
    Promise.all([
      coursesApi.get(token, id),
      enrollmentsApi.myEnrollment(token, id),
      authApi.me(token),
    ])
      .then(([c, enrollment, me]) => {
        setCourse(c);
        if (enrollment) {
          setStatus(enrollment.status);
        } else if (me.role === "admin") {
          setStatus("admin");
        } else {
          // No enrollment row on a viewable course means the caller owns it
          // (the backend 403s everyone else before we get here).
          setStatus("owner");
        }
      })
      .catch((err) => setMsg(err instanceof Error ? tError(lang, err.message) : t.generic_error));
  }, [token, id]);

  useEffect(() => {
    if (!token || !id || status === null || !isContentVisible(status)) return;
    lessonsApi
      .list(token, id)
      .then(setLessons)
      .catch((err) => setMsg(err instanceof Error ? tError(lang, err.message) : t.generic_error));
  }, [token, id, status]);

  if (!token) {
    return (
      <Page title={t.course_detail_lessons}>
        <Notice message={t.login_required} />
      </Page>
    );
  }
  if (!course || status === null) {
    return (
      <Page title={t.course_detail_lessons}>{msg ? <Notice message={msg} /> : null}</Page>
    );
  }
  const gated = !isContentVisible(status);

  return (
    <Page title={course.title}>
      {course.book_title ? <div>{course.book_title}</div> : null}
      {course.description ? <p>{course.description}</p> : null}
      <div>{dashboardStatusLabel(t, status)}</div>
      {gated ? (
        <>
          <div>
            <strong>{t.dashboard_waiting_title}</strong>
          </div>
          <div>
            {status === "rejected"
              ? t.dashboard_rejected_desc
              : status === "blocked"
                ? t.dashboard_blocked_desc
                : t.dashboard_waiting_desc}
          </div>
        </>
      ) : (
        <>
          <h3>{t.course_detail_lessons}</h3>
          <ul className="card-list">
            {lessons.map((l) => (
              <li key={l.id} className="card">
                <Link to={`/lessons/${l.id}`}>
                  <strong>{l.title}</strong>
                </Link>{" "}
                {l.pages_from ?? ""}–{l.pages_to ?? ""} [{l.status}]
                {l.attachment_count ? ` · PDF: ${l.attachment_count}` : ""}
              </li>
            ))}
          </ul>
          {lessons.length === 0 ? <Notice message={t.course_detail_empty} /> : null}
        </>
      )}
      {msg ? <Notice message={msg} /> : null}
    </Page>
  );
}
