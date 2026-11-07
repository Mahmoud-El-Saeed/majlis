import { createClient, type ApiClient } from './client'

// VITE_API_URL must match backend CORS FRONTEND_URL origin in prod
// (same-origin /api/v1 via the compose reverse proxy).
// Dev default hits the API directly at :8000.
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
