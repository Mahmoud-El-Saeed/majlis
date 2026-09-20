export interface Lesson {
  id: string;
  course_id: string;
  title: string;
  lesson_date: string | null;
  pages_from: number | null;
  pages_to: number | null;
  audio_key: string | null;
  media_type: string;
  transcript_voice: string;
  transcript_book: string;
  status: string;
  created_at: string;
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

export const lessonsApi = {
  list: (token: string, courseId: string): Promise<Lesson[]> =>
    req<Lesson[]>(`/courses/${courseId}/lessons`, token),
  get: (token: string, id: string): Promise<Lesson> => req<Lesson>(`/lessons/${id}`, token),
  create: (
    token: string,
    courseId: string,
    input: {
      title: string;
      lesson_date?: string;
      pages_from?: number;
      pages_to?: number;
      audio_key?: string;
      transcript_voice?: string;
      transcript_book?: string;
    },
  ): Promise<Lesson> =>
    req<Lesson>(`/courses/${courseId}/lessons`, token, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  update: (
    token: string,
    id: string,
    input: {
      title?: string;
      lesson_date?: string;
      pages_from?: number;
      pages_to?: number;
      audio_key?: string;
      transcript_voice?: string;
      transcript_book?: string;
    },
  ): Promise<Lesson> =>
    req<Lesson>(`/lessons/${id}`, token, { method: "PUT", body: JSON.stringify(input) }),
};
