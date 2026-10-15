import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LessonManagePage } from '../LessonManage'
import { ToastProvider } from '../../components/Toast'
import { str } from '../../i18n'

type ApiState = {
  lessonStatus: string
  audioKey: string | null
  attachments: Array<Record<string, unknown>>
}

function lessonFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'L1',
    course_id: 'C1',
    title: 'درس التجربة',
    description: null,
    lesson_date: null,
    pages_from: null,
    pages_to: null,
    media_type: 'audio',
    status: 'processing',
    attachment_count: 0,
    audio_key: null,
    transcript_voice: null,
    transcript_book: null,
    created_at: null,
    ...overrides,
  }
}

function attachmentFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'A1',
    lesson_id: 'L1',
    title: 'مرفق ١',
    description: null,
    file_key: 'att-k1',
    content_type: 'application/pdf',
    has_file: true,
    created_at: '2026-10-01T00:00:00Z',
    ...overrides,
  }
}

// Mock fetch at the `api` boundary (same seam as auth-errors.test.tsx).
function stubApi(state: ApiState) {
  const mock = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url)
    const method = (init?.method ?? 'GET').toUpperCase()
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), { status })
    if (u.endsWith('/courses/C1') && method === 'GET') {
      return json({ id: 'C1', title: 'سلسلة', book_title: null })
    }
    if (u.endsWith('/lessons/L1') && method === 'GET') {
      return json(lessonFixture({ status: state.lessonStatus, audio_key: state.audioKey }))
    }
    if (u.endsWith('/courses/C1/lessons') && method === 'GET') {
      return json([
        { ...lessonFixture({ status: state.lessonStatus }), attachment_count: state.attachments.length },
      ])
    }
    if (u.endsWith('/courses/C1/lessons/L1/attachments') && method === 'GET') {
      return json(state.attachments)
    }
    if (u.endsWith('/lessons/L1/play') && method === 'GET') {
      return json({ playback_url: 'https://media.test/audio.mp3', expires_in: 3600 })
    }
    if (u.endsWith('/lessons/L1/upload-url') && method === 'POST') {
      return json({ upload_url: 'https://storage.test/put', object_key: 'audio-k1', expires_in: 600 })
    }
    if (u.endsWith('/lessons/L1/confirm') && method === 'POST') {
      state.lessonStatus = 'ready'
      state.audioKey = 'audio-k1'
      return json(lessonFixture({ status: 'ready', audio_key: 'audio-k1' }))
    }
    if (u.includes('/lesson-attachments/') && u.endsWith('/file') && method === 'GET') {
      return json({ file_url: 'https://media.test/file.pdf', expires_in: 3600 })
    }
    if (method === 'DELETE' && u.includes('/lesson-attachments/')) {
      return new Response(null, { status: 204 })
    }
    return json({ detail: 'Not found' }, 404)
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

// LessonUpload PUTs audio via raw XMLHttpRequest (not fetch).
function stubXhrSuccess() {
  class FakeXHR {
    status = 0
    upload: Record<string, unknown> = {}
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    open() {}
    setRequestHeader() {}
    send() {
      this.status = 200
      window.setTimeout(() => this.onload?.(), 0)
    }
  }
  vi.stubGlobal('XMLHttpRequest', FakeXHR)
}

// Duration preloads metadata via `new Audio()` — fire loadedmetadata fast.
function stubAudioDuration(secs: number) {
  class FakeAudio {
    preload = ''
    duration = secs
    private listeners = new Map<string, Set<() => void>>()
    private _src = ''
    set src(v: string) {
      this._src = v
      window.setTimeout(() => {
        for (const fn of this.listeners.get('loadedmetadata') ?? []) fn()
      }, 0)
    }
    get src() {
      return this._src
    }
    addEventListener(t: string, fn: () => void) {
      let s = this.listeners.get(t)
      if (!s) {
        s = new Set()
        this.listeners.set(t, s)
      }
      s.add(fn)
    }
    removeEventListener(t: string, fn: () => void) {
      this.listeners.get(t)?.delete(fn)
    }
    removeAttribute() {}
    load() {}
  }
  vi.stubGlobal('Audio', FakeAudio)
}

function renderManage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/teach/courses/C1/lessons/L1']}>
          <Routes>
            <Route path="/teach/courses/:id/lessons/:lessonId" element={<LessonManagePage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

describe('lesson manage redesign (ticket 19 §3)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('info form is collapsed by default; chevron toggles aria-expanded', async () => {
    stubApi({ lessonStatus: 'processing', audioKey: null, attachments: [] })
    renderManage()
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'بيانات الدرس' })).toBeInTheDocument()
    })
    const toggle = screen.getByRole('button', { name: str.expandInfo })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveAttribute('aria-controls')
    // Collapsed header keeps title + status badge visible — nothing is lost.
    const infoSection = screen.getByRole('region', { name: 'بيانات الدرس' })
    expect(within(infoSection).getByText('درس التجربة')).toBeInTheDocument()
    expect(within(infoSection).getByText('يُجهّز')).toBeInTheDocument()
    // Full form stays hidden until expanded.
    expect(screen.queryByLabelText('العنوان')).not.toBeInTheDocument()
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByLabelText('العنوان')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: str.saveIdle })).toBeInTheDocument()
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByLabelText('العنوان')).not.toBeInTheDocument()
  })

  it('audio summary (badge + mm:ss + replace/delete) appears after successful upload', async () => {
    stubApi({ lessonStatus: 'processing', audioKey: null, attachments: [] })
    stubXhrSuccess()
    stubAudioDuration(95)
    renderManage()
    const audioSection = await screen.findByRole('region', { name: 'الملف الصوتي' })
    // Picker-first UI before any upload.
    const pickerLabel = 'ملف صوتي (V1 صوت فقط ~100–150MB)'
    expect(within(audioSection).getByLabelText(pickerLabel)).toBeInTheDocument()
    const file = new File(['audio-bytes'], 'lesson.mp3', { type: 'audio/mpeg' })
    fireEvent.change(within(audioSection).getByLabelText(pickerLabel), {
      target: { files: [file] },
    })
    fireEvent.click(within(audioSection).getByRole('button', { name: 'رفع وتأكيد' }))
    // Post-upload summary replaces the bare toggle.
    const replaceBtn = await within(audioSection).findByRole('button', { name: str.replaceFile })
    expect(within(audioSection).getByRole('button', { name: str.deleteFile })).toBeInTheDocument()
    expect(within(audioSection).getByText('جاهز')).toBeInTheDocument()
    const dur = await within(audioSection).findByText('01:35')
    expect(dur).toHaveAttribute('dir', 'ltr')
    // Replace reopens the picker.
    fireEvent.click(replaceBtn)
    expect(await within(audioSection).findByLabelText(pickerLabel)).toBeInTheDocument()
  })

  it('attachment rows render as cards with open/replace/delete buttons', async () => {
    stubApi({ lessonStatus: 'ready', audioKey: 'audio-k1', attachments: [attachmentFixture()] })
    stubAudioDuration(65)
    renderManage()
    const title = await screen.findByText('مرفق ١')
    const item = title.closest('li')
    expect(item).not.toBeNull()
    const card = within(item as HTMLElement)
    expect(title).toHaveAttribute('dir', 'auto')
    expect(card.getByText('جاهز')).toBeInTheDocument()
    const openBtn = card.getByRole('button', { name: str.openFile })
    expect(openBtn.className).toContain('btn-secondary')
    expect(openBtn.className).not.toContain('underline')
    expect(card.getByRole('button', { name: str.replaceFile })).toBeInTheDocument()
    expect(card.getByRole('button', { name: str.deleteFile })).toBeInTheDocument()
    // Replace toggles the inline DropZone swap for that row.
    fireEvent.click(card.getByRole('button', { name: str.replaceFile }))
    expect(card.getByLabelText('ملف (PDF/PNG/JPEG/WEBP — أقصى 100MB)')).toBeInTheDocument()
  })

  it('attachment delete still routes through ConfirmDialog hold-to-confirm', async () => {
    const fetchMock = stubApi({
      lessonStatus: 'ready',
      audioKey: 'audio-k1',
      attachments: [attachmentFixture()],
    })
    stubAudioDuration(65)
    renderManage()
    const title = await screen.findByText('مرفق ١')
    const item = title.closest('li') as HTMLElement
    fireEvent.click(within(item).getByRole('button', { name: str.deleteFile }))
    expect(await screen.findByText('حذف المرفق')).toBeInTheDocument()
    expect(screen.getByText(str.holdHint)).toBeInTheDocument()
    const holdBtn = screen.getByRole('button', { name: /حذف نهائي/ })
    const deleteCalls = () =>
      fetchMock.mock.calls.filter(
        ([u, init]) =>
          String(u).includes('/lesson-attachments/A1') && (init as RequestInit)?.method === 'DELETE',
      )
    expect(deleteCalls()).toHaveLength(0)
    // Press-and-hold completes → the existing DELETE flow fires.
    fireEvent.keyDown(holdBtn, { key: 'Enter' })
    await waitFor(() => expect(deleteCalls().length).toBeGreaterThan(0), { timeout: 4000 })
  }, 10000)
})
