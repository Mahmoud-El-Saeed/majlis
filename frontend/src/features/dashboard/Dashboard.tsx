import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { dashboardApi, isContentVisible, type DashboardItem } from "../../api/dashboard";
import { Notice, Page } from "../../components/ui";
import { JoinForm, statusLabel } from "../enrollments/forms";
import { dict, tError, type Lang, type UIText } from "../../i18n";

export function dashboardStatusLabel(t: UIText, status: string): string {
  if (status === "owner") return t.status_owner;
  if (status === "admin") return t.status_admin;
  return statusLabel(t, status);
}

/** Student dashboard (ticket 06): my courses + Join-with-code box, one call. */
export function Dashboard({ lang, token }: { lang: Lang; token: string }) {
  const t = dict[lang];
  const [items, setItems] = useState<DashboardItem[]>([]);
  const [msg, setMsg] = useState("");
  const [joined, setJoined] = useState(0);

  useEffect(() => {
    if (!token) return;
    dashboardApi
      .get(token)
      .then((d) => setItems(d.items))
      .catch((err) =>
        setMsg(err instanceof Error ? tError(lang, err.message) : t.generic_error),
      );
  }, [token, joined]);

  if (!token) {
    return (
      <Page title={t.dashboard_title}>
        <Notice message={t.login_required} />
      </Page>
    );
  }
  const visible = items.filter((i) => isContentVisible(i.enrollment_status));
  const waiting = items.filter((i) => !isContentVisible(i.enrollment_status));

  return (
    <>
      <Page title={t.dashboard_title}>
        <h3>{t.dashboard_my_courses}</h3>
        {visible.length === 0 && waiting.length === 0 ? (
          <Notice message={t.dashboard_empty} />
        ) : null}
        <ul className="card-list">
          {visible.map((i) => (
            <li key={i.course.id} className="card">
              <Link to={`/courses/${i.course.id}`}>
                <strong>{i.course.title}</strong>
              </Link>
              {i.course.book_title ? ` — ${i.course.book_title}` : ""}
              <div className="card-meta">
                {i.lesson_count} {t.dashboard_lessons} · {i.ready_count} {t.dashboard_ready} ·{" "}
                {dashboardStatusLabel(t, i.enrollment_status)}
              </div>
              <Link to={`/courses/${i.course.id}`}>
                {t.dashboard_open} {lang === "ar" ? "←" : "→"}
              </Link>
            </li>
          ))}
        </ul>
        {waiting.map((i) => (
          <div key={i.course.id} className="waiting">
            <strong>
              {i.course.title} — {dashboardStatusLabel(t, i.enrollment_status)}
            </strong>
            {i.enrollment_status === "pending" ? (
              <>
                <div>
                  <strong>{t.dashboard_waiting_title}</strong>
                </div>
                <div>{t.dashboard_waiting_desc}</div>
              </>
            ) : null}
            {i.enrollment_status === "rejected" ? <div>{t.dashboard_rejected_desc}</div> : null}
            {i.enrollment_status === "blocked" ? <div>{t.dashboard_blocked_desc}</div> : null}
          </div>
        ))}
        {msg ? <Notice message={msg} /> : null}
      </Page>
      <Page title={t.enroll_title}>
        <p>{t.dashboard_join_hint}</p>
      </Page>
      <JoinForm lang={lang} token={token} onJoined={() => setJoined((n) => n + 1)} />
    </>
  );
}
