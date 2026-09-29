import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ChatStubPage, VaultStubPage } from '../Admin'

// Strict stubs: render MASTER.md UI with zero fetch calls.
describe('strict stubs (no backend)', () => {
  it('chat stub shows bubbles, citation, refusal, quota', () => {
    render(
      <MemoryRouter>
        <ChatStubPage />
      </MemoryRouter>,
    )
    expect(screen.getByText(/الاستشهاد/).parentElement?.textContent).toMatch(/الدرس ٣/)
    expect(screen.getByText(/لم يُشرح في الدروس/)).toBeInTheDocument()
    expect(screen.getByText('27 / 30')).toBeInTheDocument()
  })

  it('vault stub shows stub note and no real keys', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    render(
      <MemoryRouter>
        <VaultStubPage />
      </MemoryRouter>,
    )
    expect(screen.getByText(/واجهة تجريبية/)).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})
