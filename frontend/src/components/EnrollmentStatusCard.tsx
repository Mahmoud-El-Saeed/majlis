import { Link } from 'react-router-dom'
import { EnrollmentBadge } from './Badges'
import { str } from '../i18n'
import type { EnrollmentStatus } from '../api/types'

// Ticket 22: a gated student opening a course link gets a clear Arabic next
// step instead of silent 403s — pending (wait for the sheikh), rejected
// (re-apply with a new code from the dashboard) or blocked (no way back in).

/** The three statuses that gate content (approved users see the course). */
export type GatedStatus = Exclude<EnrollmentStatus, 'approved'>

const hintByStatus: Record<GatedStatus, string> = {
  pending: str.enrollmentPendingHint,
  rejected: str.enrollmentRejectedHint,
  blocked: str.enrollmentBlockedHint,
}

export function enrollmentStatusHint(status: EnrollmentStatus): string {
  // Approved users see content, not a status card; callers that have not
  // narrowed the status yet still get a total helper.
  return status === 'approved' ? '' : hintByStatus[status]
}

export function EnrollmentStatusCard({ status }: { status: GatedStatus }) {
  return (
    <div className="card rounded-2xl p-5 text-center" data-testid="enrollment-status-card">
      <div className="flex flex-col items-center gap-3">
        <EnrollmentBadge status={status} />
        <p role="status" className="text-sm">
          {enrollmentStatusHint(status)}
        </p>
        <Link to="/dashboard" className="btn-secondary transition-ui rounded-xl px-4 py-1.5 text-sm">
          {str.goToDashboard}
        </Link>
      </div>
    </div>
  )
}
