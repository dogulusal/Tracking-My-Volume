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
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-(--color-bg-card) rounded-lg p-6 max-w-sm w-full border border-(--color-border) shadow-xl">
        <h3 className="text-lg font-bold mb-2">{title}</h3>
        <p className="text-(--color-text-secondary) text-sm mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md text-sm bg-(--color-btn-bg) hover:bg-(--color-btn-hover) transition-colors"
          >
            İptal
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              confirmVariant === 'danger'
                ? 'bg-red-600 hover:bg-red-500 text-white'
                : 'bg-(--color-accent) hover:bg-(--color-accent-hover) text-white'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
