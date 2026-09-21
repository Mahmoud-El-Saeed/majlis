import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { lessonsApi, type Lesson } from "../api/lessons";
import { Notice, Page } from "../components/ui";
import { AttachmentList } from "../features/attachments/forms";
import { dict, tError, type Lang } from "../i18n";

/** Thin route shell: audio-only lesson view (ticket 06).
 *  Auto-loads detail + playback URL on mount; Range streaming is native to
 *  the browser audio element (bytes go browser -> R2 directly). */
export function LessonDetailPage({ lang, token }: { lang: Lang; token: string }) {
  const t = dict[lang];
  const { id } = useParams();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [src, setSrc] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!token || !id) return;
    lessonsApi
      .get(token, id)
      .then((l) => {
        setLesson(l);
        if (l.status === "ready") {
          lessonsApi
            .playUrl(token, id)
            .then((p) => setSrc(p.playback_url))
            .catch((err) =>
              setMsg(err instanceof Error ? tError(lang, err.message) : t.generic_error),
            );
        }
      })
      .catch((err) =>
        setMsg(err instanceof Error ? tError(lang, err.message) : t.generic_error),
      );
  }, [token, id]);

  if (!token) {
    return (
      <Page title={t.lesson_play_title}>
        <Notice message={t.login_required} />
      </Page>
    );
  }
  if (!lesson) {
    return <Page title={t.lesson_play_title}>{msg ? <Notice message={msg} /> : null}</Page>;
  }
  return (
    <>
      <Page title={lesson.title}>
        {(lesson.pages_from ?? lesson.pages_to) ? (
          <div>
            {t.lesson_detail_pages}: {lesson.pages_from ?? ""}–{lesson.pages_to ?? ""}
          </div>
        ) : null}
        <h3>{t.lesson_detail_audio}</h3>
        {lesson.status !== "ready" ? (
          <Notice message={t.lesson_not_ready} />
        ) : src ? (
          <audio controls preload="metadata" src={src} />
        ) : (
          <Notice message={t.lesson_uploading} />
        )}
        {msg ? <Notice message={msg} /> : null}
      </Page>
      <AttachmentList
        lang={lang}
        token={token}
        courseId={lesson.course_id}
        lessonId={lesson.id}
        manage={lesson.can_manage}
      />
    </>
  );
}
