import * as Dialog from '@radix-ui/react-dialog'
import styles from '../styles/components/ConfirmModal.module.css'

// Small reusable confirmation dialog. Built on Radix so it traps focus + closes on
// Esc/overlay like the other modals. `danger` tints the confirm button for destructive
// actions (e.g. leaving a workspace, which discards the in-progress attempt).
export default function ConfirmModal({
  open,
  onOpenChange,
  title,
  message,
  confirmLabel = '확인',
  cancelLabel = '취소',
  onConfirm,
  danger = false,
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content} aria-describedby={undefined}>
          <Dialog.Title className={styles.title}>{title}</Dialog.Title>
          {message && <p className={styles.message}>{message}</p>}
          <div className={styles.actions}>
            <button className="btn btn--ghost" onClick={() => onOpenChange(false)}>
              {cancelLabel}
            </button>
            <button
              className={`btn ${danger ? styles.danger : 'btn--primary'}`}
              onClick={onConfirm}
              autoFocus
            >
              {confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
