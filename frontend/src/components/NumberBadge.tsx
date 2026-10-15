import { str } from '../i18n'

// Circular position badge (Western digits): n = index+1 in the FULL ordered
// list, computed before any client-side filtering so numbers stay stable.
export function NumberBadge({ n }: { n: number }) {
  return (
    <span
      aria-label={`${str.itemNumber} ${n}`}
      className="transition-ui inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-bold"
      style={{ borderColor: 'var(--gold)' }}
    >
      <span dir="ltr">{n}</span>
    </span>
  )
}
