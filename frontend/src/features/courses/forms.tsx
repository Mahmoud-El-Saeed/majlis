import { useEffect, useState } from "react";
import { coursesApi, type Course } from "../../api/courses";
import { Notice, Page, TextField } from "../../components/ui";
import { dict, tError, type Lang, type UIText } from "../../i18n";

/** Course feature forms (architecture §4 features/). Pages stay thin shells. */

function useMessage(lang: Lang) {
  const [msg, setMsg] = useState("");
  const show = (m: string) => setMsg(m);
  const showError = (err: unknown, t: UIText) =>
    setMsg(err instanceof Error ? tError(lang, err.message) : t.generic_error);
  return { msg, show, showError };
}

export function CourseList({ lang, token }: { lang: Lang; token: string }) {
  const t = dict[lang];
  const [courses, setCourses] = useState<Course[]>([]);
  const { msg, showError } = useMessage(lang);
  useEffect(() => {
    if (!token) return;
    coursesApi
      .list(token)
      .then(setCourses)
      .catch((err) => showError(err, t));
  }, [token]);
  if (!token) return null;
  return (
    <Page title={t.courses_title}>
      <ul>
        {courses.map((c) => (
          <li key={c.id}>
            {c.title} {c.book_title ? `— ${c.book_title}` : ""}
          </li>
        ))}
      </ul>
      {msg ? <Notice message={msg} /> : null}
    </Page>
  );
}

export function CourseCreateForm({ lang, token }: { lang: Lang; token: string }) {  const t = dict[lang];
  const [title, setTitle] = useState("");
  const [bookTitle, setBookTitle] = useState("");
  const [description, setDescription] = useState("");
  const { msg, show, showError } = useMessage(lang);
  if (!token) {
    return (
      <Page title={t.course_create_title}>
        <Notice message={t.login_required} />
      </Page>
    );
  }
  return (
    <Page title={t.course_create_title}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          show("");
          coursesApi
            .create(token, {
              title,
              book_title: bookTitle || undefined,
              description: description || undefined,
            })
            .then(() => show(t.course_create_success))
            .catch((err) => showError(err, t));
        }}
      >
        <TextField label={t.course_title} value={title} onChange={(e) => setTitle(e.target.value)} required />
        <TextField
          label={t.course_book}
          value={bookTitle}
          onChange={(e) => setBookTitle(e.target.value)}
        />
        <TextField
          label={t.course_description}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <button type="submit">{t.course_submit}</button>
      </form>
      <Notice message={msg} />
    </Page>
  );
}

export function CourseEditForm({ lang, token }: { lang: Lang; token: string }) {
  const t = dict[lang];
  const [courseId, setCourseId] = useState("");
  const [title, setTitle] = useState("");
  const [bookTitle, setBookTitle] = useState("");
  const [description, setDescription] = useState("");
  const { msg, show, showError } = useMessage(lang);
  if (!token) {
    return (
      <Page title={t.course_edit_title}>
        <Notice message={t.login_required} />
      </Page>
    );
  }
  return (
    <Page title={t.course_edit_title}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          show("");
          coursesApi
            .update(token, courseId, {
              title: title || undefined,
              book_title: bookTitle || undefined,
              description: description || undefined,
            })
            .then(() => show(t.course_edit_success))
            .catch((err) => showError(err, t));
        }}
      >
        <TextField
          label={t.course_id}
          value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
          required
        />
        <TextField label={t.course_title} value={title} onChange={(e) => setTitle(e.target.value)} />
        <TextField
          label={t.course_book}
          value={bookTitle}
          onChange={(e) => setBookTitle(e.target.value)}
        />
        <TextField
          label={t.course_description}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <button type="submit">{t.course_edit_submit}</button>
      </form>
      <Notice message={msg} />
    </Page>
  );
}
