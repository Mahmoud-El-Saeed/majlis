export interface Attachment {
  id: string;
  lesson_id: string;
  title: string;
  description: string | null;
  file_key: string | null;
  content_type: string;
  has_file: boolean;
  created_at: string;
}

export interface AttachmentUploadUrl {
  upload_url: string;
  object_key: string;
  expires_in: number;
}

export interface AttachmentFile {
  file_url: string;
  expires_in: number;
}

// Local dev: "" (vite proxies /api to localhost:8000).
// Cloudflare Pages prod: set VITE_API_BASE=https://api.yourdomain.com
const BASE = import.meta.env.VITE_API_BASE ?? "";

async function req<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}/api/v1${path}`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    ...init,
  });
  const data = await r.json().catch(() => ({}));
  // Backend details stay English; UI localizes via tError() in i18n.ts.
  if (!r.ok) throw new Error((data as { detail?: string }).detail ?? "Unexpected error");
  return data as T;
}

export const attachmentsApi = {
  list: (token: string, courseId: string, lessonId: string): Promise<Attachment[]> =>
    req<Attachment[]>(`/courses/${courseId}/lessons/${lessonId}/attachments`, token),
  create: (
    token: string,
    courseId: string,
    lessonId: string,
    input: { title: string; description?: string },
  ): Promise<Attachment> =>
    req<Attachment>(`/courses/${courseId}/lessons/${lessonId}/attachments`, token, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  update: (
    token: string,
    id: string,
    input: { title?: string; description?: string },
  ): Promise<Attachment> =>
    req<Attachment>(`/lesson-attachments/${id}`, token, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  remove: (token: string, id: string): Promise<void> =>
    req<void>(`/lesson-attachments/${id}`, token, { method: "DELETE" }),
  uploadUrl: (
    token: string,
    id: string,
    input: { content_type: string; file_ext?: string },
  ): Promise<AttachmentUploadUrl> =>
    req<AttachmentUploadUrl>(`/lesson-attachments/${id}/upload-url`, token, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  confirmUpload: (token: string, id: string, object_key: string): Promise<Attachment> =>
    req<Attachment>(`/lesson-attachments/${id}/confirm`, token, {
      method: "POST",
      body: JSON.stringify({ object_key }),
    }),
  fileUrl: (
    token: string,
    id: string,
    disposition: "inline" | "attachment" = "inline",
  ): Promise<AttachmentFile> =>
    req<AttachmentFile>(`/lesson-attachments/${id}/file?disposition=${disposition}`, token),
};
