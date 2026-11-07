import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { EnrollmentStatusCard, enrollmentStatusHint } from '../EnrollmentStatusCard'
import { EnrollmentBadge } from '../Badges'
import { enrollmentBadge } from '../../features/enrollment/gates'

// Ticket 22: the hint must match the real status — blocked can never pass
// for "awaiting review", rejected points at re-applying with a new code.

const HINTS: Record<string, RegExp> = {
  pending: /بانتظار مراجعة الشيخ/,
  rejected: /مرفوض[\s\S]*رمز جديد/,
  blocked: /حظرك[\s\S]*لا يمكنك إعادة الانضمام/,
}

const STATUSES = ['pending', 'rejected', 'blocked'] as const

describe('enrollment status hints', () => {
  it('each gated status has its own Arabic next step', () => {
    for (const s of STATUSES) {
      const hint = enrollmentStatusHint(s)
      expect(hint).toMatch(HINTS[s])
      for (const other of STATUSES) {
        if (other !== s) expect(hint).not.toEqual(enrollmentStatusHint(other))
      }
    }
  })

  it('status cards carry the badge, the hint and a dashboard way back', () => {
    for (const s of STATUSES) {
      const { unmount } = render(
        <MemoryRouter>
          <EnrollmentStatusCard status={s} />
        </MemoryRouter>,
      )
      expect(screen.getByRole('status')).toHaveTextContent(HINTS[s])
      // The card shows the shared vocabulary's word for the status — not an
      // English key, not another status's word.
      expect(screen.getByText(enrollmentBadge(s), { exact: true })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'إلى لوحتك' })).toBeInTheDocument()
      unmount()
    }
  })

  it('approval has no hint — approved users see content, not status cards', () => {
    expect(enrollmentStatusHint('approved')).toBe('')
  })
})

describe('enrollment badge vocabulary (unchanged contract)', () => {
  it('blocked still reads محظور, never بانتظار', () => {
    const { getByText } = render(<EnrollmentBadge status="blocked" />)
    expect(getByText('محظور')).toBeInTheDocument()
  })
})
