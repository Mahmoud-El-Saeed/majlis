export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface SignupResponse {
  id: string;
  email: string;
  message: string;
}

export interface MessageResponse {
  message: string;
}

export interface UserResponse {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  is_verified: boolean;
}

// Local dev: "" (vite proxies /api to localhost:8000).
// Cloudflare Pages prod: set VITE_API_BASE=https://api.yourdomain.com
const BASE = import.meta.env.VITE_API_BASE ?? "";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}/api/v1/auth${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const data = await r.json().catch(() => ({}));
  // Backend details stay English; UI localizes via tError() in i18n.ts.
  if (!r.ok) throw new Error((data as { detail?: string }).detail ?? "Unexpected error");
  return data as T;
}

export const authApi = {
  signup: (email: string, password: string, full_name?: string): Promise<SignupResponse> =>
    req<SignupResponse>("/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, full_name }),
    }),
  verify: (token: string): Promise<MessageResponse> =>
    req<MessageResponse>("/verify", { method: "POST", body: JSON.stringify({ token }) }),
  login: (email: string, password: string): Promise<TokenResponse> =>
    req<TokenResponse>("/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  me: async (access: string): Promise<UserResponse> => {
    const r = await fetch(`${BASE}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${access}` },
    });
    const d = (await r.json()) as { detail?: string } & Partial<UserResponse>;
    if (!r.ok) throw new Error(d.detail ?? "Unexpected error");
    return d as UserResponse;
  },
  resetRequest: (email: string): Promise<MessageResponse> =>
    req<MessageResponse>("/password-reset/request", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  resetConfirm: (token: string, new_password: string): Promise<MessageResponse> =>
    req<MessageResponse>("/password-reset/confirm", {
      method: "POST",
      body: JSON.stringify({ token, new_password }),
    }),
};
