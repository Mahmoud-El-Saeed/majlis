import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AudioPlayer } from '../AudioPlayer'
import { str } from '../../i18n'

function mockMedia() {
  const play = vi
    .spyOn(window.HTMLMediaElement.prototype, 'play')
    .mockImplementation(async function (this: HTMLMediaElement) {
      fireEvent.play(this)
      return Promise.resolve()
    })
  const pause = vi
    .spyOn(window.HTMLMediaElement.prototype, 'pause')
    .mockImplementation(function (this: HTMLMediaElement) {
      fireEvent.pause(this)
    })
  return { play, pause }
}

afterEach(() => {
  vi.restoreAllMocks()
})

async function renderReadyPlayer(fetchUrl = async () => 'https://example.com/lesson.mp3') {
  const onError = vi.fn()
  const ui = render(<AudioPlayer fetchUrl={fetchUrl} onError={onError} />)
  await waitFor(() => {
    expect(ui.container.querySelector('audio')).not.toBeNull()
  })
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const audio = ui.container.querySelector('audio')!
  return { ...ui, audio, onError }
}

describe('AudioPlayer cassette (ticket 17)', () => {
  it('toggles play/pause and keeps the props API working with only fetchUrl', async () => {
    const { play, pause } = mockMedia()
    const { audio } = await renderReadyPlayer()

    const button = screen.getByRole('button', { name: str.play })
    expect(button).toHaveClass('cassette-play')

    fireEvent.click(button)
    expect(play).toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: str.pause })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: str.pause }))
    expect(pause).toHaveBeenCalled()
    expect(audio).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: str.play })).toBeInTheDocument()
  })

  it('shows mm:ss ltr progress and keeps the accessible slider contract', async () => {
    mockMedia()
    const { audio } = await renderReadyPlayer()

    Object.defineProperty(audio, 'duration', { value: 125, configurable: true })
    fireEvent.loadedMetadata(audio)
    expect(await screen.findByText('02:05')).toBeInTheDocument()

    Object.defineProperty(audio, 'currentTime', { value: 65, configurable: true })
    fireEvent.timeUpdate(audio)
    const elapsed = await screen.findByText('01:05')
    expect(elapsed).toBeInTheDocument()
    // RTL page, ltr time labels.
    expect(elapsed.getAttribute('dir')).toBe('ltr')

    const slider = screen.getByLabelText('التقدم')
    expect(slider).toBeInTheDocument()
    expect(slider).toHaveAttribute('aria-valuetext', '01:05 من 02:05')
  })

  it('shows the terracotta failure card and retries with a fresh URL', async () => {
    mockMedia()
    const fetchUrl = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('expired'))
      .mockResolvedValue('https://example.com/fresh.mp3')
    const onError = vi.fn()
    const ui = render(<AudioPlayer fetchUrl={fetchUrl} onError={onError} />)

    expect(await screen.findByText('تعذّر التشغيل')).toBeInTheDocument()
    expect(onError).toHaveBeenCalledWith('تعذّر جلب رابط التشغيل')

    const card = screen.getByText('تعذّر التشغيل').closest('div')
    expect(card).toHaveClass('arch', 'arch-sm', 'card')
    expect(card?.style.borderColor).toBe('var(--secondary)')

    fireEvent.click(screen.getByRole('button', { name: str.retryFreshUrl }))
    await waitFor(() => {
      expect(ui.container.querySelector('audio')).not.toBeNull()
    })
    expect(fetchUrl).toHaveBeenCalledTimes(2)
    // Retry recovered → failure card is gone.
    expect(screen.queryByText('تعذّر التشغيل')).toBeNull()
  })

  it('spins the star reels ONLY while playing and stays static otherwise', async () => {
    mockMedia()
    await renderReadyPlayer()

    const reels = () => screen.getAllByTestId('cassette-reel')
    expect(reels()).toHaveLength(2)
    // Paused: fully static, no spin class on either reel.
    for (const reel of reels()) expect(reel).not.toHaveClass('is-spinning')

    fireEvent.click(screen.getByRole('button', { name: str.play }))
    await screen.findByRole('button', { name: str.pause })
    for (const reel of reels()) expect(reel).toHaveClass('is-spinning')

    fireEvent.click(screen.getByRole('button', { name: str.pause }))
    await screen.findByRole('button', { name: str.play })
    for (const reel of reels()) expect(reel).not.toHaveClass('is-spinning')
  })

  it('pins reel motion to CSS with a reduced-motion kill switch', () => {
    const cssPath = join(process.cwd(), 'src/index.css')
    const css = readFileSync(cssPath, 'utf8')
    const block = css.slice(css.indexOf('Ticket 17 cassette'))
    expect(block.length).toBeGreaterThan(0)
    // Spin is class-driven (no inline animation), keyframes exist…
    expect(block).toMatch(/\.cassette-reel\.is-spinning[^{]*\{[^}]*animation:\s*cassette-spin/)
    expect(block).toMatch(/@keyframes cassette-spin/)
    // …and the cassette block carries its own reduced-motion guard.
    expect(block).toContain('@media (prefers-reduced-motion: reduce)')
    const guard = block.slice(block.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(guard).toMatch(/\.cassette-reel\.is-spinning[\s\S]*?animation:\s*none/)
  })
  it('ticket 19 review: no header block at all — title lives in the page h1', async () => {
    mockMedia()
    const { container } = await renderReadyPlayer()
    // Dead title/pages slots were removed: no head, no crown class, no Side A.
    expect(container.querySelector('.cassette-head')).toBeNull()
    expect(container.querySelector('.cassette-title')).toBeNull()
    expect(container.querySelector('.cassette-pages')).toBeNull()
    expect(container.querySelector('.cassette')?.classList.contains('has-crown')).toBe(false)
    expect(screen.queryByText('Side A')).toBeNull()
  })

  it('ticket 19: seek bar fills RTL like its row (elapsed at start, duration at end)', async () => {
    mockMedia()
    const { container } = await renderReadyPlayer()
    // Elapsed label precedes the slider, duration follows it in DOM order.
    const row = container.querySelector('.cassette .flex.items-center.gap-4')
    expect(row).not.toBeNull()
    const order = Array.from(row!.children).map((el) => el.tagName.toLowerCase())
    expect(order).toEqual(['button', 'span', 'input', 'span'])
    // The slider itself fills right→left to match the RTL label order.
    const css = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8')
    expect(css).toMatch(/\.audio-progress\s*\{\s*direction:\s*rtl/)
  })

  it('ticket 19: no decorative tape hairline — the range is the only bar', async () => {
    mockMedia()
    const { container } = await renderReadyPlayer()
    expect(container.querySelector('.cassette-tape')).toBeNull()
    expect(container.querySelectorAll('.cassette-window [data-testid="cassette-reel"]')).toHaveLength(2)
  })

  it('ticket 19: volume mutes, slides, and persists', async () => {
    mockMedia()
    try {
      localStorage.removeItem('mj_vol')
    } catch {
      /* ignore */
    }
    const { audio } = await renderReadyPlayer()
    const muteBtn = screen.getByRole('button', { name: str.mute })
    expect(audio.volume).toBe(1)

    const slider = screen.getByLabelText(str.volume) as HTMLInputElement
    fireEvent.change(slider, { target: { value: '0.5' } })
    expect(audio.volume).toBeCloseTo(0.5)
    expect(audio.muted).toBe(false)
    expect(localStorage.getItem('mj_vol')).toBe('0.5')

    fireEvent.click(muteBtn)
    expect(audio.muted).toBe(true)
    expect(await screen.findByRole('button', { name: str.unmute })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: str.unmute }))
    expect(audio.muted).toBe(false)
  })
})
