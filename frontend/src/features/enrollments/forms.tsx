import { useEffect, useState, type ReactNode } from "react";
import { enrollmentsApi, type CodeListItem, type Enrollment } from "../../api/enrollments";
import { Notice, Page, TextField } from "../../components/ui";
import { dict, tError, type Lang, type UIText } from "../../i18n";

/** Enrollment feature forms (architecture §4 features/). Pages stay thin shells. */

function useMessage(lang: Lang) {
  const [msg, setMsg] = useState("");
  const show = (m: string) => setMsg(m);
  const showError = (err: unknown, t: UIText) =>
    setMsg(err instanceof Error ? tError(lang, err.message) : t.generic_error);
  return { msg, show, showError };
}

/** Shared login guard shell: every panel needs a token before doing anything. */
function RequireToken({
  lang,
  token,
  title,
  children,
}: {
  lang: Lang;
  token: string;
  title: string;
  children: ReactNode;
}) {
  const t = dict[lang];
  if (!token) {
    return (
      <Page title={title}>
        <Notice message={t.login_required} />
      </Page>
    );
  }
  return <Page title={title}>{children}</Page>;
}

export function statusLabel(t: UIText, status: string): string {
  if (status === "pending") return t.status_pending;
  if (status === "approved") return t.status_approved;
  if (status === "rejected") return t.status_rejected;
  if (status === "blocked") return t.status_blocked;
  return status;
}

export function JoinForm({
  lang,
  token,
  onJoined,
}: {
  lang: Lang;
  token: string;
  onJoined?: () => void;
}) {
  const t = dict[lang];
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const { msg, show, showError } = useMessage(lang);
  return (
    <RequireToken lang={lang} token={token} title={t.enroll_title}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          show("");
          enrollmentsApi
            .join(token, {
              code: code.trim(),
              display_name: name,
              phone: phone || undefined,
              note: note || undefined,
            })
            .then(() => {
              show(t.enroll_success);
              setCode("");
              onJoined?.();
            })
            .catch((err) => showError(err, t));
        }}
      >
        <TextField label={t.enroll_code} value={code} onChange={(e) => setCode(e.target.value)} required />
        <TextField label={t.enroll_name} value={name} onChange={(e) => setName(e.target.value)} required />
        <TextField label={t.enroll_phone} value={phone} onChange={(e) => setPhone(e.target.value)} />
        <TextField label={t.enroll_note} value={note} onChange={(e) => setNote(e.target.value)} />
        <button type="submit">{t.enroll_submit}</button>
      </form>
      <Notice message={msg} />
    </RequireToken>
  );
}

export function CodesPanel({ lang, token }: { lang: Lang; token: string }) {
  const t = dict[lang];
  const [courseId, setCourseId] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [expiresDays, setExpiresDays] = useState("");
  const [codes, setCodes] = useState<CodeListItem[]>([]);
  const [usesCounts, setUsesCounts] = useState<Record<string, number>>({});
  const [freshCode, setFreshCode] = useState("");
  const { msg, show, showError } = useMessage(lang);
  const refresh = (cid: string) => {
    if (!cid) return;
    enrollmentsApi
      .listCodes(token, cid)
      .then(async (d) => {
        setCodes(d.codes);
        // Who-used trace per code (counts only need the list endpoint).
        const counts: Record<string, number> = {};
        for (const c of d.codes) {
          try {
            const u = await enrollmentsApi.codeUses(token, cid, c.id);
            counts[c.id] = u.uses.length;
          } catch {
            counts[c.id] = 0;
          }
        }
        setUsesCounts(counts);
      })
      .catch((err) => showError(err, t));
  };
  return (
    <RequireToken lang={lang} token={token} title={t.codes_title}>
      <TextField label={t.course_id} value={courseId} onChange={(e) => setCourseId(e.target.value)} required />
      <TextField
        label={t.codes_max_uses}
        value={maxUses}
        onChange={(e) => setMaxUses(e.target.value)}
        inputMode="numeric"
      />
      <TextField
        label={t.codes_expires_days}
        value={expiresDays}
        onChange={(e) => setExpiresDays(e.target.value)}
        inputMode="numeric"
      />
      <div className="btn-row">
        <button
          type="button"
          onClick={() => {
            show("");
            setFreshCode("");
            const parsedMax = maxUses ? Number.parseInt(maxUses, 10) : NaN;
            const parsedDays = expiresDays ? Number.parseInt(expiresDays, 10) : NaN;
            enrollmentsApi
              .createCode(token, courseId, {
                ...(Number.isFinite(parsedMax) ? { max_uses: parsedMax } : {}),
                ...(Number.isFinite(parsedDays) ? { expires_days: parsedDays } : {}),
              })
              .then((c) => {
                setFreshCode(c.code);
                show(t.codes_create_success);
                refresh(courseId);
              })
              .catch((err) => showError(err, t));
          }}
        >
          {t.codes_create_submit}
        </button>
        <button type="button" onClick={() => refresh(courseId)}>
          {t.codes_refresh}
        </button>
      </div>
      {freshCode ? <Notice message={`${t.codes_fresh}: ${freshCode}`} /> : null}
      <ul>
        {codes.map((c) => (
          <li key={c.id}>
            {c.code_prefix}… — {c.uses_count}/{c.max_uses}
            {usesCounts[c.id] !== undefined ? ` (${t.codes_used_by}: ${usesCounts[c.id]})` : ""}
            {c.revoked_at ? ` (${t.codes_revoked})` : ""}
            {!c.revoked_at ? (
              <span className="row-actions">
                <button
                  type="button"
                  onClick={() => {
                    enrollmentsApi
                      .revokeCode(token, courseId, c.id)
                      .then((d) => {
                        setCodes(d.codes);
                        show(t.codes_revoke_success);
                      })
                      .catch((err) => showError(err, t));
                  }}
                >
                  {t.codes_revoke}
                </button>
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {codes.length === 0 ? <Notice message={t.codes_empty} /> : null}
      <Notice message={msg} />
    </RequireToken>
  );
}

export function QueuePanel({ lang, token }: { lang: Lang; token: string }) {
  const t = dict[lang];
  const [courseId, setCourseId] = useState("");
  const [filter, setFilter] = useState("pending");
  const [rows, setRows] = useState<Enrollment[]>([]);
  const [prefixes, setPrefixes] = useState<Record<string, string>>({});
  const { msg, show, showError } = useMessage(lang);
  const refresh = (cid: string, f: string) => {
    if (!cid) return;
    enrollmentsApi
      .queue(token, cid, f === "all" ? undefined : f)
      .then(async (d) => {
        setRows(d.enrollments);
        // Resolve which code each request came through (traceability).
        try {
          const codes = await enrollmentsApi.listCodes(token, cid);
          const map: Record<string, string> = {};
          for (const c of codes.codes) map[c.id] = c.code_prefix;
          setPrefixes(map);
        } catch {
          setPrefixes({});
        }
      })
      .catch((err) => showError(err, t));
  };
  const decide = (id: string, action: "approve" | "reject" | "block" | "unblock") => {
    enrollmentsApi
      .decide(token, id, action)
      .then(() => {
        show(t.queue_decided);
        refresh(courseId, filter);
      })
      .catch((err) => showError(err, t));
  };
  return (
    <RequireToken lang={lang} token={token} title={t.queue_title}>
      <TextField label={t.course_id} value={courseId} onChange={(e) => setCourseId(e.target.value)} required />
      <label className="field">
        {t.queue_filter}
        <select
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            refresh(courseId, e.target.value);
          }}
        >
          <option value="pending">{t.status_pending}</option>
          <option value="approved">{t.status_approved}</option>
          <option value="rejected">{t.status_rejected}</option>
          <option value="blocked">{t.status_blocked}</option>
          <option value="all">{t.queue_all}</option>
        </select>
      </label>
      <button type="button" onClick={() => refresh(courseId, filter)}>
        {t.codes_refresh}
      </button>
      <ul className="card-list">
        {rows.map((r) => (
          <li key={r.id} className="card">
            {r.display_name} {r.phone ? `— ${r.phone}` : ""} {r.note ? `— ${r.note}` : ""}
            {r.code_id && prefixes[r.code_id] ? ` (${t.queue_via}: ${prefixes[r.code_id]}…)` : ""}
            {` — ${statusLabel(t, r.status)}`}
            <span className="row-actions">
              <button type="button" onClick={() => decide(r.id, "approve")}>
                {t.queue_approve}
              </button>
              <button type="button" onClick={() => decide(r.id, "reject")}>
                {t.queue_reject}
              </button>
              <button type="button" onClick={() => decide(r.id, "block")}>
                {t.queue_block}
              </button>
              <button type="button" onClick={() => decide(r.id, "unblock")}>
                {t.queue_unblock}
              </button>
            </span>
          </li>
        ))}
      </ul>
      {rows.length === 0 ? <Notice message={t.queue_empty} /> : null}
      <Notice message={msg} />
    </RequireToken>
  );
}

export function MyEnrollments({ lang, token }: { lang: Lang; token: string }) {
  const t = dict[lang];
  const [rows, setRows] = useState<Enrollment[]>([]);
  const { msg, showError } = useMessage(lang);
  useEffect(() => {
    if (!token) return;
    enrollmentsApi
      .mine(token)
      .then((d) => setRows(d.enrollments))
      .catch((err) => showError(err, t));
  }, [token]);
  if (!token) return null;
  return (
    <Page title={t.my_status_title}>
      <ul>
        {rows.map((r) => (
          <li key={r.id}>
            {r.course_title || r.course_id} — {statusLabel(t, r.status)}
          </li>
        ))}
      </ul>
      {rows.length === 0 ? <Notice message={t.my_status_empty} /> : null}
      {msg ? <Notice message={msg} /> : null}
    </Page>
  );
}
