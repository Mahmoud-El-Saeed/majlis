import { Modal } from './Modal'

// Shared destructive-action confirm (replaces window.confirm everywhere):
// explicit consequence text + danger confirm + safe cancel.
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  busy = false,
}: {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  busy?: boolean
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="muted-t text-sm">{message}</p>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="transition-ui clickable rounded-xl border px-5 py-2 font-bold"
          style={{ borderColor: 'var(--secondary)', color: 'var(--secondary)' }}
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="btn-secondary transition-ui rounded-xl px-5 py-2"
        >
          إلغاء
        </button>
      </div>
    </Modal>
  )
}
