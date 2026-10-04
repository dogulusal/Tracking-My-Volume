import { useEffect, useId } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  confirmVariant?: 'danger' | 'primary';
}

export function Modal({ isOpen, onClose, onConfirm, title, message, confirmText = 'Onayla', confirmVariant = 'primary' }: ModalProps) {
  const id = useId();

  // Esc is İptal, as tapping outside is.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div role="alertdialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-message`}
        className="relative bg-(--color-bg-card) rounded-lg p-6 max-w-sm w-full border lb-rule shadow-xl">
        <h3 id={`${id}-title`} className="text-lg font-semibold mb-2">{title}</h3>
        <p id={`${id}-message`} className="text-(--color-text-secondary) text-sm mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="lb-press px-4 py-2 rounded-md text-sm font-medium border lb-rule"
          >
            İptal
          </button>
          <button
            onClick={onConfirm}
            className="lb-press px-4 py-2 rounded-md text-sm font-semibold border"
            style={confirmVariant === 'danger'
              ? { borderColor: 'var(--lb-drop)', color: 'var(--lb-drop)' }
              : { background: 'var(--color-text-primary)', color: 'var(--color-bg-primary)', borderColor: 'transparent' }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
