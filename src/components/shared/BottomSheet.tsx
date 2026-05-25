import { useEffect, type ReactNode } from 'react';
import { useIsMobileDevice } from '@/hooks/useIsMobileDevice';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

/**
 * On mobile: slides up from bottom with overlay.
 * On desktop: renders as a centered modal (same as existing Modal pattern).
 */
export function BottomSheet({ isOpen, onClose, title, children }: BottomSheetProps) {
  const isMobile = useIsMobileDevice();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  if (isMobile) {
    return (
      <div className="fixed inset-0 z-[999] flex items-end" onClick={onClose}>
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <div
          className="relative w-full bg-(--color-bg-card) border-t border-(--color-border) rounded-t-2xl animate-slide-up max-h-[85vh] overflow-y-auto pb-[env(safe-area-inset-bottom)]"
          onClick={e => e.stopPropagation()}
        >
          <div className="sticky top-0 bg-(--color-bg-card) pt-3 pb-2 px-5 z-10">
            <div className="w-10 h-1 bg-(--color-border) rounded-full mx-auto mb-3" />
            {title && (
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-extrabold">{title}</h2>
                <button
                  onClick={onClose}
                  className="text-(--color-text-secondary) text-xl p-1"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
          <div className="px-5 pb-5">
            {children}
          </div>
        </div>
      </div>
    );
  }

  // Desktop: centered modal
  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-(--color-bg-card) border border-(--color-border) rounded-2xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-extrabold">{title}</h2>
            <button
              onClick={onClose}
              className="text-(--color-text-secondary) hover:text-(--color-text-primary) text-xl"
            >
              ✕
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
