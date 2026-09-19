import { useState } from "react";
import { authApi } from "../../api/auth";
import { Notice, Page, TextField } from "../../components/ui";
import { dict, tError, type Lang, type UIText } from "../../i18n";

/** Auth feature forms (architecture §4 features/). Pages stay thin shells. */

function useMessage(lang: Lang) {
  const [msg, setMsg] = useState("");
  const show = (m: string) => setMsg(m);
  const showError = (err: unknown, t: UIText) =>
    setMsg(err instanceof Error ? tError(lang, err.message) : t.generic_error);
  return { msg, show, showError };
}

export function SignupForm({ lang }: { lang: Lang }) {
  const t = dict[lang];
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { msg, show, showError } = useMessage(lang);
  return (
    <Page title={t.signup_title}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          show("");
          try {
            await authApi.signup(email, password);
            show(t.signup_success);
          } catch (err) {
            showError(err, t);
          }
        }}
      >
        <TextField
          label={t.email}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          required
        />
        <TextField
          label={t.password_with_min}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          required
          minLength={8}
        />
        <button type="submit">{t.signup_submit}</button>
      </form>
      <Notice message={msg} />
    </Page>
  );
}

export function LoginForm({ lang, onToken }: { lang: Lang; onToken: (t: string) => void }) {
  const t = dict[lang];
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { msg, show, showError } = useMessage(lang);
  return (
    <Page title={t.login_title}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const res = await authApi.login(email, password);
            onToken(res.access_token);
            show(t.login_success);
          } catch (err) {
            showError(err, t);
          }
        }}
      >
        <TextField
          label={t.email}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          required
        />
        <TextField
          label={t.password}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          required
        />
        <button type="submit">{t.login_submit}</button>
      </form>
      <Notice message={msg} />
    </Page>
  );
}

export function VerifyForm({ lang }: { lang: Lang }) {
  const t = dict[lang];
  const { msg, show, showError } = useMessage(lang);
  return (
    <Page title={t.verify_title}>
      <button
        onClick={async () => {
          const token = new URLSearchParams(window.location.search).get("token") ?? "";
          try {
            await authApi.verify(token);
            show(t.verify_success);
          } catch (err) {
            showError(err, t);
          }
        }}
      >
        {t.verify_submit}
      </button>
      <Notice message={msg} />
    </Page>
  );
}

export function ResetForm({ lang }: { lang: Lang }) {
  const t = dict[lang];
  const [email, setEmail] = useState("");
  const [token, setToken] = useState(
    () => new URLSearchParams(window.location.search).get("token") ?? "",
  );
  const [newPassword, setNewPassword] = useState("");
  const { msg, show, showError } = useMessage(lang);
  return (
    <Page title={t.reset_title}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await authApi.resetRequest(email);
            show(t.reset_success);
          } catch (err) {
            showError(err, t);
          }
        }}
      >
        <TextField
          label={t.email}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          required
          placeholder={t.email_placeholder}
        />
        <button type="submit">{t.reset_submit}</button>
      </form>
      <h2>{t.reset_confirm_title}</h2>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await authApi.resetConfirm(token, newPassword);
            show(t.reset_confirm_success);
          } catch (err) {
            showError(err, t);
          }
        }}
      >
        <TextField
          label={t.reset_token}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          required
        />
        <TextField
          label={t.new_password}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          type="password"
          required
          minLength={8}
        />
        <button type="submit">{t.reset_confirm_submit}</button>
      </form>
      <Notice message={msg} />
    </Page>
  );
}
