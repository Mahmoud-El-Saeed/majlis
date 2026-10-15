import { Link, Navigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/http'
import { Skeleton } from './Skeleton'
import type { EnrollmentOut } from '../api/types'
import { canViewContent } from '../features/enrollment/gates'
import { enrollmentBadge } from '../features/enrollment/gates'
import { useAuth } from '../features/auth/AuthContext'

// Gates check membership/capability, never role == "student".
// Exception (ADR-0007): exam TAKING is student-only; writers use preview.

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <Skeleton label="جار التحقق" className="mx-auto mt-28 h-16 max-w-md rounded-2xl" />
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />
  return <>{children}</>
}

export function RequireTeacher({ children }: { children: React.ReactNode }) {
  const { user, loading, isTeacher } = useAuth()
  const loc = useLocation()
  if (loading) return <Skeleton label="جار التحقق" className="mx-auto mt-28 h-16 max-w-md rounded-2xl" />
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />
  if (!isTeacher) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

// Writer = teacher capability (spec name). Same gate as RequireTeacher.
export const RequireWriter = RequireTeacher

// Approved = per-course trust (spec name). Checks my-enrollment membership,
// never role. Renders pending/blocked states instead of blank content.
export function RequireApproved({
  courseId,
  children,
}: {
  courseId: string
  children: React.ReactNode
}) {
  const { user, loading } = useAuth()
  const loc = useLocation()
  const enrollment = useQuery({
    queryKey: ['my-enrollment', courseId],
    queryFn: () => api.get<EnrollmentOut | null>(`/courses/${courseId}/my-enrollment`),
    retry: false,
  })
  if (loading || enrollment.isPending) return <Skeleton label="جار التحقق" className="mx-auto mt-28 h-16 max-w-md rounded-2xl" />
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />
  const status = enrollment.data === null ? null : (enrollment.data?.status ?? null)
  if (!canViewContent(status ?? undefined)) {
    return (
      <main className="mx-auto max-w-md px-4 pt-28 text-center">
        <div className="card rounded-2xl p-5">
          {status ? (
            <p>
              {enrollmentBadge(status)} — المحتوى للأعضاء المقبولين فقط
            </p>
          ) : (
            <>
              <p>لم تنضم بعد — استخدم صندوق الانضمام في لوحتك.</p>
              <Link to="/dashboard" className="btn-primary transition-ui mt-3 inline-block rounded-xl px-4 py-1.5">
                إلى لوحتك للانضمام
              </Link>
            </>
          )}
        </div>
      </main>
    )
  }
  return <>{children}</>
}

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, loading, isAdmin } = useAuth()
  const loc = useLocation()
  if (loading) return <Skeleton label="جار التحقق" className="mx-auto mt-28 h-16 max-w-md rounded-2xl" />
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />
  if (!isAdmin) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}
