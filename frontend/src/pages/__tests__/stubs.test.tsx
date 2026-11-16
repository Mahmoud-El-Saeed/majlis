import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { VaultStubPage } from '../Admin'

// Ticket 24: the per-course chat stub route is removed until ticket 12.
// Only the vault stub remains (linked from /admin below).
describe('vault stub (no backend)', () => {
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
