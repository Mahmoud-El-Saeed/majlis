import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { GoldFoil } from '../GoldFoil'

let mockedReducedMotion: boolean | null = false

vi.mock('motion/react', async (importOriginal) => {
  const mod = await importOriginal<typeof import('motion/react')>()
  return { ...mod, useReducedMotion: () => mockedReducedMotion }
})

describe('GoldFoil', () => {
  it('renders children unchanged with zero semantic/layout impact', () => {
    const { container } = render(
      <GoldFoil>
        <span>الكتاب الأساسي</span>
      </GoldFoil>,
    )
    expect(screen.getByText('الكتاب الأساسي')).toBeInTheDocument()
    // Inline wrapper (span, not a block div) so flow inside the badge row is untouched.
    const wrap = container.querySelector('.gold-foil')
    expect(wrap?.tagName).toBe('SPAN')
    // No landmarks, roles, buttons, or links introduced.
    expect(container.querySelector('[role]')).toBeNull()
    expect(container.querySelector('button, a')).toBeNull()
  })

  it('decorative sheen layer is aria-hidden and does not capture input', () => {
    const { container } = render(
      <GoldFoil>
        <span>الكتاب الأساسي</span>
      </GoldFoil>,
    )
    const layers = container.querySelectorAll('.gold-foil-sheen')
    expect(layers).toHaveLength(1)
    expect(layers[0]).toHaveAttribute('aria-hidden', 'true')
    expect(layers[0].textContent).toBe('')
  })

  it('tracks pointer position through CSS vars and settles back on leave', async () => {
    const { container } = render(
      <GoldFoil>
        <span>الكتاب الأساسي</span>
      </GoldFoil>,
    )
    const wrap = container.querySelector('.gold-foil') as HTMLElement
    vi.spyOn(wrap, 'getBoundingClientRect').mockReturnValue({
      width: 100,
      height: 20,
      left: 0,
      top: 0,
      right: 100,
      bottom: 20,
      x: 0,
      y: 0,
      toJSON: () => {},
    })
    fireEvent.pointerMove(wrap, { clientX: 80, clientY: 10 })
    await waitFor(() => {
      expect(wrap.style.getPropertyValue('--foil-x')).not.toBe('')
    })
    // Children survive interaction untouched.
    expect(screen.getByText('الكتاب الأساسي')).toBeInTheDocument()
    fireEvent.pointerLeave(wrap)
    expect(screen.getByText('الكتاب الأساسي')).toBeInTheDocument()
  })

  it('static output under reduced-motion: plain surface, no motion vars', () => {
    mockedReducedMotion = true
    try {
      const { container } = render(
        <GoldFoil>
          <span>الكتاب الأساسي</span>
        </GoldFoil>,
      )
      const wrap = container.querySelector('.gold-foil') as HTMLElement
      expect(wrap).toHaveClass('gold-foil--static')
      expect(wrap.getAttribute('style')).toBeNull()
      // Sheen layer still present for DOM parity but hidden via .gold-foil--static CSS.
      const layer = container.querySelector('.gold-foil-sheen')
      expect(layer).toHaveAttribute('aria-hidden', 'true')
      // Pointer does nothing static-side.
      fireEvent.pointerMove(wrap, { clientX: 80, clientY: 10 })
      expect(wrap.getAttribute('style')).toBeNull()
      expect(screen.getByText('الكتاب الأساسي')).toBeInTheDocument()
    } finally {
      mockedReducedMotion = false
    }
  })
})
