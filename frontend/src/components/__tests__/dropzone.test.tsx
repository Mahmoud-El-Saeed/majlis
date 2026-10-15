import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DropZone } from '../DropZone'

const LABEL = 'ملف (PDF/PNG/JPEG/WEBP — أقصى 100MB)'
const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp'

function pdfFile(name = 'handout.pdf') {
  return new File(['pdf-bytes'], name, { type: 'application/pdf' })
}

/** jsdom has no DataTransfer constructor — build the minimal shape our handlers read. */
function fileDropEvent(files: File[]) {
  return { dataTransfer: { files, types: ['Files'] } }
}

function setInputFiles(input: HTMLInputElement, files: File[]) {
  Object.defineProperty(input, 'files', { value: files, configurable: true })
  fireEvent.change(input)
}

describe('DropZone', () => {
  it('renders a real label (never placeholder-only) linked to the file input', () => {
    render(<DropZone accept={ACCEPT} onFile={() => {}} label={LABEL} />)
    // getByLabelText proves the <label htmlFor> ↔ <input id> association.
    const input = screen.getByLabelText(LABEL)
    expect(input).toHaveAttribute('type', 'file')
    expect(screen.getByText(LABEL)).toBeInTheDocument()
  })

  it('passes the accept string through to the input untouched', () => {
    render(<DropZone accept={ACCEPT} onFile={() => {}} label={LABEL} />)
    expect(screen.getByLabelText(LABEL)).toHaveAttribute('accept', ACCEPT)
  })

  it('forwards picker-selected files via onFile', () => {
    const onFile = vi.fn()
    render(<DropZone accept={ACCEPT} onFile={onFile} label={LABEL} />)
    const input = screen.getByLabelText(LABEL) as HTMLInputElement
    const file = pdfFile()
    setInputFiles(input, [file])
    expect(onFile).toHaveBeenCalledTimes(1)
    expect(onFile).toHaveBeenCalledWith(file)
  })

  it('forwards dropped files via onFile', () => {
    const onFile = vi.fn()
    const { container } = render(<DropZone accept={ACCEPT} onFile={onFile} label={LABEL} />)
    const zone = container.querySelector('.dropzone')!
    const file = pdfFile()
    fireEvent.drop(zone, fileDropEvent([file]))
    expect(onFile).toHaveBeenCalledTimes(1)
    expect(onFile).toHaveBeenCalledWith(file)
  })

  it('performs no validation itself — even disallowed types reach onFile (page validators own rejection)', () => {
    // The lesson/course pages keep their exact format/size rejection messages;
    // DropZone must not pre-filter, so those paths still trigger downstream.
    const onFile = vi.fn()
    render(<DropZone accept={ACCEPT} onFile={onFile} label={LABEL} />)
    const input = screen.getByLabelText(LABEL) as HTMLInputElement
    const exe = new File(['mz'], 'evil.exe', { type: 'application/x-msdownload' })
    setInputFiles(input, [exe])
    expect(onFile).toHaveBeenCalledTimes(1)
    expect(onFile).toHaveBeenCalledWith(exe)
  })

  it('disabled state blocks picker, drop, and marks the input disabled', () => {
    const onFile = vi.fn()
    const { container } = render(<DropZone accept={ACCEPT} onFile={onFile} label={LABEL} disabled />)
    const input = screen.getByLabelText(LABEL) as HTMLInputElement
    expect(input).toBeDisabled()
    const zone = container.querySelector('.dropzone')!
    expect(zone).toHaveAttribute('data-disabled', 'true')
    fireEvent.drop(zone, fileDropEvent([pdfFile()]))
    expect(onFile).not.toHaveBeenCalled()
    fireEvent.click(zone)
    expect(onFile).not.toHaveBeenCalled()
  })

  it('clicking the zone opens the file picker fallback', () => {
    const onFile = vi.fn()
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    try {
      const { container } = render(<DropZone accept={ACCEPT} onFile={onFile} label={LABEL} />)
      fireEvent.click(container.querySelector('.dropzone')!)
      expect(clickSpy).toHaveBeenCalledTimes(1)
    } finally {
      clickSpy.mockRestore()
    }
  })

  it('is keyboard-operable: input stays in tab order with an accessible name', () => {
    render(<DropZone accept={ACCEPT} onFile={() => {}} label={LABEL} />)
    const input = screen.getByLabelText(LABEL) as HTMLInputElement
    input.focus()
    expect(document.activeElement).toBe(input)
    // Visually hidden but never display:none (which would drop it from tab order).
    expect(input).not.toHaveStyle({ display: 'none' })
    expect(input).toHaveClass('dropzone-input')
  })

  it('shows the chosen file name when the parent passes it', () => {
    render(<DropZone accept={ACCEPT} onFile={() => {}} label={LABEL} fileName="handout.pdf" />)
    expect(screen.getByText('handout.pdf')).toBeInTheDocument()
  })

  it('shows nothing chosen when fileName is null', () => {
    render(<DropZone accept={ACCEPT} onFile={() => {}} label={LABEL} fileName={null} />)
    expect(screen.queryByText(/الملف المختار/)).not.toBeInTheDocument()
  })
})
