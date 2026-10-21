import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ApiError, createClient } from '../client'

// Seam: api/client transport — Bearer + silent refresh (both tokens rotate),
// 429 Arabic toast, CSV blob, 422 vs 400. Fakes at fetch boundary, never network.

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

describe('api client transport', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('attaches Bearer access token', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    const client = createClient({ baseUrl: 'http://api.test/api/v1', onToast: () => {} })
    localStorage.setItem('mj_access', 'A123')
    localStorage.setItem('mj_refresh', 'R123')
    await client.get('/auth/me')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer A123')
  })

  it('silent refresh on 401 rotates BOTH tokens then retries once', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/auth/refresh')) {
        return jsonResponse({ access_token: 'A2', refresh_token: 'R2', token_type: 'bearer' })
      }
      const auth = (init?.headers as Record<string, string> | undefined)?.['Authorization']
      if (auth === 'Bearer A1') {
        return jsonResponse({ detail: 'Not authenticated' }, 401)
      }
      return jsonResponse({ id: 'u1' })
    })
    vi.stubGlobal('fetch', fetchMock)
    const client = createClient({ baseUrl: 'http://api.test/api/v1', onToast: () => {} })
    localStorage.setItem('mj_access', 'A1')
    localStorage.setItem('mj_refresh', 'R1')
    const data = await client.get<{ id: string }>('/auth/me')
    expect(data.id).toBe('u1')
    expect(localStorage.getItem('mj_access')).toBe('A2')
    expect(localStorage.getItem('mj_refresh')).toBe('R2')
  })

  it('429 fires Arabic toast and throws ApiError with status 429', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ detail: 'Too many requests' }, 429)))
    const onToast = vi.fn()
    const client = createClient({ baseUrl: 'http://api.test/api/v1', onToast })
    await expect(client.get('/auth/me')).rejects.toMatchObject({ status: 429 })
    expect(onToast).toHaveBeenCalledTimes(1)
    expect(String(onToast.mock.calls[0][0])).toMatch(/كثيرة|الطلبات|429/)
  })

  it('422 vs 400 both surface English detail for i18n mapping', async () => {
    const calls: Array<{ status: number; detail: string }> = [
      { status: 422, detail: 'password: String should have at least 8 characters' },
      { status: 400, detail: 'Invalid MCQ options' },
    ]
    for (const c of calls) {
      vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ detail: c.detail }, c.status)))
      const client = createClient({ baseUrl: 'http://api.test/api/v1', onToast: () => {} })
      try {
        await client.get('/auth/me')
        expect.unreachable('should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ApiError)
        expect((e as ApiError).status).toBe(c.status)
        expect((e as ApiError).detail).toBe(c.detail)
      }
    }
  })

  it('a 422 detail list keeps every validation message, one per line', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          {
            detail: [
              { loc: ['body', 'password'], msg: 'String should have at least 8 characters' },
              {
                loc: ['body', 'email'],
                msg: 'value is not a valid email address: An email address must have an @-sign.',
              },
            ],
          },
          422,
        ),
      ),
    )
    const client = createClient({ baseUrl: 'http://api.test/api/v1', onToast: () => {} })
    try {
      await client.post('/auth/signup', { email: 'x', password: 'short' })
      expect.unreachable('should throw')
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError)
      const detail = (e as ApiError).detail
      expect(detail.split('\n')).toHaveLength(2)
      expect(detail).toMatch(/at least 8 characters/)
      expect(detail).toMatch(/not a valid email address/)
    }
  })

  it('downloadCsv fetches blob with auth header', async () => {    const fetchMock = vi.fn(
      async () =>
        new Response('a,b\n1,2', {
          status: 200,
          headers: { 'Content-Type': 'text/csv; charset=utf-8' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const client = createClient({ baseUrl: 'http://api.test/api/v1', onToast: () => {} })
    localStorage.setItem('mj_access', 'A9')
    const out = await client.downloadCsv('/courses/c1/gradebook/export')
    expect(out.size).toBeGreaterThan(0)
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer A9')
  })
})
