import { describe, expect, it } from 'vitest'
import { canRejoin, canViewContent, enrollmentBadge } from '../gates'

// Seam: enrollment gates — membership checks, never role == student.
// Rejected may re-apply with new code; blocked cannot rejoin that course.

describe('enrollment gates', () => {
  it.each([['owner'], ['admin'], ['approved']] as const)(
    'canViewContent(%s) is true',
    (s) => {
      expect(canViewContent(s)).toBe(true)
    },
  )

  it.each([['pending'], ['rejected'], ['blocked'], [null]] as const)(
    'canViewContent(%s) is false',
    (s) => {
      expect(canViewContent(s)).toBe(false)
    },
  )

  it('rejected may rejoin, blocked may not', () => {
    expect(canRejoin('rejected')).toBe(true)
    expect(canRejoin('blocked')).toBe(false)
    expect(canRejoin('approved')).toBe(false)
    expect(canRejoin('pending')).toBe(false)
  })

  it('badge shows Arabic only', () => {
    const ar: Record<string, string> = {
      pending: 'بانتظار',
      approved: 'مقبول',
      rejected: 'مرفوض',
      blocked: 'محظور',
    }
    for (const s of ['pending', 'approved', 'rejected', 'blocked'] as const) {
      expect(enrollmentBadge(s)).toBe(ar[s])
    }
  })
})
