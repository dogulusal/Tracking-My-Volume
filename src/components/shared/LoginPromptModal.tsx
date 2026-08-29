import { useState } from 'react';
import { useCloudSync } from '@/hooks/useCloudSync';

interface LoginPromptModalProps {
  onDismiss: () => void;
}

export function LoginPromptModal({ onDismiss }: LoginPromptModalProps) {
  const { signInWithGithub } = useCloudSync();
  const [isLoading, setIsLoading] = useState(false);

  const handleSignIn = async () => {
    setIsLoading(true);
    onDismiss();
    await signInWithGithub();
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onDismiss} />
      <div className="relative bg-(--color-bg-card) rounded-lg p-6 w-full max-w-sm border lb-rule shadow-2xl">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-2xl">☁️</span>
          <h3 className="text-base font-semibold">Bulut senkron</h3>
        </div>
        <p className="text-sm text-(--color-text-secondary) mb-5 leading-relaxed">
          Verilerini birden fazla cihazda senkronize etmek için GitHub hesabınla giriş yap.
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={handleSignIn}
            disabled={isLoading}
            className="lb-press w-full px-4 py-3 rounded-lg bg-(--color-text-primary) text-(--color-bg-primary) disabled:opacity-50 text-sm font-semibold"
          >
            {isLoading ? 'Yönlendiriliyor...' : 'GitHub ile Giriş Yap'}
          </button>
          <button
            onClick={onDismiss}
            className="lb-press w-full px-4 py-3 rounded-lg border lb-rule text-sm font-medium"
          >
            Giriş yapmadan devam et
          </button>
        </div>
      </div>
    </div>
  );
}
