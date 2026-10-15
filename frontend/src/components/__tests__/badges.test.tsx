import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EnrollmentBadge, LessonBadge, WindowBadge } from '../Badges'

// Integration: badges render Arabic only (Arabic-first UI).
describe('andalusian badges', () => {
  it('enrollment badge shows Arabic only', () => {
    render(<EnrollmentBadge status="pending" />)
    expect(screen.getByText('بانتظار')).toBeInTheDocument()
    expect(screen.queryByText(/pending/)).not.toBeInTheDocument()
  })

  it('lesson badges cover processing/ready/failed in Arabic only', () => {
    const ar: Record<string, string> = { processing: 'يُجهّز', ready: 'جاهز', failed: 'فشل' }
    for (const s of ['processing', 'ready', 'failed'] as const) {
      const { unmount } = render(<LessonBadge status={s} />)
      expect(screen.getByText(ar[s])).toBeInTheDocument()
      expect(screen.queryByText(new RegExp(`\\b${s}\\b`))).not.toBeInTheDocument()
      unmount()
    }
  })

  it('window badges cover open/upcoming/closed in Arabic only', () => {
    const ar: Record<string, string> = { open: 'مفتوح', upcoming: 'لم يبدأ', closed: 'مغلق' }
    for (const s of ['open', 'upcoming', 'closed'] as const) {
      const { unmount } = render(<WindowBadge status={s} />)
      expect(screen.getByText(ar[s])).toBeInTheDocument()
      expect(screen.queryByText(new RegExp(`\\b${s}\\b`))).not.toBeInTheDocument()
      unmount()
    }
  })
})
