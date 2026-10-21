// Typed API transport for Majlis backend (/api/v1).
// Bearer + silent refresh (both tokens rotate), 429 Arabic toast, CSV blob.
// Backend messages stay English; frontend maps to Arabic via i18n.ts.
import { str } from '../i18n'

export class ApiError extends Error {
  status: number
  detail: string
  constructor(status: number, detail: string) {
    super(detail)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

export const ACCESS_KEY = 'mj_access'
export const REFRESH_KEY = 'mj_refresh'

export function getAccessToken(): string | null {
  try {
    return localStorage.getItem(ACCESS_KEY)
  } catch {
    return null
  }
}

export function getRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_KEY)
  } catch {
    return null
  }
}

export function setTokens(access: string, refresh: string): void {
  try {
    localStorage.setItem(ACCESS_KEY, access)
    localStorage.setItem(REFRESH_KEY, refresh)
  } catch {
    /* storage unavailable (tests/SSR) — ignore */
  }
}

export function clearTokens(): void {
  try {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
  } catch {
    /* ignore */
  }
}

type ClientOpts = {
  baseUrl: string
  onToast: (msg: string) => void
}

type JsonBody = Record<string, unknown> | unknown[] | null

type ValidationIssue = { msg?: unknown }

async function parseDetail(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { detail?: unknown }
    if (typeof data?.detail === 'string') return data.detail
    // A 422 lists one validation message per field instead of a single
    // string. They are joined one per line so the catalog can translate
    // each of them on its own.
    if (Array.isArray(data?.detail)) {
      const messages = data.detail
        .map((issue) =>
          typeof issue === 'object' && issue !== null
            ? (issue as ValidationIssue).msg
            : undefined,
        )
        .filter((msg): msg is string => typeof msg === 'string' && msg.length > 0)
      if (messages.length > 0) return messages.join('\n')
    }
    return `HTTP ${res.status}`
  } catch {
    return `HTTP ${res.status}`
  }
}

export function createClient(opts: ClientOpts) {
  const base = opts.baseUrl.replace(/\/$/, '')

  async function refreshTokens(): Promise<boolean> {
    const refresh = getRefreshToken()
    if (!refresh) return false
    try {
      const res = await fetch(`${base}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refresh }),
      })
      if (!res.ok) {
        clearTokens()
        return false
      }
      const data = (await res.json()) as { access_token: string; refresh_token: string }
      setTokens(data.access_token, data.refresh_token)
      return true
    } catch {
      clearTokens()
      return false
    }
  }

  async function request<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
    const headers: Record<string, string> = {
      ...(init.headers as Record<string, string> | undefined),
    }
    const access = getAccessToken()
    if (access) headers['Authorization'] = `Bearer ${access}`
    if (init.body !== undefined && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json'
    }
    const res = await fetch(`${base}${path}`, { ...init, headers })

    if (res.status === 401 && !retried && !path.endsWith('/auth/refresh')) {
      const ok = await refreshTokens()
      if (ok) return request<T>(path, init, true)
      throw new ApiError(401, await parseDetail(res))
    }
    if (res.status === 429) {
      opts.onToast(str.tooMany)
      throw new ApiError(429, await parseDetail(res))
    }
    if (!res.ok) {
      throw new ApiError(res.status, await parseDetail(res))
    }
    if (res.status === 204) return undefined as T
    const text = await res.text()
    if (!text) return undefined as T
    return JSON.parse(text) as T
  }

    async function downloadCsvInner(path: string): Promise<Blob> {
      const headers: Record<string, string> = {}
      const access = getAccessToken()
      if (access) headers['Authorization'] = `Bearer ${access}`
      const res = await fetch(`${base}${path}`, { method: 'GET', headers })
      if (res.status === 401) {
        const ok = await refreshTokens()
        if (ok) return downloadCsvInner(path)
        throw new ApiError(401, await parseDetail(res))
      }
      if (!res.ok) throw new ApiError(res.status, await parseDetail(res))
      return await res.blob()
    }

  return {
    get<T>(path: string): Promise<T> {
      return request<T>(path, { method: 'GET' })
    },
    post<T>(path: string, body?: JsonBody): Promise<T> {
      return request<T>(path, {
        method: 'POST',
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    },
    put<T>(path: string, body?: JsonBody): Promise<T> {
      return request<T>(path, {
        method: 'PUT',
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    },
    patch<T>(path: string, body?: JsonBody): Promise<T> {
      return request<T>(path, {
        method: 'PATCH',
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    },
    delete(path: string): Promise<void> {
      return request<void>(path, { method: 'DELETE' })
    },
    async downloadCsv(path: string): Promise<Blob> {
      return downloadCsvInner(path)
    },
  }
}

export type ApiClient = ReturnType<typeof createClient>
