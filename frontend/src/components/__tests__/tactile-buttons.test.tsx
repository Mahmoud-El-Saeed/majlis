import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MotionConfig } from 'motion/react'
import { DynamicButton } from '../DynamicButton'

// `?raw` CSS imports resolve to empty under vitest, so read the stylesheet
// directly: these are contract tests on the tactile press hooks.
const indexCss = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8')

const IDLE = 'حفظ'
const BUSY = 'جارٍ الحفظ…'
const DONE = 'تم الحفظ'

afterEach(() => {
  document.documentElement.classList.remove('dark')
})

// Ticket 17 tactile buttons: CSS press contract + DynamicButton behavior.
describe('tactile button CSS contract', () => {
  it('wires face color plus a firm edge through tactile depth vars', () => {
    expect(indexCss).toMatch(/\.btn-primary\s*\{[^}]*box-shadow:\s*0\s*var\(--tactile-depth\)\s*0\s*var\(--edge-primary\)/)
    expect(indexCss).toMatch(/\.btn-secondary\s*\{[^}]*box-shadow:\s*0\s*var\(--tactile-depth\)\s*0\s*var\(--edge-secondary\)/)
    expect(indexCss).toMatch(/\.btn-primary\s*\{[^}]*background:\s*var\(--face-primary\)/)
    expect(indexCss).toMatch(/\.btn-secondary\s*\{[^}]*background:\s*var\(--face-secondary\)/)
  })

  it('presses down with collapsed edge and springs back on the tactile ease', () => {
    expect(indexCss).toMatch(/\.btn-primary:active[^{]*\{[^}]*transform:\s*translateY\(var\(--tactile-press\)\)/)
    expect(indexCss).toMatch(/\.btn-primary:active[^{]*\{[^}]*box-shadow:\s*0\s*1px\s*0\s*var\(--edge-primary\)/)
    expect(indexCss).toMatch(/\.btn-secondary:active[^{]*\{[^}]*transform:\s*translateY\(var\(--tactile-press\)\)/)
    expect(indexCss).toMatch(/\.btn-secondary:active[^{]*\{[^}]*box-shadow:\s*0\s*1px\s*0\s*var\(--edge-secondary\)/)
    expect(indexCss).toMatch(/\.btn-primary\s*\{[^}]*transform\s+200ms\s+var\(--ease-tactile\)/)
    expect(indexCss).toMatch(/\.btn-secondary\s*\{[^}]*box-shadow\s+200ms\s+var\(--ease-tactile\)/)
  })

  it('keeps the mode-aware text colors exactly (contrast >= 4.5:1)', () => {
    expect(indexCss).toMatch(/\.btn-primary\s*\{[^}]*color:\s*#fff/)
    expect(indexCss).toMatch(/html\.dark\s+\.btn-primary\s*\{\s*color:\s*#1a1405/)
    expect(indexCss).toMatch(/\.btn-secondary\s*\{[^}]*color:\s*#fff/)
    expect(indexCss).toMatch(/html\.dark\s+\.btn-secondary\s*\{\s*color:\s*#052e22/)
  })

  it('leaves the keyboard focus ring unchanged', () => {
    expect(indexCss).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px\s*solid\s*var\(--primary\)/)
  })
})

describe('DynamicButton', () => {
  const btn = () => screen.getByRole('button')
  // Exit animations linger in jsdom, so the button can briefly hold two
  // labels — assert through the live region instead of the accessible name.
  const liveText = () => btn().querySelector('[aria-live="polite"]')?.textContent ?? ''

  it('hooks into the tactile press via btn-primary / btn-secondary', () => {
    const { unmount } = render(<DynamicButton state="idle" variant="primary" />)
    expect(btn()).toHaveClass('btn-primary')
    expect(liveText()).toContain(IDLE)
    unmount()
    render(<DynamicButton state="idle" variant="secondary" />)
    expect(btn()).toHaveClass('btn-secondary')
    expect(liveText()).toContain(IDLE)
  })

  it('renders in both color modes without inline color overrides', () => {
    const { rerender } = render(<DynamicButton state="idle" variant="primary" />)
    expect(btn().style.color).toBe('')
    document.documentElement.classList.add('dark')
    rerender(<DynamicButton state="idle" variant="primary" />)
    // Mode-aware text color stays owned by CSS; the label survives the toggle.
    expect(btn().style.color).toBe('')
    expect(liveText()).toContain(IDLE)
    rerender(<DynamicButton state="idle" variant="secondary" />)
    expect(btn()).toHaveClass('btn-secondary')
    expect(liveText()).toContain(IDLE)
  })

  it('morphs idle → busy → done on the same button node (no layout shift)', () => {
    const { rerender } = render(<DynamicButton state="idle" />)
    const node = btn()
    expect(node).toHaveClass('overflow-hidden', 'whitespace-nowrap')
    expect(liveText()).toContain(IDLE)
    rerender(<DynamicButton state="busy" />)
    expect(btn()).toBe(node)
    expect(liveText()).toContain(BUSY)
    rerender(<DynamicButton state="done" />)
    expect(btn()).toBe(node)
    expect(liveText()).toContain(DONE)
    // Hidden measurer mirrors the visible label so width animates exactly.
    // (SVGs are aria-hidden too — select the measurer span specifically.)
    const measure = node.querySelector('span[aria-hidden="true"]')
    expect(measure?.textContent).toContain(DONE)
  })

  it('announces each state through aria-live="polite"', () => {
    const { rerender } = render(<DynamicButton state="idle" />)
    const live = () => btn().querySelector('[aria-live]')
    expect(live()).toHaveAttribute('aria-live', 'polite')
    expect(live()?.textContent).toContain(IDLE)
    rerender(<DynamicButton state="busy" />)
    expect(live()).toHaveAttribute('aria-live', 'polite')
    expect(live()?.textContent).toContain(BUSY)
    rerender(<DynamicButton state="done" />)
    expect(live()).toHaveAttribute('aria-live', 'polite')
    expect(live()?.textContent).toContain(DONE)
  })

  it('disables while busy and re-enables when idle or done', () => {
    const { rerender } = render(<DynamicButton state="idle" />)
    expect(btn()).toBeEnabled()
    rerender(<DynamicButton state="busy" />)
    expect(btn()).toBeDisabled()
    expect(btn()).toHaveAttribute('aria-busy', 'true')
    expect(liveText()).toContain(BUSY)
    rerender(<DynamicButton state="done" />)
    expect(btn()).toBeEnabled()
    expect(liveText()).toContain(DONE)
  })

  it('forwards clicks when idle', () => {
    const onClick = vi.fn()
    render(<DynamicButton state="idle" onClick={onClick} />)
    fireEvent.click(btn())
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('renders static under reduced motion', () => {
    render(
      <MotionConfig reducedMotion="always">
        <DynamicButton state="busy" />
        <DynamicButton state="done" variant="secondary" />
      </MotionConfig>,
    )
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(2)
    expect(buttons[0]).toBeDisabled()
    expect(buttons[0].textContent).toContain(BUSY)
    expect(buttons[1]).toBeEnabled()
    expect(buttons[1].textContent).toContain(DONE)
  })
})
