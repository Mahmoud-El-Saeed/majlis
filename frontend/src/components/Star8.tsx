export function Star8({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <g fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="10" y="10" width="20" height="20" />
        <rect x="10" y="10" width="20" height="20" transform="rotate(45 20 20)" />
        <circle cx="20" cy="20" r="2.5" fill="currentColor" stroke="none" />
      </g>
    </svg>
  )
}

export function StarDivider({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3" aria-hidden={label ? undefined : true}>
      <div className="gold-rule flex-1" />
      <span style={{ color: 'var(--gold)' }}>
        <Star8 size={20} />
      </span>
      {label && <span className="font-heading text-sm">{label}</span>}
      <div className="gold-rule flex-1" />
    </div>
  )
}
