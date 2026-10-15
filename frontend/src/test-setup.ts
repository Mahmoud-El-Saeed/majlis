import '@testing-library/jest-dom/vitest'

// jsdom lacks PointerEvent + pointer capture; motion's press gesture builds a
// PointerEvent on keyboard input. Minimal stubs so hold-to-confirm tests run
// without unhandled errors (production browsers have all three natively, and
// the components guard every capture call).
if (typeof window !== 'undefined' && typeof (window as unknown as { PointerEvent?: unknown }).PointerEvent === 'undefined') {
  class PointerEventStub extends Event {
    constructor(type: string, init?: EventInit) {
      super(type, init)
    }
  }
  const scope = window as unknown as { PointerEvent: unknown }
  scope.PointerEvent = PointerEventStub
  ;(globalThis as unknown as { PointerEvent: unknown }).PointerEvent = PointerEventStub
}
for (const proto of [window.HTMLElement?.prototype, window.Element?.prototype]) {
  if (!proto) continue
  const p = proto as unknown as Record<string, unknown>
  if (typeof p['setPointerCapture'] !== 'function') p['setPointerCapture'] = () => {}
  if (typeof p['hasPointerCapture'] !== 'function') p['hasPointerCapture'] = () => false
  if (typeof p['releasePointerCapture'] !== 'function') p['releasePointerCapture'] = () => {}
}
