import { useEffect, useState } from "react";
import { MAX_AUDIO_MB, lessonsApi, type Lesson, type LessonSummary } from "../../api/lessons";
import { Notice, Page, TextArea, TextField } from "../../components/ui";
import { dict, tError, type Lang, type UIText } from "../../i18n";

/** Lesson feature forms (architecture §4 features/). Pages stay thin shells. */

function useMessage(lang: Lang) {
  const [msg, setMsg] = useState("");
  const show = (m: string) => setMsg(m);
  const showError = (err: unknown, t: UIText) =>
    setMsg(err instanceof Error ? tError(lang, err.message) : t.generic_error);
  return { msg, show, showError };
}

export function LessonList({ lang, token, courseId, refreshKey = 0 }: { lang: Lang; token: string; courseId: string; refreshKey?: number }) {
  const t = dict[lang];
  const [lessons, setLessons] = useState<LessonSummary[]>([]);
  const { msg, showError } = useMessage(lang);
  useEffect(() => {
    if (!token || !courseId) return;
    lessonsApi
      .list(token, courseId)
      .then(setLessons)
      .catch((err) => showError(err, t));
  }, [token, courseId, refreshKey]);
  if (!token) return null;
  return (
    <Page title={t.lessons_title}>
      <ul>
        {lessons.map((l) => (
          <li key={l.id}>
            {l.title} {l.pages_from ?? ""}–{l.pages_to ?? ""} [{l.status}]
          </li>
        ))}
      </ul>
      {msg ? <Notice message={msg} /> : null}
    </Page>
  );
}

export function LessonCreateForm({
  lang,
  token,
  courseId,
  onCreated,
}: {
  lang: Lang;
  token: string;
  courseId: string;
  onCreated?: () => void;
}) {
  const t = dict[lang];
  const [title, setTitle] = useState("");
  const [pagesFrom, setPagesFrom] = useState("");
  const [pagesTo, setPagesTo] = useState("");
  const [lessonDate, setLessonDate] = useState("");
  const [audioKey, setAudioKey] = useState("");
  const [voice, setVoice] = useState("");
  const [book, setBook] = useState("");
  const { msg, show, showError } = useMessage(lang);
  if (!token) {
    return (
      <Page title={t.lesson_create_title}>
        <Notice message={t.login_required} />
      </Page>
    );
  }
  return (
    <Page title={t.lesson_create_title}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          show("");
          lessonsApi
            .create(token, courseId, {
              title,
              lesson_date: lessonDate || undefined,
              pages_from: pagesFrom ? Number(pagesFrom) : undefined,
              pages_to: pagesTo ? Number(pagesTo) : undefined,
              audio_key: audioKey || undefined,
              transcript_voice: voice || undefined,
              transcript_book: book || undefined,
            })
            .then(() => {
              show(t.lesson_create_success);
              onCreated?.();
            })
            .catch((err) => showError(err, t));
        }}
      >
        <TextField label={t.lesson_title} value={title} onChange={(e) => setTitle(e.target.value)} required />
        <TextField
          label={t.lesson_pages_from}
          value={pagesFrom}
          onChange={(e) => setPagesFrom(e.target.value)}
          type="number"
          min={1}
        />
        <TextField
          label={t.lesson_pages_to}
          value={pagesTo}
          onChange={(e) => setPagesTo(e.target.value)}
          type="number"
          min={1}
        />
        <TextField
          label={t.lesson_date}
          value={lessonDate}
          onChange={(e) => setLessonDate(e.target.value)}
          type="date"
        />
        <TextField
          label={t.lesson_audio}
          value={audioKey}
          onChange={(e) => setAudioKey(e.target.value)}
        />
        <TextArea label={t.lesson_voice} value={voice} onChange={(e) => setVoice(e.target.value)} />
        <TextArea label={t.lesson_book} value={book} onChange={(e) => setBook(e.target.value)} />
        <button type="submit">{t.lesson_submit}</button>
      </form>
      <Notice message={msg} />
    </Page>
  );
}

export function LessonEditForm({ lang, token }: { lang: Lang; token: string }) {
  const t = dict[lang];
  const [lessonId, setLessonId] = useState("");
  const [title, setTitle] = useState("");
  const [voice, setVoice] = useState("");
  const [book, setBook] = useState("");
  const { msg, show, showError } = useMessage(lang);
  if (!token) {
    return (
      <Page title={t.lesson_edit_title}>
        <Notice message={t.login_required} />
      </Page>
    );
  }
  return (
    <Page title={t.lesson_edit_title}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          show("");
          lessonsApi
            .update(token, lessonId, {
              title: title || undefined,
              transcript_voice: voice || undefined,
              transcript_book: book || undefined,
            })
            .then(() => show(t.lesson_edit_success))
            .catch((err) => showError(err, t));
        }}
      >
        <TextField
          label={t.lesson_id}
          value={lessonId}
          onChange={(e) => setLessonId(e.target.value)}
          required
        />
        <TextField label={t.lesson_title} value={title} onChange={(e) => setTitle(e.target.value)} />
        <TextArea label={t.lesson_voice} value={voice} onChange={(e) => setVoice(e.target.value)} />
        <TextArea label={t.lesson_book} value={book} onChange={(e) => setBook(e.target.value)} />
        <button type="submit">{t.lesson_edit_submit}</button>
      </form>
      <Notice message={msg} />
    </Page>
  );
}

const AUDIO_EXTS = [".mp3", ".m4a", ".wav", ".ogg", ".oga", ".opus", ".aac", ".flac", ".webm"];

function pickExt(name: string): string {
  const i = name.lastIndexOf(".");
  const ext = i >= 0 ? name.slice(i).toLowerCase() : ".mp3";
  return AUDIO_EXTS.includes(ext) ? ext : ".mp3";
}

function validAudio(file: File): boolean {
  if (file.type) return file.type.toLowerCase().startsWith("audio/");
  return AUDIO_EXTS.some((e) => file.name.toLowerCase().endsWith(e));
}

/** Direct-to-storage audio upload (ticket 05): presigned PUT -> browser PUT
 *  -> confirm. Retry always fetches a fresh URL (stuck-state recovery). */
export function LessonAudioUpload({
  lang,
  token,
  lessonId,
  onReady,
}: {
  lang: Lang;
  token: string;
  lessonId: string;
  onReady?: (lesson: Lesson) => void;
}) {
  const t = dict[lang];
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"idle" | "uploading" | "processing" | "ready">("idle");
  const { msg, show, showError } = useMessage(lang);
  if (!token) {
    return (
      <Page title={t.lesson_upload_title}>
        <Notice message={t.login_required} />
      </Page>
    );
  }
  async function run() {
    if (!file) {
      show(t.lesson_upload_no_file);
      return;
    }
    if (!validAudio(file)) {
      show(t.lesson_upload_bad_type);
      return;
    }
    if (file.size > MAX_AUDIO_MB * 1024 * 1024) {
      show(t.lesson_upload_too_large);
      return;
    }
    setBusy(true);
    setPhase("uploading");
    show(t.lesson_uploading);
    try {
      const contentType = file.type || "audio/mpeg";
      // Fresh URL on every attempt: recovers from interrupted uploads.
      const { upload_url, object_key } = await lessonsApi.uploadUrl(token, lessonId, {
        content_type: contentType,
        file_ext: pickExt(file.name),
      });
      setPhase("processing");
      show(t.lesson_status_processing);
      const put = await fetch(upload_url, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: file,
      });
      if (!put.ok) {
        setPhase("idle");
        throw new Error(t.lesson_upload_retry);
      }
      const lesson = await lessonsApi.confirmUpload(token, lessonId, object_key);
      onReady?.(lesson);
      setPhase(lesson.status === "ready" ? "ready" : "processing");
      show(lesson.status === "ready" ? t.lesson_upload_success : t.lesson_status_processing);
    } catch (err) {
      showError(err, t);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page title={t.lesson_upload_title}>
      <label className="field">
        {t.lesson_upload_choose}
        <input
          type="file"
          accept="audio/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>
      <button type="button" disabled={busy} onClick={run}>
        {t.lesson_upload_submit}
      </button>
      {phase === "ready" ? <Notice message={t.lesson_status_ready} /> : null}
      <Notice message={msg} />
    </Page>
  );
}

/** Approved-member playback via short-lived signed URL (Range streaming in
 *  the browser; the VPS never proxies bytes). */
export function LessonPlayer({
  lang,
  token,
  lessonId,
}: {
  lang: Lang;
  token: string;
  lessonId: string;
}) {
  const t = dict[lang];
  const [src, setSrc] = useState("");
  const { msg, show, showError } = useMessage(lang);
  if (!token) return null;
  return (
    <Page title={t.lesson_play_title}>
      <button
        type="button"
        onClick={() => {
          show("");
          lessonsApi
            .playUrl(token, lessonId)
            .then((p) => setSrc(p.playback_url))
            .catch((err) => showError(err, t));
        }}
      >
        {t.lesson_play_submit}
      </button>
      {src ? <audio controls preload="metadata" src={src} /> : null}
      {msg ? <Notice message={msg} /> : null}
    </Page>
  );
}
