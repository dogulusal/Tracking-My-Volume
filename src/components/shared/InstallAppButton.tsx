import { useEffect, useState } from 'react';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Chrome fires this once, early, and never again for the page. Listen at import
// time so the event is kept even when the button mounts after it fired.
let deferredPrompt: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(fn => fn());
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => { deferredPrompt = null; notify(); });
}

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches
  || (navigator as Navigator & { standalone?: boolean }).standalone === true;

// iPadOS reports itself as a Mac, so touch support tells the two apart.
const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/**
 * "Install on phone": the one-tap browser prompt where the browser offers one
 * (Android Chrome), otherwise the steps for Add to Home Screen. Hidden once the
 * app is running from the home screen.
 */
export function InstallAppButton({ className }: { className: string }) {
  const [, rerender] = useState(0);
  const [showSteps, setShowSteps] = useState(false);

  useEffect(() => {
    const update = () => rerender(n => n + 1);
    listeners.add(update);
    return () => { listeners.delete(update); };
  }, []);

  if (isStandalone()) return null;

  const handleClick = async () => {
    if (!deferredPrompt) { setShowSteps(true); return; }
    const prompt = deferredPrompt;
    await prompt.prompt();
    await prompt.userChoice;
    deferredPrompt = null;
    notify();
  };

  const ios = isIos();

  return (
    <>
      <button type="button" onClick={() => void handleClick()} className={className}>Telefona kur</button>
      {showSteps && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowSteps(false)} />
          <div role="dialog" aria-modal="true" aria-labelledby="install-title"
            className="relative bg-(--color-bg-card) text-(--color-text-primary) rounded-lg p-6 max-w-sm w-full border lb-rule shadow-xl">
            <h3 id="install-title" className="text-lg font-semibold mb-3">Telefona kur</h3>
            <ol className="list-decimal pl-5 space-y-2 text-sm text-(--color-text-secondary) mb-4">
              {ios ? <>
                <li>Bu sayfayı <span className="text-(--color-text-primary)">Safari</span>’de aç.</li>
                <li>Alttaki <span className="text-(--color-text-primary)">Paylaş</span> düğmesine (kare ve yukarı ok) dokun.</li>
                <li><span className="text-(--color-text-primary)">Ana Ekrana Ekle</span>’yi seç, sonra <span className="text-(--color-text-primary)">Ekle</span>.</li>
              </> : <>
                <li>Bu sayfayı telefonda <span className="text-(--color-text-primary)">Chrome</span>’da aç.</li>
                <li>Sağ üstteki <span className="text-(--color-text-primary)">⋮</span> menüsüne dokun.</li>
                <li><span className="text-(--color-text-primary)">Uygulamayı yükle</span> ya da <span className="text-(--color-text-primary)">Ana ekrana ekle</span>’yi seç.</li>
              </>}
            </ol>
            <p className="text-xs text-(--color-text-secondary) mb-5">
              Ana ekranda “Volume” simgesiyle açılır; verilerin aynı hesapta kalır.
            </p>
            <div className="flex justify-end">
              <button onClick={() => setShowSteps(false)} className="lb-press px-4 py-2 rounded-md text-sm font-medium border lb-rule">
                Tamam
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
