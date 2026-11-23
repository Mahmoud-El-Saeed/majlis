import { createClient, type ApiClient } from './client'

// VITE_API_URL is baked at build time. Production (Cloudflare Pages, ticket
// 26) uses the absolute API origin https://api.majlis.elsaeed.dev/api/v1 —
// the backend CORS list allows it from both majlis.elsaeed.dev and the
// pages.dev alias. Compose builds with same-origin /api/v1, which the reverse
// proxy forwards. Dev default hits the API directly at :8000.
export const API_BASE =
  import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1'

let toastSink: (msg: string) => void = () => {}

export function setGlobalToast(fn: (msg: string) => void): void {
  toastSink = fn
}

export const api: ApiClient = createClient({
  baseUrl: API_BASE,
  onToast: (m) => toastSink(m),
})
