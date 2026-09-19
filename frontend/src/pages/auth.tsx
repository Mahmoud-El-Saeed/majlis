import { useState } from "react";
import { authApi } from "../api/auth";

export function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  return (
    <main style={{ maxWidth: 420, margin: "2rem auto", padding: 16 }}>
      <h1>مجلس — إنشاء حساب طالب</h1>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setMsg("");
          try {
            await authApi.signup(email, password);
            setMsg("تم إنشاء الحساب. تحقق من بريدك للتفعيل.");
          } catch (err) {
            setMsg(err instanceof Error ? err.message : "خطأ");
          }
        }}
      >
        <label>
          البريد
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        </label>
        <label>
          كلمة المرور (8+)
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
            minLength={8}
          />
        </label>
        <button type="submit">إنشاء الحساب</button>
      </form>
      {msg && <p>{msg}</p>}
    </main>
  );
}

export function LoginPage({ onToken }: { onToken: (t: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  return (
    <main style={{ maxWidth: 420, margin: "2rem auto", padding: 16 }}>
      <h1>مجلس — تسجيل الدخول</h1>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const t = await authApi.login(email, password);
            onToken(t.access_token);
            setMsg("تم الدخول بنجاح.");
          } catch (err) {
            setMsg(err instanceof Error ? err.message : "خطأ");
          }
        }}
      >
        <label>
          البريد
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        </label>
        <label>
          كلمة المرور
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
          />
        </label>
        <button type="submit">دخول</button>
      </form>
      {msg && <p>{msg}</p>}
    </main>
  );
}

export function VerifyPage() {
  const [msg, setMsg] = useState("");
  return (
    <main style={{ maxWidth: 420, margin: "2rem auto", padding: 16 }}>
      <h1>تفعيل الحساب</h1>
      <button
        onClick={async () => {
          const token = new URLSearchParams(window.location.search).get("token") ?? "";
          try {
            await authApi.verify(token);
            setMsg("تم التفعيل. يمكنك تسجيل الدخول.");
          } catch (err) {
            setMsg(err instanceof Error ? err.message : "خطأ");
          }
        }}
      >
        فعّل حسابي
      </button>
      {msg && <p>{msg}</p>}
    </main>
  );
}

export function ResetPage() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  return (
    <main style={{ maxWidth: 420, margin: "2rem auto", padding: 16 }}>
      <h1>استعادة كلمة المرور</h1>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await authApi.resetRequest(email);
            setMsg("إذا كان البريد مسجلًا ستصلك رسالة استعادة.");
          } catch (err) {
            setMsg(err instanceof Error ? err.message : "خطأ");
          }
        }}
      >
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          required
          placeholder="بريدك"
        />
        <button type="submit">إرسال رابط الاستعادة</button>
      </form>
      {msg && <p>{msg}</p>}
    </main>
  );
}
