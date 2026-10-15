import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { McqOptionsEditor } from '../ExamAuthor'

function Harness({ onChange }: { onChange: (o: string[], c: string) => void }) {
  const [options, setOptions] = useState(['أ', 'ب'])
  const [correct, setCorrect] = useState('0')
  return (
    <McqOptionsEditor
      options={options}
      correctIndex={correct}
      onChange={(o, c) => {
        setOptions(o)
        setCorrect(c)
        onChange(o, c)
      }}
    />
  )
}

describe('McqOptionsEditor (Google-Forms-style)', () => {
  it('adds options up to the cap and removes down to the floor', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    // Remove disabled at floor (2).
    expect(screen.getAllByRole('button', { name: /حذف اختيار/ })[0]).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '+ إضافة اختيار' }))
    expect(onChange).toHaveBeenLastCalledWith(['أ', 'ب', ''], '0')
    // 10 options max.
    for (let i = 0; i < 10; i++) fireEvent.click(screen.getByRole('button', { name: '+ إضافة اختيار' }))
    expect(screen.getByRole('button', { name: '+ إضافة اختيار' })).toBeDisabled()
  })

  it('picks the correct answer via radio and shifts index on remove', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(2)
    fireEvent.click(radios[1])
    expect(onChange).toHaveBeenLastCalledWith(['أ', 'ب'], '1')
    // Grow to 3, then removing the selected first row shifts selection.
    fireEvent.click(screen.getByRole('button', { name: '+ إضافة اختيار' }))
    fireEvent.click(screen.getAllByRole('button', { name: /حذف اختيار/ })[0])
    expect(onChange).toHaveBeenLastCalledWith(['ب', ''], '0')
  })

  it('edits option text per row', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('نص الاختيار 1'), { target: { value: 'ألف' } })
    expect(onChange).toHaveBeenLastCalledWith(['ألف', 'ب'], '0')
  })
})
