import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { authApi } from "./api/auth";
import { LoginPage, ResetPage, SignupPage, VerifyPage } from "./pages/auth";
import { CoursesPage } from "./pages/courses";
import { CourseDetailPage } from "./pages/course-detail";
import { DashboardPage } from "./pages/dashboard";
import { EnrollmentsPage } from "./pages/enrollments";
import { InviteAcceptPage, InviteCreatePage } from "./pages/invites";
import { LessonDetailPage } from "./pages/lesson-detail";
import { LessonsPage } from "./pages/lessons";
import { dict, dirFor, type Lang } from "./i18n";
import "./styles.css";

function Shell() {
  const [token, setToken] = useState(() => localStorage.getItem("majlis_token") ?? "");
  const [role, setRole] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>("ar");
  const t = dict[lang];
  const navigate = useNavigate();
  const handleToken = (next: string) => {
    setToken(next);
    localStorage.setItem("majlis_token", next);
    if (next) navigate("/dashboard");
  };
  const logout = () => {
    setToken("");
    setRole(null);
    localStorage.removeItem("majlis_token");
    navigate("/login");
  };
  // Role-aware nav: invite creation is admin-only server-side, so the link
  // is advertised only to admins instead of 403ing everyone else.
  useEffect(() => {
    if (!token) {
      setRole(null);
      return;
    }
    authApi
      .me(token)
      .then((me) => setRole(me.role))
      .catch(() => setRole(null));
  }, [token]);
  return (
    <div dir={dirFor(lang)} lang={lang}>
      <nav className="majlis-nav">
        {!token ? (
          <>
            <Link to="/signup">{t.nav_signup}</Link>
            <Link to="/login">{t.nav_login}</Link>
            <Link to="/verify">{t.nav_verify}</Link>
            <Link to="/reset">{t.nav_reset}</Link>
            <Link to="/invite">{t.nav_invite_accept}</Link>
          </>
        ) : (
          <>
            <Link to="/dashboard">{t.nav_dashboard}</Link>
            <Link to="/courses">{t.nav_courses}</Link>
            <Link to="/lessons">{t.nav_lessons}</Link>
            <Link to="/enroll">{t.nav_enroll}</Link>
            {role === "admin" ? (
              <Link to="/invite-create">{t.nav_invite_create}</Link>
            ) : null}
            <button type="button" onClick={logout}>
              {t.nav_logout}
            </button>
          </>
        )}
        <button type="button" onClick={() => setLang(lang === "ar" ? "en" : "ar")}>
          {t.language_toggle}
        </button>
      </nav>
      <div className="majlis-main">
        <Routes>
          <Route path="/signup" element={<SignupPage lang={lang} />} />
          <Route path="/login" element={<LoginPage lang={lang} onToken={handleToken} />} />
          <Route path="/verify" element={<VerifyPage lang={lang} />} />
          <Route path="/reset" element={<ResetPage lang={lang} />} />
          <Route path="/invite" element={<InviteAcceptPage lang={lang} />} />
          <Route path="/dashboard" element={<DashboardPage lang={lang} token={token} />} />
          <Route path="/courses" element={<CoursesPage lang={lang} token={token} />} />
          <Route path="/courses/:id" element={<CourseDetailPage lang={lang} token={token} />} />
          <Route path="/lessons" element={<LessonsPage lang={lang} token={token} />} />
          <Route path="/lessons/:id" element={<LessonDetailPage lang={lang} token={token} />} />
          <Route path="/enroll" element={<EnrollmentsPage lang={lang} token={token} />} />
          <Route
            path="/invite-create"
            element={<InviteCreatePage lang={lang} token={token} />}
          />
          <Route path="/" element={<Navigate to={token ? "/dashboard" : "/signup"} replace />} />
          <Route path="*" element={<Navigate to={token ? "/dashboard" : "/signup"} replace />} />
        </Routes>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  </React.StrictMode>,
);
