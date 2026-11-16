import { fieldCls, fieldStyle } from '../pages/Auth'
import { str } from '../i18n'

// Shared client-side search field: label بحث, ✕ clear button only when
// non-empty, same look as the other inputs (fieldCls/fieldStyle).
// Ticket 24: the placeholder is required so every search input is
// discoverable; call sites supply the surface-specific Arabic copy.
export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm">{str.search}</span>
      <span className="relative block">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={str.search}
          placeholder={placeholder}
          dir="auto"
          className={value ? `${fieldCls} ps-10` : fieldCls}
          style={fieldStyle}
        />
        {value && (
          <button
            type="button"
            aria-label={str.clearSearch}
            onClick={() => onChange('')}
            className="transition-ui clickable absolute start-2 top-1/2 -translate-y-1/2 rounded-lg border px-2 py-0.5 text-sm"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}
          >
            ✕
          </button>
        )}
      </span>
    </label>
  )
}
