import { useState, type ReactNode } from 'react';

const TOUR_KEY = 'tmv-tur';

/** Whether the tour was already offered on this device (shown or declined). */
export function tourOffered(): boolean {
  try { return localStorage.getItem(TOUR_KEY) !== null; } catch { return true; }
}
export function markTourOffered(answer: 'gosterildi' | 'hayir') {
  try { localStorage.setItem(TOUR_KEY, answer); } catch { /* a per-device nicety only */ }
}

// Small, static pieces of the real screens: each step shows what it talks about.
const Mini = ({ children }: { children: ReactNode }) => (
  <div className="rounded-[20px] bg-(--color-bg-card) px-4 py-3.5" aria-hidden="true">{children}</div>
);
const Fig = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <span className={`lb-figure font-bold ${className}`}>{children}</span>
);

const STEPS: { title: string; text: string; demo: ReactNode }[] = [
  {
    title: 'Geçen haftayı geç',
    text: 'Bugün ekranı sıradaki antrenmanı ve her harekette geçmen gereken rakamı gösterir: geçen hafta o gün yaptığın.',
    demo: (
      <Mini>
        <p className="text-[13px] text-(--color-text-secondary)">Sıradaki</p>
        <p className="a-display text-[40px]">Upper 2</p>
        {[['Bench Press', '75 x 7 +1'], ['Lat Pulldown', '70 x 9 +1']].map(([name, value]) => (
          <div key={name} className="flex justify-between items-baseline py-1.5 border-t border-(--color-border)">
            <span className="text-[15px]">{name}</span><Fig className="text-[20px]">{value}</Fig>
          </div>
        ))}
      </Mini>
    ),
  },
  {
    title: 'Seti gir',
    text: 'Antrenmanda ekranda tek set olur. Kiloyu ve tekrarı − + ile değiştir ya da rakama dokunup yaz.',
    demo: (
      <Mini>
        {[['kg', '75'], ['tekrar', '8']].map(([label, value]) => (
          <div key={label} className="flex items-center justify-between py-1">
            <span className="w-11 h-11 rounded-full bg-(--color-bg-input) flex items-center justify-center text-[22px]">−</span>
            <span className="flex flex-col items-center"><span className="text-[12px] text-(--color-text-secondary)">{label}</span><Fig className="text-[48px] leading-none">{value}</Fig></span>
            <span className="w-11 h-11 rounded-full bg-(--color-bg-input) flex items-center justify-center text-[22px]">+</span>
          </div>
        ))}
      </Mini>
    ),
  },
  {
    title: 'Kaç tekrar daha yapabilirdin?',
    text: 'Seti bitirince cevapla. F: tükendim, +1: bir tekrar daha yapabilirdim. Kayıtta 75 x 8 +1 diye görünür.',
    demo: (
      <Mini>
        <div className="grid grid-cols-4 gap-1 p-1 rounded-2xl bg-(--color-bg-input)">
          {['F', '+1', '+2', '+3'].map(label => (
            <span key={label} className={`h-11 rounded-xl flex items-center justify-center lb-figure text-[20px] font-bold ${label === '+1' ? 'bg-(--color-text-primary) text-(--color-bg-primary)' : 'text-(--color-text-secondary)'}`}>{label}</span>
          ))}
        </div>
        <p className="mt-2.5 text-[14px]"><Fig className="text-[18px]">75 x 8 +1</Fig> <span className="text-(--color-text-secondary)">= 75 kg, 8 tekrar, 1 daha yapabilirdin</span></p>
      </Mini>
    ),
  },
  {
    title: 'Seti bitir, dinlen',
    text: '“Seti bitir” seti işaretler ve dinlenme sayacını başlatır. Süre bitince ses çalar; sıradaki seti ve geçmen gereken rakamı görürsün.',
    demo: (
      <Mini>
        <p className="text-center text-[13px] text-(--color-text-secondary)">Dinlenme</p>
        <p className="text-center"><Fig className="text-[64px] leading-none">1:30</Fig></p>
        <div className="mt-2 flex justify-between items-baseline rounded-2xl bg-(--color-bg-input) px-3 py-2">
          <span className="text-[14px]">Sıradaki · Set 2</span><Fig className="text-[20px]">75 x 6 F</Fig>
        </div>
      </Mini>
    ),
  },
  {
    title: 'Bütün hareketler',
    text: 'Alttaki şerit sıradaki hareketi gösterir; dokununca hepsi açılır. Makine doluysa başka harekete geç ya da yeni hareket ekle.',
    demo: (
      <Mini>
        <div className="flex items-center gap-3 rounded-2xl bg-(--color-bg-input) px-3 py-2">
          <span className="flex-1"><span className="block text-[12px] text-(--color-text-secondary)">Sonra</span><span className="text-[15px] font-semibold">Incline Dumbbell Press</span></span>
          <span className="text-[13px] text-(--color-text-secondary)">Tümü (6)</span>
        </div>
        <p className="mt-2 text-center text-[15px] font-medium">Hareket ekle</p>
      </Mini>
    ),
  },
  {
    title: 'Geçmiş: renkler',
    text: 'Her hücre bir haftanın setleri. Renk, o haftayı bir öncekine göre söyler.',
    demo: (
      <Mini>
        <div className="grid grid-cols-2 gap-1.5">
          {[['75 x 8 +1', 'var(--lb-gain-fill)', 'ilerleme'], ['75 x 7 +1', 'var(--color-bg-input)', 'aynı'], ['75 x 6 F', 'var(--lb-drop-fill)', 'düşüş'], ['60 x 8 F', 'var(--lb-ref-fill)', 'ilk kayıt']].map(([value, fill, label]) => (
            <span key={label} className="rounded-xl px-3 py-2" style={{ background: fill }}>
              <Fig className="block text-[18px]">{value}</Fig>
              <span className="text-[12px] text-(--color-text-secondary)">{label}</span>
            </span>
          ))}
        </div>
      </Mini>
    ),
  },
  {
    title: 'Bitirince',
    text: 'Antrenman bitince gelecek sefer seni bekleyen rakamları görürsün. Her hafta onları geçmeye çalış; 12 tekrara ulaşınca uygulama ağırlığı artırmanı söyler.',
    demo: (
      <Mini>
        <p className="text-[13px] text-(--color-text-secondary)">Gelecek antrenmanda seni bunlar bekliyor</p>
        {[['Bench Press', '75 x 8 +1'], ['Squat', '80 x 10 F']].map(([name, value]) => (
          <div key={name} className="flex justify-between items-baseline py-1.5 border-t border-(--color-border)">
            <span className="text-[15px]">{name}</span><Fig className="text-[20px]">{value}</Fig>
          </div>
        ))}
      </Mini>
    ),
  },
];

/**
 * A short tour of the app, one demo per step. The cross closes it; "Geç"
 * moves on to the next demo.
 */
export function AppTour({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const last = step === STEPS.length - 1;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="tour-title"
      className="fixed inset-0 z-[80] bg-(--color-bg-primary) overflow-y-auto pt-[env(safe-area-inset-top)]">
      <div className="min-h-full max-w-xl mx-auto px-5 pt-3 pb-[calc(24px+env(safe-area-inset-bottom))] flex flex-col">
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5" aria-label={`${step + 1}. adım / ${STEPS.length}`}>
            {STEPS.map((_, index) => (
              <span key={index} className="h-1.5 rounded-full transition-all" style={{ width: index === step ? 20 : 6, background: index <= step ? 'var(--color-text-primary)' : 'var(--color-border)' }} />
            ))}
          </div>
          <button onClick={onClose} aria-label="Turu kapat" className="-mr-2.5 w-11 h-11 flex items-center justify-center">
            <svg aria-hidden="true" className="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div className="flex-1 flex flex-col justify-center py-6">
          {current.demo}
          <h2 id="tour-title" className="a-display text-[40px] mt-7">{current.title}</h2>
          <p className="mt-2 text-[17px] leading-snug text-(--color-text-secondary)">{current.text}</p>
        </div>
        <button onClick={() => (last ? onClose() : setStep(step + 1))}
          className="h-16 rounded-[18px] bg-(--color-text-primary) text-(--color-bg-primary) text-[19px] font-semibold">
          {last ? 'Bitir' : 'Geç'}
        </button>
      </div>
    </div>
  );
}

/** The one-time question after signing up: see the tour or not. */
export function TourOffer({ onAnswer }: { onAnswer: (show: boolean) => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/50" />
      <div role="dialog" aria-modal="true" aria-labelledby="tour-offer-title"
        className="relative w-full max-w-xl mx-auto bg-(--color-bg-card) rounded-t-[22px] px-5 pt-5 pb-[calc(24px+env(safe-area-inset-bottom))]">
        <h2 id="tour-offer-title" className="a-display text-[34px]">Uygulamayı tanıtalım mı?</h2>
        <p className="mt-2 text-[16px] leading-snug text-(--color-text-secondary)">Yaklaşık bir dakika. İstediğin an kapatabilir, ayarlardan sonra tekrar açabilirsin.</p>
        <div className="mt-5 flex flex-col gap-2">
          <button onClick={() => onAnswer(true)} className="h-14 rounded-2xl bg-(--color-text-primary) text-(--color-bg-primary) text-[17px] font-semibold">Göster</button>
          <button onClick={() => onAnswer(false)} className="h-12 rounded-2xl text-[16px] text-(--color-text-secondary)">Hayır, teşekkürler</button>
        </div>
      </div>
    </div>
  );
}
