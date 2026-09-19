import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { LoginPage, ResetPage, SignupPage, VerifyPage } from "./pages/auth";
import { InviteAcceptPage, InviteCreatePage } from "./pages/invites";
import { dict, dirFor, type Lang } from "./i18n";

function App() {
  // Emailed links (/verify, /reset, /invite + ?token=) boot onto the right
  // form instead of always landing on signup.
  const [route, setRoute] = useState(() => {
    const p = window.location.pathname.replace(/\/$/, "");
    if (p.endsWith("/invite")) return "invite-accept";
    if (p.endsWith("/verify")) return "verify";
    if (p.endsWith("/reset")) return "reset";
    if (p.endsWith("/login")) return "login";
    if (p.endsWith("/signup")) return "signup";
    return "signup";
  });
  const [token, setToken] = useState(() => localStorage.getItem("majlis_token") ?? "");
  const handleToken = (next: string) => {
    setToken(next);
    localStorage.setItem("majlis_token", next);
  };
  // Default language is Arabic; toggle switches to English and back.
  const [lang, setLang] = useState<Lang>("ar");
  const t = dict[lang];
  // Admin-only invite creation is advertised only once logged in; the
  // teacher accept form stays public (teachers arrive logged-out via email).
  const navItems: Array<{ key: string; label: string }> = [
    { key: "signup", label: t.nav_signup },
    { key: "login", label: t.nav_login },
    { key: "verify", label: t.nav_verify },
    { key: "reset", label: t.nav_reset },
    ...(token ? [{ key: "invite-create", label: t.nav_invite_create }] : []),
    { key: "invite-accept", label: t.nav_invite_accept },
  ];
  return (
    <div dir={dirFor(lang)} lang={lang} style={{ fontFamily: "system-ui" }}>
      <nav style={{ display: "flex", gap: 12, padding: 16 }}>
        {navItems.map((item) => (
          <button key={item.key} onClick={() => setRoute(item.key)}>
            {item.label}
          </button>
        ))}
        <button onClick={() => setLang(lang === "ar" ? "en" : "ar")}>{t.language_toggle}</button>
      </nav>
      {route === "signup" && <SignupPage lang={lang} />}
      {route === "login" && <LoginPage lang={lang} onToken={handleToken} />}
      {route === "verify" && <VerifyPage lang={lang} />}
      {route === "reset" && <ResetPage lang={lang} />}
      {route === "invite-create" && <InviteCreatePage lang={lang} token={token} />}
      {route === "invite-accept" && <InviteAcceptPage lang={lang} />}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
