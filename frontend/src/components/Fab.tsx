type FabIcon = 'plus' | 'key' | 'mail'

function FabGlyph({ icon }: { icon: FabIcon }) {
  // Consistent inline SVG set (Heroicons-style, 24x24, stroke).
  const common = {
    width: 24,
    height: 24,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  } as const
  if (icon === 'key') {
    return (
      <svg {...common} aria-hidden="true">
        <circle cx="8" cy="15" r="4" />
        <path d="M10.9 12.1 21 2m-4 4 3 3" />
      </svg>
    )
  }
  if (icon === 'mail') {
    return (
      <svg {...common} aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </svg>
    )
  }
  return (
    <svg {...common} aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function Fab({
  label,
  icon = 'plus',
  onClick,
  className = '',
  expanded = false,
}: {
  label: string
  icon?: FabIcon
  onClick: () => void
  className?: string
  /** Extended pill (icon + text) for a screen's single primary action. */
  expanded?: boolean
}) {
  if (expanded) {
    return (
      <button
        type="button"
        onClick={onClick}
        // Fixed at the RTL end side (left), clear of content; below modal/toast layers.
        className={`btn-primary transition-ui clickable fixed bottom-6 left-6 z-30 flex cursor-pointer items-center gap-2 rounded-full px-5 py-3 font-bold shadow-lg ${className}`}
      >
        <FabGlyph icon={icon} />
        <span>{label}</span>
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      // Fixed at the RTL end side (left), clear of content; below modal/toast layers.
      className={`btn-primary transition-ui clickable fixed bottom-6 left-6 z-30 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full shadow-lg ${className}`}
    >
      <FabGlyph icon={icon} />
    </button>
  )
}
