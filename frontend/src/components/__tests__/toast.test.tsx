import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ToastProvider, useToast } from '../Toast'

function Emit({ message }: { message: string }) {
  const { toast } = useToast()
  return (
    <button type="button" onClick={() => toast(message)}>
      emit
    </button>
  )
}

describe('Toast', () => {
  it('lets each message pick its own direction', () => {
    // The account page can be English inside the Arabic RTL document, so the
    // toast viewport cannot inherit one direction: dir="auto" follows the
    // message itself and no page's direction leaks into an overlay.
    render(
      <ToastProvider>
        <Emit message="Name saved" />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'emit' }))

    expect(screen.getByRole('status')).toHaveAttribute('dir', 'auto')
    expect(screen.getByRole('status')).toHaveTextContent('Name saved')
  })
})
