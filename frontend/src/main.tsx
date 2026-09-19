import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { LoginPage, ResetPage, SignupPage, VerifyPage } from "./pages/auth";

function App() {
  const [route, setRoute] = useState("signup");
  const [, setToken] = useState("");
  return (
    <div dir="rtl" lang="ar" style={{ fontFamily: "system-ui" }}>
      <nav style={{ display: "flex", gap: 12, padding: 16 }}>
        {(["signup", "login", "verify", "reset"] as const).map((r) => (
          <button key={r} onClick={() => setRoute(r)}>
            {r === "signup" ? "حساب جديد" : r === "login" ? "دخول" : r === "verify" ? "تفعيل" : "استعادة"}
          </button>
        ))}
      </nav>
      {route === "signup" && <SignupPage />}
      {route === "login" && <LoginPage onToken={setToken} />}
      {route === "verify" && <VerifyPage />}
      {route === "reset" && <ResetPage />}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
