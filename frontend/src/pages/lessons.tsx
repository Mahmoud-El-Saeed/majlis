import { useState } from "react";
import {
  LessonAudioUpload,
  LessonCreateForm,
  LessonEditForm,
  LessonList,
  LessonPlayer,
} from "../features/lessons/forms";
import { TextField } from "../components/ui";
import { dict, type Lang } from "../i18n";

/** Thin route shells (architecture §4 pages/). Logic lives in features/lessons. */

export function LessonsPage({
  lang,
  token,
}: {
  lang: Lang;
  token: string;
}) {
  const t = dict[lang];
  const [courseId, setCourseId] = useState("");
  const [lessonId, setLessonId] = useState("");
  return (
    <>
      <div style={{ maxWidth: 420, margin: "0 auto", padding: "0 16px" }}>
        <TextField label={t.lesson_course_id} value={courseId} onChange={(e) => setCourseId(e.target.value)} />
        <TextField label={t.lesson_id} value={lessonId} onChange={(e) => setLessonId(e.target.value)} />
      </div>
      {courseId ? (
        <>
          <LessonCreateForm lang={lang} token={token} courseId={courseId} />
          <LessonList lang={lang} token={token} courseId={courseId} />
        </>
      ) : null}
      <LessonEditForm lang={lang} token={token} />
      {lessonId && token ? (
        <>
          <LessonAudioUpload lang={lang} token={token} lessonId={lessonId} />
          <LessonPlayer lang={lang} token={token} lessonId={lessonId} />
        </>
      ) : null}
    </>
  );
}
