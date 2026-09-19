import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { LoginPage, ResetPage, SignupPage, VerifyPage } from "./pages/auth";
import { dict, dirFor, type Lang } from "./i18n";

function App() {
  const [route, setRoute] = useState("signup");
  const [, setToken] = useState("");
  // Default language is Arabic; toggle switches to English and back.
  const [lang, setLang] = useState<Lang>("ar");
  const t = dict[lang];
  return (
    <div dir={dirFor(lang)} lang={lang} style={{ fontFamily: "system-ui" }}>
      <nav style={{ display: "flex", gap: 12, padding: 16 }}>
        {(["signup", "login", "verify", "reset"] as const).map((r) => (
          <button key={r} onClick={() => setRoute(r)}>
            {r === "signup"
              ? t.nav_signup
              : r === "login"
                ? t.nav_login
                : r === "verify"
                  ? t.nav_verify
                  : t.nav_reset}
          </button>
        ))}
        <button onClick={() => setLang(lang === "ar" ? "en" : "ar")}>{t.language_toggle}</button>
      </nav>
      {route === "signup" && <SignupPage lang={lang} />}
      {route === "login" && <LoginPage lang={lang} onToken={setToken} />}
      {route === "verify" && <VerifyPage lang={lang} />}
      {route === "reset" && <ResetPage lang={lang} />}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
