import { useEffect, useState } from 'react';
import type { PhaseDefinition } from '@/types';
import { normalizePhaseBoundaries } from '@/utils/phases';

/**
 * The phases, told in the weeks the person sees (H0, H1… within a phase),
 * never in the running week number underneath. Each boundary is set in one
 * place only, as the last week of the phase before it; a new phase starts
 * this week.
 */
export function PhaseSettingsModal({ phases, currentWeek, onSave, onClose }: {
  phases: PhaseDefinition[]; currentWeek: number;
  onSave: (phases: PhaseDefinition[]) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => [...phases].sort((a, b) => a.startWeek - b.startWeek));
  const [error, setError] = useState('');
  const change = (next: PhaseDefinition[]) => { setDraft(next); setError(''); };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // A phase's last week moves the next one's start; it stops a week short of
  // the phase after, which keeps at least one week.
  const setLastWeek = (index: number, last: number) => {
    const start = draft[index].startWeek;
    const ceiling = draft[index + 2] ? draft[index + 2].startWeek - start - 2 : Infinity;
    const clamped = Math.max(0, Math.min(last, ceiling));
    change(draft.map((phase, i) => i === index + 1 ? { ...phase, startWeek: start + clamped + 1 } : phase));
  };
  // A new phase starts this week; offered only while the last one began
  // before it (two phases cannot start the same week).
  const canStart = (draft[draft.length - 1]?.startWeek ?? 0) < currentWeek;
  const save = () => {
    try { onSave(normalizePhaseBoundaries(draft)); } catch (e) { setError(e instanceof Error ? e.message : 'Fazları kontrol et.'); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-labelledby="phase-settings-title">
      <button aria-label="Kapat" className="absolute inset-0 bg-black/60 cursor-default" onClick={onClose} />
      <div className="lb-settle relative w-full max-w-lg max-h-[90dvh] lb-scroll overflow-y-auto a-card px-5 pt-5 pb-4 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <h2 id="phase-settings-title" className="a-display text-[34px] leading-none">Fazlar</h2>
          <button onClick={onClose} aria-label="Kapat" className="-mr-2 -mt-1 w-11 h-11 flex items-center justify-center text-(--color-text-secondary)">✕</button>
        </div>
        <p className="mt-3 text-[16px] leading-snug">
          Faz, aynı programla geçen bir dönem. Her fazın haftaları H0’dan sayılır; Geçmiş ve Grafikler her fazı ayrı gösterir, ilerleme de faz içinde karşılaştırılır.
        </p>
        <p className="mt-2 text-[14px] leading-snug text-(--color-text-secondary)">
          Programı değiştirmek kendiliğinden yeni faz açmaz. Fazları değiştirmek antrenmanları ve notları silmez.
        </p>

        <ol className="mt-4 flex flex-col gap-2">
          {draft.map((phase, index) => {
            const next = draft[index + 1];
            const end = next ? next.startWeek - 1 : null;
            const started = currentWeek >= phase.startWeek;
            const lastH = end !== null ? end - phase.startWeek : started ? currentWeek - phase.startWeek : null;
            const status = !started ? 'Henüz başlamadı'
              : end === null || currentWeek <= end ? 'Şu an bu fazdasın' : 'Bitti';
            return (
              <li key={phase.id} className="rounded-[18px] bg-(--color-bg-input) px-4 py-3">
                <div className="flex items-center gap-3">
                  <input value={phase.name} aria-label={`${index + 1}. fazın adı`}
                    onChange={e => change(draft.map(p => p.id === phase.id ? { ...p, name: e.target.value } : p))}
                    className="flex-1 min-w-0 h-11 -ml-1 px-1 bg-transparent text-[19px] font-semibold rounded-lg focus:outline-none focus:bg-(--color-bg-card)" />
                  <span className={`shrink-0 text-[13px] ${status === 'Şu an bu fazdasın' ? 'font-semibold' : 'text-(--color-text-secondary)'}`}>{status}</span>
                </div>
                <p className="lb-figure text-[16px] text-(--color-text-secondary)">
                  {lastH === null ? 'H0’dan başlayacak' : `H0 – H${lastH} · ${lastH + 1} hafta${end === null ? ', sürüyor' : ''}`}
                </p>
                {next && (
                  <label className="mt-2 flex items-center justify-between gap-3">
                    <span className="text-[15px]">Son haftası <span className="text-(--color-text-secondary)">· sonra {next.name || 'sonraki faz'} başlar</span></span>
                    <span className="flex items-center gap-1 shrink-0">
                      <button type="button" aria-label="Bir hafta önce bitir" onClick={() => setLastWeek(index, (end ?? 0) - phase.startWeek - 1)}
                        className="w-10 h-10 rounded-full bg-(--color-bg-card) text-[18px]">−</button>
                      <span className="lb-figure w-14 text-center text-[20px] font-semibold">H{(end ?? 0) - phase.startWeek}</span>
                      <button type="button" aria-label="Bir hafta sonra bitir" onClick={() => setLastWeek(index, (end ?? 0) - phase.startWeek + 1)}
                        className="w-10 h-10 rounded-full bg-(--color-bg-card) text-[18px]">+</button>
                    </span>
                  </label>
                )}
                {index > 0 && (
                  <button type="button" onClick={() => change(draft.filter(p => p.id !== phase.id))}
                    className="mt-1 min-h-11 text-left text-[14px] text-(--color-text-secondary)">
                    Bu fazı kaldır <span className="opacity-80">· haftaları {draft[index - 1].name || 'önceki faza'} katılır</span>
                  </button>
                )}
              </li>
            );
          })}
        </ol>

        {canStart && (
          <>
            <button type="button"
              onClick={() => change([...draft, { id: crypto.randomUUID(), name: `Faz ${draft.length + 1}`, startWeek: currentWeek, endWeek: null }])}
              className="mt-3 w-full h-12 rounded-2xl border border-dashed lb-rule-strong text-[16px] font-medium">
              + Yeni faz başlat
            </button>
            <p className="mt-1.5 text-[13px] text-(--color-text-secondary) text-center">Bu haftadan başlar; bu hafta yeni fazın H0’ı olur.</p>
          </>
        )}

        {error && <p role="alert" className="mt-3 text-[15px]" style={{ color: 'var(--lb-drop)' }}>{error}</p>}
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onClose} className="h-12 px-5 rounded-2xl bg-(--color-bg-input) text-[16px] font-medium">Vazgeç</button>
          <button type="button" onClick={save} className="flex-1 h-12 rounded-2xl bg-(--color-text-primary) text-(--color-bg-primary) text-[16px] font-semibold">Kaydet</button>
        </div>
      </div>
    </div>
  );
}
