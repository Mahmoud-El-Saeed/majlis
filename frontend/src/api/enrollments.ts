export interface JoinCode {
  id: string;
  code: string;
  code_prefix: string;
  max_uses: number;
  uses_count: number;
  expires_at: string;
  created_at: string;
}

export interface CodeListItem {
  id: string;
  code_prefix: string;
  max_uses: number;
  uses_count: number;
  expires_at: string;
  revoked_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Enrollment {
  id: string;
  course_id: string;
  course_title: string | null;
  user_id: string;
  code_id: string | null;
  status: string;
  display_name: string;
  phone: string | null;
  note: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CodeUse {
  id: string;
  user_id: string;
  display_name: string;
  used_at: string;
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

export const enrollmentsApi = {
  createCode: (
    token: string,
    courseId: string,
    input: { max_uses?: number; expires_days?: number } = {},
  ): Promise<JoinCode> =>
    req<JoinCode>(`/courses/${courseId}/codes`, token, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  listCodes: (token: string, courseId: string): Promise<{ codes: CodeListItem[] }> =>
    req<{ codes: CodeListItem[] }>(`/courses/${courseId}/codes`, token),
  revokeCode: (token: string, courseId: string, codeId: string): Promise<{ codes: CodeListItem[] }> =>
    req<{ codes: CodeListItem[] }>(`/courses/${courseId}/codes/${codeId}/revoke`, token, {
      method: "POST",
    }),
  join: (
    token: string,
    input: { code: string; display_name: string; phone?: string; note?: string },
  ): Promise<Enrollment> =>
    req<Enrollment>("/enrollments/join", token, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  queue: (
    token: string,
    courseId: string,
    status?: string,
  ): Promise<{ enrollments: Enrollment[] }> =>
    req<{ enrollments: Enrollment[] }>(
      `/courses/${courseId}/enrollments${status ? `?status=${status}` : ""}`,
      token,
    ),
  myEnrollment: (token: string, courseId: string): Promise<Enrollment | null> =>
    req<Enrollment | null>(`/courses/${courseId}/my-enrollment`, token),
  mine: (token: string): Promise<{ enrollments: Enrollment[] }> =>
    req<{ enrollments: Enrollment[] }>("/enrollments/mine", token),
  codeUses: (token: string, courseId: string, codeId: string): Promise<{ uses: CodeUse[] }> =>
    req<{ uses: CodeUse[] }>(`/courses/${courseId}/codes/${codeId}/uses`, token),
  decide: (
    token: string,
    enrollmentId: string,
    action: "approve" | "reject" | "block" | "unblock",
  ): Promise<Enrollment> =>
    req<Enrollment>(`/enrollments/${enrollmentId}/${action}`, token, { method: "POST" }),
};
