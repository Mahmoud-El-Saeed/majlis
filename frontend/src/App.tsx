import { Route, Routes } from 'react-router-dom'
import { Navbar } from './components/Navbar'
import { RequireAdmin, RequireAuth, RequireWriter } from './components/Guards'
import { HomePage, NotFoundPage, Footer } from './pages/Home'
import { InviteAcceptPage, LoginPage, ResetPage, SignupPage, VerifyPage } from './pages/Auth'
import { DashboardPage } from './pages/Dashboard'
import { AccountPage } from './pages/Account'
import { CoursePage, LessonPage } from './pages/Course'
import { ExamTakePage } from './pages/ExamTake'
import { MyAttemptsPage } from './pages/MyAttempts'
import { TeachDashboard } from './pages/Teach'
import { CourseManagePage } from './pages/CourseManage'
import { LessonManagePage } from './pages/LessonManage'
import { CodesQueuePage } from './pages/CodesQueue'
import { CourseExamsPage, EssayGradingPage, ExamDetailManagePage, GradebookPage } from './pages/ExamAuthor'
import { AdminPage, ChatStubPage, VaultStubPage } from './pages/Admin'

export default function App() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/verify" element={<VerifyPage />} />
        <Route path="/reset" element={<ResetPage />} />
        <Route path="/invite" element={<InviteAcceptPage />} />

        <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
        <Route path="/account" element={<RequireAuth><AccountPage /></RequireAuth>} />
        <Route path="/courses/:id" element={<RequireAuth><CoursePage /></RequireAuth>} />
        <Route path="/courses/:id/chat" element={<RequireAuth><ChatStubPage /></RequireAuth>} />
        <Route path="/lessons/:id" element={<RequireAuth><LessonPage /></RequireAuth>} />
        <Route path="/exams/:id" element={<RequireAuth><ExamTakePage /></RequireAuth>} />
        <Route path="/exams/:id/mine" element={<RequireAuth><MyAttemptsPage /></RequireAuth>} />

        <Route path="/teach" element={<RequireWriter><TeachDashboard /></RequireWriter>} />
        <Route path="/teach/courses/:id" element={<RequireWriter><CourseManagePage /></RequireWriter>} />
        <Route path="/teach/courses/:id/lessons/:lessonId" element={<RequireWriter><LessonManagePage /></RequireWriter>} />
        <Route path="/teach/courses/:id/codes" element={<RequireWriter><CodesQueuePage /></RequireWriter>} />
        <Route path="/teach/courses/:id/exams" element={<RequireWriter><CourseExamsPage /></RequireWriter>} />
        <Route path="/teach/exams/:examId" element={<RequireWriter><ExamDetailManagePage /></RequireWriter>} />
        <Route path="/teach/exams/:examId/grade" element={<RequireWriter><GradebookPage /></RequireWriter>} />
        <Route path="/teach/exams/:examId/essays" element={<RequireWriter><EssayGradingPage /></RequireWriter>} />

        <Route path="/admin" element={<RequireAdmin><AdminPage /></RequireAdmin>} />
        <Route path="/admin/vault" element={<RequireAdmin><VaultStubPage /></RequireAdmin>} />

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <Footer />
    </>
  )
}
