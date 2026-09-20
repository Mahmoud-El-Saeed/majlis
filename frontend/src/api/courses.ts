export interface Course {
  id: string;
  title: string;
  description: string | null;
  book_title: string | null;
  organization_id: string | null;
  created_by: string | null;
  created_at: string;
}

// Local dev: "" (vite proxies /api to localhost:8000).
// Cloudflare Pages prod: set VITE_API_BASE=https://api.yourdomain.com
const BASE = import.meta.env.VITE_API_BASE ?? "";

async function req<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}/api/v1/courses${path}`, {
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

export const coursesApi = {
  list: (token: string): Promise<Course[]> => req<Course[]>("", token),
  get: (token: string, id: string): Promise<Course> => req<Course>(`/${id}`, token),
  create: (
    token: string,
    input: { title: string; description?: string; book_title?: string },
  ): Promise<Course> =>
    req<Course>("", token, { method: "POST", body: JSON.stringify(input) }),
  update: (
    token: string,
    id: string,
    input: { title?: string; description?: string; book_title?: string; organization_id?: string },
  ): Promise<Course> => req<Course>(`/${id}`, token, { method: "PUT", body: JSON.stringify(input) }),
};
