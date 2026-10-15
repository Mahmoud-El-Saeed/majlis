import { describe, expect, it, vi, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { Fab } from '../Fab'
import { Modal } from '../Modal'
import { ConfirmDialog } from '../ConfirmDialog'

// PointerEvent/capture stubs live in src/test-setup.ts (global).

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
  afterEach(() => {
    vi.useRealTimers()
  })

  function renderConfirm(props?: { busy?: boolean; onConfirm?: () => void; onCancel?: () => void }) {
    const onConfirm = props?.onConfirm ?? vi.fn()
    const onCancel = props?.onCancel ?? vi.fn()
    const view = render(
      <ConfirmDialog
        title="حذف السلسلة"
        message="سيتم حذف السلسلة نهائيًا"
        confirmLabel="حذف نهائي"
        onConfirm={onConfirm}
        onCancel={onCancel}
        busy={props?.busy}
      />,
    )
    return { ...view, onConfirm: onConfirm as ReturnType<typeof vi.fn>, onCancel: onCancel as ReturnType<typeof vi.fn> }
  }

  it('renders title + message + hold hint, and a plain click does NOT confirm', () => {
    const { onConfirm } = renderConfirm()
    expect(screen.getByRole('dialog', { name: 'حذف السلسلة' })).toBeInTheDocument()
    expect(screen.getByText('سيتم حذف السلسلة نهائيًا')).toBeInTheDocument()
    expect(screen.getByText('اضغط مطولًا للتأكيد')).toBeInTheDocument()
    // Ticket 19: the idle label names the hold explicitly (not the bare action).
    expect(
      screen.getByRole('button', { name: 'اضغط مطولًا — حذف نهائي' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'اضغط مطولًا — حذف نهائي' }))
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('keyboard hold (Enter for the full duration) confirms and shows the timed undo notice', () => {
    vi.useFakeTimers()
    const { onConfirm, onCancel } = renderConfirm()
    const holdBtn = screen.getByRole('button', { name: 'اضغط مطولًا — حذف نهائي' })
    // RTL: fill grows from the inline-start (right) edge.
    const overlay = holdBtn.querySelector('[aria-hidden="true"]')
    expect(overlay?.getAttribute('style')).toContain('inset(0 0 0 100%)')
    holdBtn.focus()
    fireEvent.keyDown(holdBtn, { key: 'Enter' })
    expect(holdBtn).toHaveAttribute('aria-busy', 'true')
    act(() => {
      vi.advanceTimersByTime(1600)
    })
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'حسنًا' })).toBeInTheDocument()
    // Timed notice auto-closes (it only dismisses — the act already fired).
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('manual dismiss closes without acting again', () => {
    vi.useFakeTimers()
    const { onConfirm, onCancel } = renderConfirm()
    const holdBtn = screen.getByRole('button', { name: 'اضغط مطولًا — حذف نهائي' })
    holdBtn.focus()
    fireEvent.keyDown(holdBtn, { key: ' ' })
    act(() => {
      vi.advanceTimersByTime(1600)
    })
    expect(onConfirm).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'حسنًا' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('early release (Space) rolls back and never confirms', () => {
    vi.useFakeTimers()
    const { onConfirm, onCancel } = renderConfirm()
    const holdBtn = screen.getByRole('button', { name: 'اضغط مطولًا — حذف نهائي' })
    holdBtn.focus()
    fireEvent.keyDown(holdBtn, { key: ' ' })
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(onConfirm).not.toHaveBeenCalled()
    fireEvent.keyUp(holdBtn, { key: ' ' })
    expect(holdBtn).toHaveAttribute('aria-busy', 'false')
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(onConfirm).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'اضغط مطولًا — حذف نهائي' })).toBeInTheDocument()
  })

  it('disables the hold button while busy and ignores hold input', () => {
    vi.useFakeTimers()
    const { onConfirm } = renderConfirm({ busy: true })
    const holdBtn = screen.getByRole('button', { name: 'اضغط مطولًا — حذف نهائي' })
    expect(holdBtn).toBeDisabled()
    expect(screen.getByRole('button', { name: 'إلغاء' })).toBeEnabled()
    holdBtn.focus()
    fireEvent.keyDown(holdBtn, { key: 'Enter' })
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
