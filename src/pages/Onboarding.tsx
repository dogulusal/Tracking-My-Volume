import { useContext, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppContext } from '@/context/AppContext';
import { samplePrograms } from '@/data/sampleProgram';

// Day names offered for each number of training days; any can be renamed.
const SPLITS: Record<number, string[]> = {
  2: ['Tam vücut A', 'Tam vücut B'],
  3: ['Push', 'Pull', 'Legs'],
  4: ['Upper 1', 'Lower 1', 'Upper 2', 'Lower 2'],
  5: ['Upper', 'Lower', 'Push', 'Pull', 'Legs'],
  6: ['Push 1', 'Pull 1', 'Legs 1', 'Push 2', 'Pull 2', 'Legs 2'],
};

type Step = 'welcome' | 'days' | 'names' | 'today';

/**
 * First run: no form to fill. The person says how many days they train and
 * which one is today, and goes straight into that workout; its movements
 * are added while training and become the day's program on save.
 */
export function Onboarding() {
  const ctx = useContext(AppContext);
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('welcome');
  const [names, setNames] = useState<string[]>([]);
  const week = ctx?.state.currentWeek ?? 0;

  const back: Partial<Record<Step, Step>> = { days: 'welcome', names: 'days', today: 'names' };
  const finalNames = names.map((name, index) => name.trim().replace(/\s+/g, ' ') || `Gün ${index + 1}`);

  const start = (todayIndex: number) => {
    if (!ctx) return;
    const now = new Date().toISOString();
    const ids = finalNames.map(() => crypto.randomUUID());
    finalNames.forEach((name, index) => ctx.dispatch({
      type: 'ADD_PROGRAM', atWeek: week,
      payload: { id: ids[index], name, order: index + 1, exercises: [], createdAt: now, updatedAt: now },
    }));
    navigate(`/workout/${ids[todayIndex]}/week/${week}`, { replace: true });
  };

  const useSamples = () => {
    if (!ctx) return;
    const now = new Date().toISOString();
    samplePrograms.forEach(program => ctx.dispatch({
      type: 'ADD_PROGRAM', atWeek: week,
      payload: { ...program, id: crypto.randomUUID(), createdAt: now, updatedAt: now },
    }));
    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-[100dvh] max-w-xl mx-auto flex flex-col px-5 pt-[calc(12px+env(safe-area-inset-top))] pb-[calc(24px+env(safe-area-inset-bottom))]">
      <div className="h-11 flex items-center">
        {back[step] && (
          <button onClick={() => setStep(back[step]!)} aria-label="Geri" className="-ml-2.5 w-11 h-11 flex items-center justify-center">
            <svg aria-hidden="true" className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
        )}
      </div>

      {step === 'welcome' && (
        <>
          <div className="flex-1 flex flex-col justify-center">
            <p className="text-[15px] text-(--color-text-secondary)">Volume</p>
            <h1 className="a-display text-[clamp(56px,19vw,84px)] leading-[0.95] mt-2">Geçen haftayı geç.</h1>
            <p className="mt-5 text-[17px] leading-snug text-(--color-text-secondary)">
              Her hareketin geçen haftaki rakamını gösterir; sen onu geçmeye çalışırsın.
            </p>
            <p className="mt-3 text-[17px] leading-snug text-(--color-text-secondary)">
              Program kurmakla uğraşma: ilk antrenmanını yaparken kendiliğinden kurulur.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <button onClick={() => setStep('days')} className="h-16 rounded-[18px] bg-(--color-text-primary) text-(--color-bg-primary) text-[19px] font-semibold">Başlayalım</button>
            <button onClick={useSamples} className="h-14 rounded-[16px] bg-(--color-bg-card) text-[16px] font-medium">Hazır programla başla</button>
            <Link to="/export" className="h-12 flex items-center justify-center text-[15px] text-(--color-text-secondary)">Yedeğim var, yükleyeceğim</Link>
          </div>
        </>
      )}

      {step === 'days' && (
        <>
          <h1 className="a-display text-[44px] mt-2">Haftada kaç gün antrenman yapıyorsun?</h1>
          <div className="mt-8 grid grid-cols-3 gap-2">
            {[2, 3, 4, 5, 6].map(count => (
              <button key={count} onClick={() => { setNames(SPLITS[count]); setStep('names'); }}
                className="h-24 rounded-[18px] bg-(--color-bg-card) flex flex-col items-center justify-center">
                <span className="a-display text-[44px]">{count}</span>
                <span className="text-[14px] text-(--color-text-secondary)">gün</span>
              </button>
            ))}
          </div>
        </>
      )}

      {step === 'names' && (
        <>
          <h1 className="a-display text-[44px] mt-2">Günlerinin adı</h1>
          <p className="mt-2 text-[16px] text-(--color-text-secondary)">Önerdiklerimizi değiştirebilirsin; sonra da değişir.</p>
          <div className="mt-6 flex flex-col gap-2">
            {names.map((name, index) => (
              <label key={index} className="flex items-center gap-3 h-14 px-4 rounded-2xl bg-(--color-bg-card)">
                <span className="lb-figure w-6 text-[20px] font-semibold text-(--color-text-secondary)">{index + 1}</span>
                <input value={name} onChange={e => setNames(names.map((n, i) => (i === index ? e.target.value : n)))}
                  aria-label={`${index + 1}. günün adı`}
                  className="flex-1 min-w-0 bg-transparent text-[18px]! focus:outline-none" />
              </label>
            ))}
          </div>
          <span className="flex-1 min-h-6" />
          <button onClick={() => setStep('today')} className="mt-6 h-16 rounded-[18px] bg-(--color-text-primary) text-(--color-bg-primary) text-[19px] font-semibold">Devam</button>
        </>
      )}

      {step === 'today' && (
        <>
          <h1 className="a-display text-[44px] mt-2">Bugün hangisini çalışıyorsun?</h1>
          <p className="mt-2 text-[16px] text-(--color-text-secondary)">Doğrudan antrenmana geçeceksin; yaptığın hareketleri orada ekleyeceksin.</p>
          <div className="mt-6 flex flex-col gap-2">
            {finalNames.map((name, index) => (
              <button key={index} onClick={() => start(index)} className="h-16 px-5 rounded-[18px] bg-(--color-bg-card) flex items-center justify-between text-left">
                <span className="text-[19px] font-semibold">{name}</span>
                <svg aria-hidden="true" className="w-5 h-5 text-(--color-text-secondary)" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
