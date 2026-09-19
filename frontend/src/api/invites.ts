export interface InviteResponse {
  id: string;
  email: string;
  message: string;
}

export interface InviteListItem {
  id: string;
  email: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

// Local dev: "" (vite proxies /api to localhost:8000).
// Cloudflare Pages prod: set VITE_API_BASE=https://api.yourdomain.com
const BASE = import.meta.env.VITE_API_BASE ?? "";

async function req<T>(path: string, init: RequestInit & { token?: string }): Promise<T> {
  const { token, ...rest } = init;
  const r = await fetch(`${BASE}/api/v1/invites${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...rest,
  });
  const data = await r.json().catch(() => ({}));
  // Backend details stay English; UI localizes via tError() in i18n.ts.
  if (!r.ok) throw new Error((data as { detail?: string }).detail ?? "Unexpected error");
  return data as T;
}

export const invitesApi = {
  create: (token: string, email: string): Promise<InviteResponse> =>
    req<InviteResponse>("", { method: "POST", token, body: JSON.stringify({ email }) }),
  accept: (inviteToken: string, password: string, full_name?: string): Promise<InviteResponse> =>
    req<InviteResponse>("/accept", {
      method: "POST",
      body: JSON.stringify({ token: inviteToken, password, full_name }),
    }),
  list: (token: string): Promise<{ invites: InviteListItem[] }> =>
    req<{ invites: InviteListItem[] }>("", { token }),
};
