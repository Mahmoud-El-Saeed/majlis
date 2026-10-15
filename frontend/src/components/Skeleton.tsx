// Single loading-placeholder dialect: role="status" + Arabic label.
export function Skeleton({ label = 'جار التحميل', className = 'h-24 rounded-2xl' }: { label?: string; className?: string }) {
  return <div className={`skeleton ${className}`} role="status" aria-label={label} />
}
