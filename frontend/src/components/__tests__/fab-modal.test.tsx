import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { Fab } from '../Fab'
import { Modal } from '../Modal'
import { ConfirmDialog } from '../ConfirmDialog'

describe('Fab', () => {
  it('renders an accessible icon button and fires onClick', () => {
    const onClick = vi.fn()
    render(<Fab label="سلسلة جديدة" onClick={onClick} />)
    const btn = screen.getByRole('button', { name: 'سلسلة جديدة' })
    expect(btn).toHaveClass('cursor-pointer')
    fireEvent.click(btn)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('expanded renders icon + visible text label', () => {
    const onClick = vi.fn()
    render(<Fab label="انضم برمز السلسلة" expanded onClick={onClick} />)
    const btn = screen.getByRole('button', { name: 'انضم برمز السلسلة' })
    expect(btn).toHaveTextContent('انضم برمز السلسلة')
    expect(btn.querySelector('svg')).toBeInTheDocument()
    fireEvent.click(btn)
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

describe('Modal', () => {
  it('renders title + children as a dialog', () => {
    render(
      <Modal title="سلسلة جديدة" onClose={() => {}}>
        <p>form here</p>
      </Modal>,
    )
    expect(screen.getByRole('dialog', { name: 'سلسلة جديدة' })).toBeInTheDocument()
    expect(screen.getByText('form here')).toBeInTheDocument()
  })

  it('closes on Escape and on overlay click, but not on panel click', () => {
    const onClose = vi.fn()
    const { container } = render(
      <Modal title="t" onClose={onClose}>
        <p>body</p>
      </Modal>,
    )
    fireEvent.click(screen.getByText('body'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    const overlay = container.querySelector('[aria-hidden="true"]')
    if (overlay) fireEvent.click(overlay)
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('traps Tab on the last focusable back to first (and Shift+Tab reverses)', () => {
    render(
      <Modal title="t" onClose={() => {}}>
        <button type="button">one</button>
        <button type="button">two</button>
      </Modal>,
    )
    const first = screen.getByRole('button', { name: 'إغلاق' })
    const last = screen.getByRole('button', { name: 'two' })
    last.focus()
    expect(document.activeElement).toBe(last)
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(first)
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })

  it('returns focus to the opener after unmount', () => {
    function Opener() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            open it
          </button>
          {open && (
            <Modal title="t" onClose={() => setOpen(false)}>
              <p>body</p>
            </Modal>
          )}
        </>
      )
    }
    render(<Opener />)
    const opener = screen.getByRole('button', { name: 'open it' })
    opener.focus()
    fireEvent.click(opener)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.activeElement).toBe(opener)
  })
})

describe('ConfirmDialog', () => {
  it('renders title + message and wires confirm/cancel', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(
      <ConfirmDialog
        title="حذف السلسلة"
        message="سيتم حذف السلسلة نهائيًا"
        confirmLabel="حذف نهائي"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    )
    expect(screen.getByRole('dialog', { name: 'حذف السلسلة' })).toBeInTheDocument()
    expect(screen.getByText('سيتم حذف السلسلة نهائيًا')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'حذف نهائي' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'إلغاء' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('disables confirm while busy', () => {
    render(
      <ConfirmDialog
        title="حذف السلسلة"
        message="سيتم حذف السلسلة نهائيًا"
        confirmLabel="حذف نهائي"
        onConfirm={() => {}}
        onCancel={() => {}}
        busy
      />,
    )
    expect(screen.getByRole('button', { name: 'حذف نهائي' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'إلغاء' })).toBeEnabled()
  })
})
