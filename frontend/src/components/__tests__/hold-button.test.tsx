import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { HoldButton } from '../HoldButton'

// PointerEvent/capture stubs live in src/test-setup.ts (global).

function renderHold(onFire = vi.fn()) {
  render(
    <HoldButton holdingLabel="holding…" hint="hold hint" onFire={onFire}>
      Hold to test
    </HoldButton>,
  )
  return onFire
}

describe('HoldButton', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('fires after a full keyboard hold and shows the holding label', () => {
    const onFire = renderHold()
    const btn = screen.getByRole('button', { name: 'Hold to test' })
    btn.focus()
    fireEvent.keyDown(btn, { key: 'Enter' })
    expect(btn).toHaveAttribute('aria-busy', 'true')
    // Visible label + fill overlay mirror the same text (overlay aria-hidden).
    expect(screen.getAllByText('holding…')).toHaveLength(2)
    act(() => {
      vi.advanceTimersByTime(1600)
    })
    expect(onFire).toHaveBeenCalledTimes(1)
  })

  it('early release rolls back and never fires', () => {
    const onFire = renderHold()
    const btn = screen.getByRole('button', { name: 'Hold to test' })
    btn.focus()
    fireEvent.keyDown(btn, { key: ' ' })
    act(() => {
      vi.advanceTimersByTime(500)
    })
    fireEvent.keyUp(btn, { key: ' ' })
    expect(btn).toHaveAttribute('aria-busy', 'false')
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(onFire).not.toHaveBeenCalled()
  })

  it('a plain click never fires', () => {
    const onFire = renderHold()
    fireEvent.click(screen.getByRole('button', { name: 'Hold to test' }))
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(onFire).not.toHaveBeenCalled()
  })

  it('disabled blocks the hold', () => {
    const onFire = vi.fn()
    render(
      <HoldButton holdingLabel="holding…" onFire={onFire} disabled>
        Hold to test
      </HoldButton>,
    )
    const btn = screen.getByRole('button', { name: 'Hold to test' })
    expect(btn).toBeDisabled()
    btn.focus()
    fireEvent.keyDown(btn, { key: 'Enter' })
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(onFire).not.toHaveBeenCalled()
  })

  it('exposes the hint for screen readers', () => {
    renderHold()
    expect(screen.getByText('hold hint')).toBeInTheDocument()
  })
})
