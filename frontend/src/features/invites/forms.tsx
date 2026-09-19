import { useState } from "react";
import { invitesApi } from "../../api/invites";
import { Notice, Page, TextField } from "../../components/ui";
import { dict, tError, type Lang, type UIText } from "../../i18n";

/** Invite feature forms (architecture §4 features/). Pages stay thin shells. */

function useMessage(lang: Lang) {
  const [msg, setMsg] = useState("");
  const show = (m: string) => setMsg(m);
  const showError = (err: unknown, t: UIText) =>
    setMsg(err instanceof Error ? tError(lang, err.message) : t.generic_error);
  return { msg, show, showError };
}

async function submitForm(
  e: React.FormEvent,
  show: (m: string) => void,
  showError: (err: unknown, t: UIText) => void,
  t: UIText,
  task: () => Promise<string>,
): Promise<void> {
  e.preventDefault();
  show("");
  try {
    show(await task());
  } catch (err) {
    showError(err, t);
  }
}

export function InviteCreateForm({ lang, token }: { lang: Lang; token: string }) {
  const t = dict[lang];
  const [email, setEmail] = useState("");
  const { msg, show, showError } = useMessage(lang);
  if (!token) {
    return (
      <Page title={t.invite_create_title}>
        <Notice message={t.invite_admin_required} />
      </Page>
    );
  }
  return (
    <Page title={t.invite_create_title}>
      <form
        onSubmit={(e) =>
          void submitForm(e, show, showError, t, async () => {
            await invitesApi.create(token, email);
            return t.invite_success;
          })
        }
      >
        <TextField
          label={t.email}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          required
          placeholder={t.email_placeholder}
        />
        <button type="submit">{t.invite_submit}</button>
      </form>
      <Notice message={msg} />
    </Page>
  );
}

export function InviteAcceptForm({ lang }: { lang: Lang }) {
  const t = dict[lang];
  const [inviteToken, setInviteToken] = useState(
    () => new URLSearchParams(window.location.search).get("token") ?? "",
  );
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const { msg, show, showError } = useMessage(lang);
  return (
    <Page title={t.invite_accept_title}>
      <form
        onSubmit={(e) =>
          void submitForm(e, show, showError, t, async () => {
            await invitesApi.accept(inviteToken, password, fullName || undefined);
            return t.invite_accept_success;
          })
        }
      >
        <TextField
          label={t.invite_token}
          value={inviteToken}
          onChange={(e) => setInviteToken(e.target.value)}
          required
        />
        <TextField
          label={t.invite_name}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
        <TextField
          label={t.password_with_min}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          required
          minLength={8}
        />
        <button type="submit">{t.invite_accept_submit}</button>
      </form>
      <Notice message={msg} />
    </Page>
  );
}
