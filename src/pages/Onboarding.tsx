import { useContext, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppContext } from '@/context/AppContext';
import { searchMovements } from '@/data/movementLibrary';
import { muscleRegions, type Region } from '@/data/muscleRegions';
import { exerciseKey } from '@/utils/muscleGroups';
import { AppTour, TourOffer, markTourOffered, tourOffered } from '@/components/shared/AppTour';

// Day names offered for each number of training days, and what that split
// means; any name can be changed.
const SPLITS: Record<number, { names: string[]; about: string }> = {
  2: { names: ['Tam vücut A', 'Tam vücut B'], about: 'İki gün de bütün vücut çalışır, farklı hareketlerle. Her bölge haftada 2 kez.' },
  3: { names: ['Tam vücut A', 'Tam vücut B', 'Tam vücut C'], about: 'Her gün bütün vücut, üç farklı hareket seti. Her bölge haftada 3 kez.' },
  4: { names: ['Upper 1', 'Lower 1', 'Upper 2', 'Lower 2'], about: 'Üst vücut (göğüs, sırt, omuz, kol) ve alt vücut (bacak, kalça, baldır) ikişer kez. Her bölge haftada 2 kez.' },
  5: { names: ['Upper', 'Lower', 'Push', 'Pull', 'Legs'], about: 'Üst, alt; sonra itiş (göğüs, omuz, triceps), çekiş (sırt, biceps) ve bacak. Çoğu bölge haftada 2 kez.' },
  6: { names: ['Push 1', 'Pull 1', 'Legs 1', 'Push 2', 'Pull 2', 'Legs 2'], about: 'İtiş (göğüs, omuz, triceps), çekiş (sırt, arka omuz, biceps) ve bacak ikişer kez. Her bölge haftada 2 kez.' },
};

// The regions shown in the week's coverage, grouped the way people think of them.
const COVERAGE: [string, Region[]][] = [
  ['Göğüs', ['Üst göğüs', 'Göğüs']],
  ['Omuz', ['Ön omuz', 'Yan omuz', 'Arka omuz']],
  ['Sırt', ['Kanat', 'Orta sırt', 'Trapez']],
  ['Kol', ['Biceps', 'Triceps']],
  ['Bacak', ['Ön bacak', 'Arka bacak', 'Kalça']],
  ['Diğer', ['Baldır', 'Karın']],
];

type Step = 'welcome' | 'days' | 'names' | 'moves' | 'sets' | 'today';

/**
 * First run: the person designs their own program, step by step, and learns
 * how while doing it — how many days, what each day trains, which movements,
 * how many sets and reps — then goes straight into today's workout. Weights
 * are found there, in the first sets.
 */
export function Onboarding() {
  const ctx = useContext(AppContext);
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('welcome');
  const [days, setDays] = useState(0);
  const [names, setNames] = useState<string[]>([]);
  const [moves, setMoves] = useState<string[][]>([]);
  const [day, setDay] = useState(0);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const week = ctx?.state.currentWeek ?? 0;
  // With the cloud on, the sign-in screen has already said what the app is for.
  const signedIn = Boolean(ctx?.cloud.configured && ctx.cloud.userId);
  // Right after signing up, the tour is offered once on this device.
  const [tour, setTour] = useState<'offer' | 'open' | null>(() => (tourOffered() ? null : 'offer'));

  const back: Partial<Record<Step, Step>> = { days: 'welcome', names: 'days', moves: 'names', sets: 'moves', today: 'sets' };
  const finalNames = names.map((name, index) => name.trim().replace(/\s+/g, ' ') || `Gün ${index + 1}`);
  const chooseDays = (count: number) => {
    setDays(count);
    setNames(SPLITS[count].names);
    setMoves(SPLITS[count].names.map(() => []));
    setDay(0);
    setStep('names');
  };

  // Days a region is the main work of at least one movement.
  const coverage = (region: Region) => moves.filter(list => list.some(name => muscleRegions(name)[0] === region)).length;
  const results = searchMovements(query, [], 40, name => muscleRegions(name).join(' '));
  const toggleMove = (name: string) => {
    const clean = name.trim().replace(/\s+/g, ' ');
    if (!clean) return;
    setMoves(prev => prev.map((list, index) => {
      if (index !== day) return list;
      const has = list.some(item => exerciseKey(item) === exerciseKey(clean));
      return has ? list.filter(item => exerciseKey(item) !== exerciseKey(clean)) : [...list, clean];
    }));
  };
  const picked = (name: string) => (moves[day] ?? []).some(item => exerciseKey(item) === exerciseKey(name));
  const typedIsNew = query.trim() && !results.library.some(name => exerciseKey(name) === exerciseKey(query));

  const start = (todayIndex: number) => {
    if (!ctx) return;
    const now = new Date().toISOString();
    const ids = finalNames.map(() => crypto.randomUUID());
    finalNames.forEach((name, index) => ctx.dispatch({
      type: 'ADD_PROGRAM', atWeek: week,
      payload: {
        id: ids[index], name, order: index + 1, createdAt: now, updatedAt: now,
        // 3 sets from the bottom of the 8–12 range; the weight is found in the first sets.
        exercises: (moves[index] ?? []).map(movement => ({
          id: crypto.randomUUID(), name: movement, defaultSets: 3, defaultWeight: 0, defaultReps: 8, isActive: true,
        })),
      },
    }));
    navigate(`/workout/${ids[todayIndex]}/week/${week}`, { replace: true });
  };

  const primary = 'h-16 rounded-[18px] bg-(--color-text-primary) text-(--color-bg-primary) text-[19px] font-semibold';
  const lead = 'mt-2 text-[16px] leading-snug text-(--color-text-secondary)';

  return (
    <div className="min-h-[100dvh] max-w-xl mx-auto flex flex-col px-5 pt-[calc(12px+env(safe-area-inset-top))] pb-[calc(24px+env(safe-area-inset-bottom))]">
      <div className="h-11 flex items-center justify-between">
        {back[step] ? (
          <button onClick={() => setStep(back[step]!)} aria-label="Geri" className="-ml-2.5 w-11 h-11 flex items-center justify-center">
            <svg aria-hidden="true" className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
        ) : <span />}
        {step !== 'welcome' && (
          <span className="text-[13px] text-(--color-text-secondary)">Programını kur · {['days', 'names', 'moves', 'sets', 'today'].indexOf(step) + 1}/5</span>
        )}
      </div>

      {step === 'welcome' && (
        <>
          <div className="flex-1 flex flex-col justify-center">
            <p className="text-[15px] text-(--color-text-secondary)">Volume</p>
            <h1 className="a-display text-[clamp(56px,19vw,84px)] leading-[0.95] mt-2">{signedIn ? 'Hoş geldin.' : 'Geçen haftayı geç.'}</h1>
            {!signedIn && (
              <p className="mt-5 text-[17px] leading-snug text-(--color-text-secondary)">
                Her hareketin geçen haftaki rakamını gösterir; sen onu geçmeye çalışırsın.
              </p>
            )}
            <p className={`${signedIn ? 'mt-5' : 'mt-3'} text-[17px] leading-snug text-(--color-text-secondary)`}>
              Önce programını birlikte kuralım: birkaç adımda, her adımda neden öyle olduğunu da anlatarak.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <button onClick={() => setStep('days')} className={primary}>Programımı kuralım</button>
            <Link to="/export" className="h-12 flex items-center justify-center text-[15px] text-(--color-text-secondary)">Yedeğim var, yükleyeceğim</Link>
            {/* Someone who only coaches has no program to set up; the coach's page needs the account. */}
            {signedIn && (
              <Link to="/sporcular" className="h-12 flex items-center justify-center text-[15px] text-(--color-text-secondary)">Antrenörüm, ekibimi takip edeceğim</Link>
            )}
          </div>
        </>
      )}

      {step === 'days' && (
        <>
          <h1 className="a-display text-[42px] mt-2">Haftada kaç gün antrenman yapabilirsin?</h1>
          <p className={lead}>Her hafta gerçekten yapabileceğin kadar seç. Her bölgeyi haftada 2 kez çalıştırmak gelişim için iyi bir başlangıç; gün azsa her günde daha çok bölge çalışırsın.</p>
          <div className="mt-7 grid grid-cols-3 gap-2">
            {[2, 3, 4, 5, 6].map(count => (
              <button key={count} onClick={() => chooseDays(count)}
                className="h-24 rounded-[18px] bg-(--color-bg-card) flex flex-col items-center justify-center"
                style={days === count ? { boxShadow: 'inset 0 0 0 1.5px var(--color-text-primary)' } : undefined}>
                <span className="a-display text-[44px]">{count}</span>
                <span className="text-[14px] text-(--color-text-secondary)">gün</span>
              </button>
            ))}
          </div>
        </>
      )}

      {step === 'names' && (
        <>
          <h1 className="a-display text-[42px] mt-2">Günlerin ne çalışacak?</h1>
          <p className={lead}>{SPLITS[days]?.about} İsimleri değiştirebilirsin.</p>
          <div className="mt-6 flex flex-col gap-2">
            {names.map((name, index) => (
              <label key={index} className="flex items-center gap-3 h-14 px-4 rounded-2xl bg-(--color-bg-card)">
                <span className="lb-figure w-6 text-[20px] font-semibold text-(--color-text-secondary)">{index + 1}</span>
                <input value={name} onChange={e => setNames(names.map((n, i) => (i === index ? e.target.value : n)))}
                  aria-label={`${index + 1}. günün adı`} className="flex-1 min-w-0 bg-transparent text-[18px]! focus:outline-none" />
              </label>
            ))}
          </div>
          <span className="flex-1 min-h-6" />
          <button onClick={() => setStep('moves')} className={`mt-6 ${primary}`}>Devam</button>
        </>
      )}

      {step === 'moves' && (
        <>
          <h1 className="a-display text-[42px] mt-2">Her güne hareket seç</h1>
          <p className={lead}>Bir güne 4–6 hareket yeter. Önce büyük bölgeler (bacak, göğüs, sırt), sonra küçükler (omuz, kol). Aşağıda hangi bölgenin haftada kaç gün çalıştığını görürsün.</p>

          <div className="mt-4 -mx-5 px-5 flex gap-1.5 overflow-x-auto scrollbar-hide">
            {finalNames.map((name, index) => (
              <button key={index} onClick={() => setDay(index)} aria-pressed={day === index}
                className={`shrink-0 h-11 px-4 rounded-full text-[15px] whitespace-nowrap ${day === index ? 'bg-(--color-text-primary) text-(--color-bg-primary) font-semibold' : 'bg-(--color-bg-card) text-(--color-text-secondary)'}`}>
                {name} <span className="lb-figure">· {moves[index]?.length ?? 0}</span>
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-col gap-1.5">
            {(moves[day] ?? []).map(name => (
              <div key={name} className="min-h-12 pl-4 pr-1 rounded-2xl bg-(--color-bg-card) flex items-center gap-3">
                <span className="flex-1 min-w-0 text-[16px] truncate">{name}</span>
                <span className="shrink-0 text-[13px] text-(--color-text-secondary)">{muscleRegions(name)[0] ?? ''}</span>
                <button onClick={() => toggleMove(name)} aria-label={`${name} çıkar`} className="shrink-0 w-11 h-11 flex items-center justify-center text-(--color-text-secondary)">
                  <svg aria-hidden="true" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </div>
            ))}
            <button onClick={() => { setQuery(''); setPicking(true); }} className="h-14 rounded-2xl bg-(--color-bg-card) text-[16px] font-medium"
              style={{ boxShadow: 'inset 0 0 0 1.5px var(--color-border)' }}>
              {finalNames[day]} için hareket ekle
            </button>
          </div>

          <section className="mt-5 a-card px-4 py-3">
            <p className="text-[14px] font-semibold">Haftalık bölge dağılımı</p>
            <p className="text-[13px] text-(--color-text-secondary)">Rakam: o bölgenin ana bölge olduğu gün sayısı. “Yok” olanları bir güne eklemeyi düşün.</p>
            <div className="mt-2 flex flex-col gap-1.5">
              {COVERAGE.map(([group, regions]) => (
                <div key={group} className="flex items-baseline gap-3">
                  <span className="w-12 shrink-0 text-[13px] text-(--color-text-secondary)">{group}</span>
                  <span className="flex flex-wrap gap-1.5">
                    {regions.map(region => {
                      const count = coverage(region);
                      return (
                        <span key={region} className="rounded-full px-2.5 py-1 text-[13px]"
                          style={count ? { background: 'var(--color-bg-input)' } : { boxShadow: 'inset 0 0 0 1px var(--color-border)', color: 'var(--color-text-secondary)' }}>
                          {region} <span className="lb-figure font-semibold">{count ? `${count}×` : 'yok'}</span>
                        </span>
                      );
                    })}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <span className="flex-1 min-h-6" />
          <button onClick={() => setStep('sets')} className={`mt-6 ${primary}`}>Devam</button>
          <button onClick={() => { setMoves(finalNames.map(() => [])); setStep('sets'); }} className="mt-1 h-12 text-[15px] text-(--color-text-secondary)">
            Bu adımı atla, hareketleri antrenmanda eklerim
          </button>
        </>
      )}

      {step === 'sets' && (
        <>
          <h1 className="a-display text-[42px] mt-2">Set, tekrar ve ağırlık</h1>
          <div className="mt-5 flex flex-col gap-2">
            {[
              ['Her hareket 3 set', 'Başlamak için yeterli. Sonra istersen artırırsın.'],
              ['8–12 tekrar, tükenişe yakın', 'Ağırlığını bilmiyorsan ilk sette bul: 8–12 tekrar yapabileceğin, tükenişe yakın çalışabileceğin bir ağırlık seç.'],
              ['“Kaç tekrar daha yapabilirdin?”', 'Her setin sonunda bunu cevapla: F tükendim, +1 bir tekrar daha yapabilirdim…'],
              ['Gelecek hafta: geçen haftayı geç', 'Uygulama her harekette geçmen gereken rakamı gösterir: bir tekrar fazlası, 12’ye ulaşınca biraz daha ağır.'],
            ].map(([title, text]) => (
              <div key={title} className="a-card px-4 py-3">
                <p className="text-[17px] font-semibold">{title}</p>
                <p className="mt-0.5 text-[15px] leading-snug text-(--color-text-secondary)">{text}</p>
              </div>
            ))}
          </div>
          <span className="flex-1 min-h-6" />
          <button onClick={() => setStep('today')} className={`mt-6 ${primary}`}>Anladım</button>
        </>
      )}

      {step === 'today' && (
        <>
          <h1 className="a-display text-[42px] mt-2">Bugün hangisini çalışıyorsun?</h1>
          <p className={lead}>Doğrudan antrenmana geçeceksin. Programını sonra Programlar sayfasından değiştirebilirsin.</p>
          <div className="mt-6 flex flex-col gap-2">
            {finalNames.map((name, index) => (
              <button key={index} onClick={() => start(index)} className="min-h-16 px-5 py-2 rounded-[18px] bg-(--color-bg-card) flex items-center justify-between text-left">
                <span className="flex flex-col">
                  <span className="text-[19px] font-semibold">{name}</span>
                  <span className="text-[14px] text-(--color-text-secondary)">{moves[index]?.length ? `${moves[index].length} hareket` : 'hareketler antrenmanda eklenecek'}</span>
                </span>
                <svg aria-hidden="true" className="w-5 h-5 text-(--color-text-secondary)" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
              </button>
            ))}
          </div>
        </>
      )}

      {tour === 'offer' && step === 'welcome' && (
        <TourOffer onAnswer={show => { markTourOffered(show ? 'gosterildi' : 'hayir'); setTour(show ? 'open' : null); }} />
      )}
      {tour === 'open' && <AppTour onClose={() => setTour(null)} />}

      {/* Picking movements for a day: search, with each one's region; stays open for several. */}
      {picking && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end">
          <button aria-label="Kapat" className="absolute inset-0 bg-black/50 cursor-default" onClick={() => setPicking(false)} />
          <div role="dialog" aria-modal="true" aria-label={`${finalNames[day]} için hareket ekle`}
            className="relative w-full max-w-xl mx-auto max-h-[88vh] flex flex-col bg-(--color-bg-card) rounded-t-[22px] pt-3 pb-[calc(16px+env(safe-area-inset-bottom))]">
            <div className="px-5 flex items-center justify-between gap-3">
              <h2 className="a-display text-[28px] truncate">{finalNames[day]}</h2>
              <button onClick={() => setPicking(false)} className="shrink-0 h-11 px-4 rounded-full bg-(--color-text-primary) text-(--color-bg-primary) text-[15px] font-semibold">
                Tamam · {moves[day]?.length ?? 0}
              </button>
            </div>
            <div className="px-5 mt-3">
              <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Ara: göğüs, squat, lateral…" aria-label="Hareket ara"
                className="w-full h-14 px-4 rounded-2xl bg-(--color-bg-input) text-[18px]! focus:outline-none placeholder:text-(--color-text-secondary)" />
            </div>
            <div className="mt-2 px-5 overflow-y-auto flex flex-col gap-1.5">
              {results.library.map(name => {
                const on = picked(name);
                return (
                  <button key={name} onClick={() => toggleMove(name)} aria-pressed={on}
                    className="min-h-12 px-4 rounded-2xl flex items-center justify-between gap-3 text-left"
                    style={on ? { background: 'var(--color-text-primary)', color: 'var(--color-bg-primary)' } : { background: 'var(--color-bg-input)' }}>
                    <span className="text-[16px] truncate">{name}</span>
                    <span className="shrink-0 text-[13px] opacity-70">{on ? 'eklendi' : muscleRegions(name)[0]}</span>
                  </button>
                );
              })}
              {typedIsNew && (
                <button onClick={() => { toggleMove(query); setQuery(''); }}
                  className={`min-h-12 px-4 rounded-2xl text-left text-[15px] ${results.library.length ? 'text-(--color-text-secondary)' : 'bg-(--color-text-primary) text-(--color-bg-primary) font-semibold'}`}>
                  {results.library.length ? 'Listede yok mu? ' : ''}“{query.trim()}” adıyla ekle
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
