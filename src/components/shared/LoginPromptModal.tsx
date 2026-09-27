import { useState } from 'react';
import { useCloudSync } from '@/hooks/useCloudSync';

export function LoginPromptModal() {
  const { signInWithGithub, signInWithGoogle } = useCloudSync();
  const [isLoading, setIsLoading] = useState(false);

  const handleSignIn = async (provider: 'github' | 'google') => {
    setIsLoading(true);
    await (provider === 'google' ? signInWithGoogle() : signInWithGithub());
    setIsLoading(false);
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-(--color-bg-card) rounded-lg p-6 w-full max-w-sm border lb-rule shadow-2xl">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-2xl">☁️</span>
          <h3 className="text-base font-semibold">Bulut senkron</h3>
        </div>
        <p className="text-sm text-(--color-text-secondary) mb-5 leading-relaxed">
          Antrenmanların hesabına ve kendi Google Sheet dosyana otomatik kaydedilir. Devam etmek için giriş yap.
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => void handleSignIn('google')}
            disabled={isLoading}
            className="lb-press w-full px-4 py-3 rounded-lg bg-(--color-text-primary) text-(--color-bg-primary) disabled:opacity-50 text-sm font-semibold"
          >
            {isLoading ? 'Yönlendiriliyor...' : 'Google ile Giriş Yap'}
          </button>
          <button onClick={() => void handleSignIn('github')} disabled={isLoading}
            className="lb-press w-full px-4 py-3 rounded-lg border lb-rule disabled:opacity-50 text-sm font-semibold">
            GitHub ile Giriş Yap
          </button>
        </div>
      </div>
    </div>
  );
}
