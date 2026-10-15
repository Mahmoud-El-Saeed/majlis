import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NumberBadge } from '../NumberBadge'

// NumberBadge: circular gold-bordered badge, Western digits, Arabic aria-label.
describe('NumberBadge', () => {
  it('shows the number with an Arabic aria-label', () => {
    render(<NumberBadge n={3} />)
    const badge = screen.getByLabelText('رقم 3')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveTextContent('3')
  })

  it('uses Western digits and a gold border', () => {
    render(<NumberBadge n={12} />)
    const badge = screen.getByLabelText('رقم 12')
    expect(badge.textContent).toBe('12')
    expect(badge.textContent).not.toMatch(/[٠-٩]/)
    expect(badge).toHaveStyle({ borderColor: 'var(--gold)' })
    expect(badge.className).toMatch(/rounded-full/)
  })
})
