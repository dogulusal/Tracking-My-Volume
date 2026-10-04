import { useState } from 'react';
import { useCloudSync } from '@/hooks/useCloudSync';
import { InstallAppButton } from '@/components/shared/InstallAppButton';

/**
 * The first thing a new person sees when the cloud is on: what the app is
 * for, then signing in. The program guide that follows picks up from here.
 */
export function LoginPromptModal({ invited = false }: { invited?: boolean }) {
  const { signInWithGoogle, authError } = useCloudSync();
  const [isLoading, setIsLoading] = useState(false);

  const handleSignIn = async () => {
    setIsLoading(true);
    await signInWithGoogle();
    setIsLoading(false);
  };

  return (
    <div className="min-h-[100dvh] bg-(--color-bg-primary) text-(--color-text-primary)">
      <main className="min-h-[100dvh] max-w-xl mx-auto flex flex-col px-5 pt-[calc(24px+env(safe-area-inset-top))] pb-[calc(20px+env(safe-area-inset-bottom))]">
        <div className="flex-1 flex flex-col justify-center">
          <p className="text-[15px] text-(--color-text-secondary)">Volume</p>
          <h1 className="a-display text-[clamp(56px,19vw,84px)] leading-[0.95] mt-2">Geçen haftayı geç.</h1>
          <p className="mt-5 text-[17px] leading-snug text-(--color-text-secondary)">
            Her hareketin geçen haftaki rakamını gösterir; sen onu geçmeye çalışırsın.
          </p>
          <p className="mt-3 text-[17px] leading-snug text-(--color-text-secondary)">
            Kayıtların hesabında saklanır; telefon değişse de kaybolmaz.
          </p>
          {invited && (
            <p className="mt-5 a-card px-4 py-3 text-[16px] leading-snug">
              Bir antrenör seni ekibine davet etti. Giriş yapınca davet açılır; kabul edip etmemek sana kalmış.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <button onClick={() => void handleSignIn()} disabled={isLoading}
            className="h-16 rounded-[18px] bg-(--color-text-primary) text-(--color-bg-primary) text-[19px] font-semibold disabled:opacity-50">
            {isLoading ? 'Google’a yönlendiriliyor…' : 'Google ile giriş yap'}
          </button>
          <InstallAppButton className="h-12 rounded-2xl text-[16px] text-(--color-text-secondary)" />
        </div>
        {authError && <p role="alert" className="mt-3 text-[14px]" style={{ color: 'var(--lb-drop)' }}>{authError}</p>}
        <p className="mt-3 text-center text-[13px] text-(--color-text-secondary)">
          <a className="underline underline-offset-2 inline-flex min-h-11 items-center" href={`${import.meta.env.BASE_URL}about.html`}>Uygulama hakkında</a>
          {' · '}
          <a className="underline underline-offset-2 inline-flex min-h-11 items-center" href={`${import.meta.env.BASE_URL}privacy.html`}>Gizlilik politikası</a>
        </p>
      </main>
    </div>
  );
}
