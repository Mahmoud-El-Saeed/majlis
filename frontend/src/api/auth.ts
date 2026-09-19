const BASE = "";

async function req(path: string, init?: RequestInit) {
  const r = await fetch(`${BASE}/api/v1/auth${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.detail ?? "خطأ غير متوقع");
  return data;
}

export const authApi = {
  signup: (email: string, password: string, full_name?: string) =>
    req("/signup", { method: "POST", body: JSON.stringify({ email, password, full_name }) }),
  verify: (token: string) => req("/verify", { method: "POST", body: JSON.stringify({ token }) }),
  login: (email: string, password: string) =>
    req("/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  me: (access: string) =>
    fetch(`${BASE}/api/v1/auth/me`, { headers: { Authorization: `Bearer ${access}` } }).then(
      async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.detail ?? "خطأ");
        return d;
      },
    ),
  resetRequest: (email: string) =>
    req("/password-reset/request", { method: "POST", body: JSON.stringify({ email }) }),
  resetConfirm: (token: string, new_password: string) =>
    req("/password-reset/confirm", {
      method: "POST",
      body: JSON.stringify({ token, new_password }),
    }),
};
