import type { DashboardEnrollmentStatus, EnrollmentStatus } from '../../api/types'

// Role is a capability level; membership gates check enrollment status,
// never role == "student". Blocked survives promotion; rejected may re-apply.

export function canViewContent(
  status: DashboardEnrollmentStatus | EnrollmentStatus | null | undefined,
): boolean {
  return status === 'owner' || status === 'admin' || status === 'approved'
}

export function canRejoin(status: EnrollmentStatus | null | undefined): boolean {
  // Soft refusal: rejected may re-apply with a (new) code.
  // Per-course ban: blocked cannot rejoin that course.
  return status === 'rejected'
}

const badgeAr: Record<EnrollmentStatus, string> = {
  pending: 'بانتظار',
  approved: 'مقبول',
  rejected: 'مرفوض',
  blocked: 'محظور',
}

// Enrollment badges always show Arabic + english key so backend enum stays visible.
export function enrollmentBadge(status: EnrollmentStatus): string {
  return `${badgeAr[status]} ${status}`
}

const dashboardAr: Record<DashboardEnrollmentStatus, string> = {
  owner: 'مالك',
  admin: 'إداري',
  pending: 'بانتظار',
  approved: 'مقبول',
  rejected: 'مرفوض',
  blocked: 'محظور',
}

// Dashboard course badges: same Arabic + key rule (owner/admin are membership states).
export function dashboardBadge(status: DashboardEnrollmentStatus): string {
  return `${dashboardAr[status]} ${status}`
}
