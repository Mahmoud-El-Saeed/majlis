import { useState } from "react";
import {
  LessonAudioUpload,
  LessonCreateForm,
  LessonEditForm,
  LessonList,
  LessonPlayer,
} from "../features/lessons/forms";
import { AttachmentCreateForm, AttachmentList } from "../features/attachments/forms";
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
  const [attachmentsTick, setAttachmentsTick] = useState(0);
  const [lessonsTick, setLessonsTick] = useState(0);
  return (
    <>
      <div className="page-narrow">
        <TextField label={t.lesson_course_id} value={courseId} onChange={(e) => setCourseId(e.target.value)} />
        <TextField label={t.lesson_id} value={lessonId} onChange={(e) => setLessonId(e.target.value)} />
      </div>
      {courseId ? (
        <>
          <LessonCreateForm
            lang={lang}
            token={token}
            courseId={courseId}
            onCreated={() => setLessonsTick((n) => n + 1)}
          />
          <LessonList lang={lang} token={token} courseId={courseId} refreshKey={lessonsTick} />
        </>
      ) : null}
      <LessonEditForm lang={lang} token={token} />
      {lessonId && token ? (
        <>
          <LessonAudioUpload lang={lang} token={token} lessonId={lessonId} />
          <LessonPlayer lang={lang} token={token} lessonId={lessonId} />
          {courseId ? (
            <>
              <AttachmentCreateForm
                lang={lang}
                token={token}
                courseId={courseId}
                lessonId={lessonId}
                onCreated={() => setAttachmentsTick((n) => n + 1)}
              />
              <AttachmentList
                lang={lang}
                token={token}
                courseId={courseId}
                lessonId={lessonId}
                manage
                refreshKey={attachmentsTick}
              />
            </>
          ) : null}
        </>
      ) : null}
    </>
  );
}
