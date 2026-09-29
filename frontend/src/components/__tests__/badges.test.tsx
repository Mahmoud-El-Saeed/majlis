import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EnrollmentBadge, LessonBadge, WindowBadge } from '../Badges'

// Integration: badges render Arabic + english key per MASTER.md.
describe('andalusian badges', () => {
  it('enrollment badge shows Arabic + key', () => {
    render(<EnrollmentBadge status="pending" />)
    expect(screen.getByText(/بانتظار/)).toBeInTheDocument()
    expect(screen.getByText(/pending/)).toBeInTheDocument()
  })

  it('lesson badges cover processing/ready/failed', () => {
    for (const s of ['processing', 'ready', 'failed'] as const) {
      const { unmount } = render(<LessonBadge status={s} />)
      expect(screen.getByText(new RegExp(s))).toBeInTheDocument()
      unmount()
    }
  })

  it('window badges cover open/upcoming/closed', () => {
    for (const s of ['open', 'upcoming', 'closed'] as const) {
      const { unmount } = render(<WindowBadge status={s} />)
      expect(screen.getByText(new RegExp(s))).toBeInTheDocument()
      unmount()
    }
  })
})
