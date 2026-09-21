import { useEffect, useState } from "react";
import { attachmentsApi, type Attachment } from "../../api/attachments";
import { Notice, Page, TextArea, TextField } from "../../components/ui";
import { dict, tError, type Lang, type UIText } from "../../i18n";

function useMessage(lang: Lang) {
  const [msg, setMsg] = useState("");
  const show = (m: string) => setMsg(m);
  const showError = (err: unknown, t: UIText) =>
    setMsg(err instanceof Error ? tError(lang, err.message) : t.generic_error);
  return { msg, show, showError };
}

function validPdf(file: File): boolean {
  if (file.type) return file.type.toLowerCase() === "application/pdf";
  return file.name.toLowerCase().endsWith(".pdf");
}

/** Teacher: name the PDF + description (bytes follow via upload below). */
export function AttachmentCreateForm({
  lang,
  token,
  courseId,
  lessonId,
  onCreated,
}: {
  lang: Lang;
  token: string;
  courseId: string;
  lessonId: string;
  onCreated?: (a: Attachment) => void;
}) {
  const t = dict[lang];
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const { msg, show, showError } = useMessage(lang);
  if (!token) return null;
  return (
    <Page title={t.pdf_create_title}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          show("");
          attachmentsApi
            .create(token, courseId, lessonId, {
              title,
              description: description || undefined,
            })
            .then((a) => {
              show(t.pdf_create_success);
              setTitle("");
              setDescription("");
              onCreated?.(a);
            })
            .catch((err) => showError(err, t));
        }}
      >
        <TextField label={t.pdf_title} value={title} onChange={(e) => setTitle(e.target.value)} required />
        <TextArea
          label={t.pdf_description}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <button type="submit">{t.pdf_submit}</button>
      </form>
      <Notice message={msg} />
    </Page>
  );
}

/** Teacher: upload the PDF bytes for a created attachment (fresh URL retry). */
export function AttachmentUpload({
  lang,
  token,
  attachmentId,
  onReady,
}: {
  lang: Lang;
  token: string;
  attachmentId: string;
  onReady?: (a: Attachment) => void;
}) {
  const t = dict[lang];
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const { msg, show, showError } = useMessage(lang);
  if (!token) return null;
  async function run() {
    if (!file) {
      show(t.pdf_upload_no_file);
      return;
    }
    if (!validPdf(file)) {
      show(t.pdf_upload_bad_type);
      return;
    }
    setBusy(true);
    try {
      const { upload_url, object_key } = await attachmentsApi.uploadUrl(token, attachmentId, {
        content_type: "application/pdf",
        file_ext: ".pdf",
      });
      const put = await fetch(upload_url, {
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        body: file,
      });
      if (!put.ok) throw new Error(t.lesson_upload_retry);
      const done = await attachmentsApi.confirmUpload(token, attachmentId, object_key);
      onReady?.(done);
      show(t.pdf_upload_success);
    } catch (err) {
      showError(err, t);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page title={t.pdf_upload_title}>
      <label className="field">
        {t.pdf_upload_choose}
        <input
          type="file"
          accept="application/pdf,.pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>
      <button type="button" disabled={busy} onClick={run}>
        {t.pdf_upload_submit}
      </button>
      <Notice message={msg} />
    </Page>
  );
}

/** Attachments for one lesson.
 *  manage=true: teacher rename/delete + per-row upload.
 *  manage=false: student view-in-browser (inline) + download. */
export function AttachmentList({
  lang,
  token,
  courseId,
  lessonId,
  manage = false,
  refreshKey = 0,
}: {
  lang: Lang;
  token: string;
  courseId: string;
  lessonId: string;
  manage?: boolean;
  refreshKey?: number;
}) {
  const t = dict[lang];
  const [rows, setRows] = useState<Attachment[]>([]);
  const [preview, setPreview] = useState("");
  const [editing, setEditing] = useState<Attachment | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const { msg, show, showError } = useMessage(lang);

  const reload = () => {
    if (!token) return;
    attachmentsApi
      .list(token, courseId, lessonId)
      .then(setRows)
      .catch((err) => showError(err, t));
  };
  useEffect(reload, [token, courseId, lessonId, refreshKey]);

  async function openFile(id: string, disposition: "inline" | "attachment") {
    show("");
    try {
      const { file_url } = await attachmentsApi.fileUrl(token, id, disposition);
      if (disposition === "inline") {
        setPreview(file_url);
      } else {
        const a = document.createElement("a");
        a.href = file_url;
        a.download = "";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } catch (err) {
      showError(err, t);
    }
  }

  if (!token) return null;
  return (
    <Page title={t.lesson_detail_pdfs}>
      <ul className="card-list">
        {rows.map((a) => (
          <li key={a.id} className="card">
            <strong>{a.title}</strong>
            {a.description ? ` — ${a.description}` : ""}
            {!a.has_file ? ` (${t.pdf_not_ready})` : ""}
            {a.has_file ? (
              <span className="row-actions">
                <button type="button" onClick={() => openFile(a.id, "inline")}>
                  {t.lesson_view_pdf}
                </button>
                <button type="button" onClick={() => openFile(a.id, "attachment")}>
                  {t.lesson_download_pdf}
                </button>
              </span>
            ) : null}
            {manage ? (
              <span className="row-actions">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(a);
                    setEditTitle(a.title);
                    setEditDesc(a.description ?? "");
                  }}
                >
                  {t.pdf_rename}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    attachmentsApi
                      .remove(token, a.id)
                      .then(() => {
                        show(t.pdf_deleted);
                        reload();
                      })
                      .catch((err) => showError(err, t));
                  }}
                >
                  {t.pdf_delete}
                </button>
              </span>
            ) : null}
            {manage && !a.has_file ? (
              <AttachmentUpload lang={lang} token={token} attachmentId={a.id} onReady={reload} />
            ) : null}
          </li>
        ))}
      </ul>
      {rows.length === 0 ? <Notice message={t.lesson_detail_no_pdfs} /> : null}
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            attachmentsApi
              .update(token, editing.id, {
                title: editTitle || undefined,
                description: editDesc || undefined,
              })
              .then(() => {
                show(t.pdf_saved);
                setEditing(null);
                reload();
              })
              .catch((err) => showError(err, t));
          }}
        >
          <TextField
            label={t.pdf_title}
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
          />
          <TextArea
            label={t.pdf_description}
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
          />
          <button type="submit">{t.pdf_saved}</button>
        </form>
      ) : null}
      {preview ? (
        <iframe title="pdf-preview" src={preview} className="pdf-preview" />
      ) : null}
      {msg ? <Notice message={msg} /> : null}
    </Page>
  );
}
