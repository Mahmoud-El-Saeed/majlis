import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SearchBox } from '../SearchBox'
import { str } from '../../i18n'

describe('SearchBox placeholder (ticket 24)', () => {
  it('renders the contextual placeholder', () => {
    render(<SearchBox value="" onChange={vi.fn()} placeholder="ابحث في سلاسلك…" />)
    expect(screen.getByLabelText(str.search)).toHaveAttribute('placeholder', 'ابحث في سلاسلك…')
  })

  it('keeps the clear button behaviour', () => {
    const onChange = vi.fn()
    render(<SearchBox value="فقه" onChange={onChange} placeholder="ابحث في سلاسلك…" />)
    fireEvent.click(screen.getByLabelText(str.clearSearch))
    expect(onChange).toHaveBeenCalledWith('')
  })
})
