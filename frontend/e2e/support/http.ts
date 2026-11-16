import type { Route } from '@playwright/test'

// Shared fake-API plumbing: every mocked e2e spec answers JSON with CORS
// headers, so the shape lives here once instead of per spec.
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
}

export function json(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: { ...CORS_HEADERS },
    body: JSON.stringify(body),
  })
}
