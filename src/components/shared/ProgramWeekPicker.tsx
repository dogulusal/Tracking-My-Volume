import { useContext, useState } from 'react';
import { AppContext } from '@/context/AppContext';
import { phaseAt, programVersionAt } from '@/utils/programVersions';

/**
 * Which phase and week of the program is shown. Rarely needed, so it stays a
 * single line until opened; the explanation lives inside.
 */
export function ProgramWeekPicker({ week, onChange, allowCopy = false }: { week: number; onChange: (week: number) => void; allowCopy?: boolean }) {
  const ctx = useContext(AppContext)!;
  const [open, setOpen] = useState(false);
  const phase = phaseAt(ctx.state, week) ?? ctx.state.phases[0];
  if (!phase) return null;
  const version = programVersionAt(ctx.state, week);
  const relative = week - phase.startWeek;
  const maxWeek = phase.endWeek === null ? Math.max(1, ctx.state.currentWeek - phase.startWeek + 1, relative) : phase.endWeek - phase.startWeek;
  const selectClass = 'lb-figure block mt-1 h-11 px-3 rounded-xl bg-(--color-bg-input) text-[18px]!';
  return (
    <div className="a-card px-4 mb-5">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="w-full min-h-12 flex items-center justify-between gap-3 text-left">
        <span className="text-[15px]">{phase.name} · H{relative} <span className="text-(--color-text-secondary)">programı</span></span>
        <span className="text-[14px] text-(--color-text-secondary)">{open ? 'Kapat' : 'Faz ve hafta'}</span>
      </button>
      {open && (
        <div className="pb-4 space-y-3">
          <div className="flex flex-wrap gap-3 items-end">
            <label className="text-[13px] text-(--color-text-secondary)">Faz
              <select aria-label="Program fazı" className={selectClass} value={phase.id} onChange={e => onChange(ctx.state.phases.find(p => p.id === e.target.value)!.startWeek)}>
                {ctx.state.phases.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="text-[13px] text-(--color-text-secondary)">Hafta
              <select aria-label="Program haftası" className={selectClass} value={relative} onChange={e => onChange(phase.startWeek + Number(e.target.value))}>
                {Array.from({ length: maxWeek + 1 }, (_, i) => <option key={i} value={i}>H{i}</option>)}
              </select>
            </label>
          </div>
          <p className="text-[13px] leading-snug text-(--color-text-secondary)">{phase.name} · H{relative}: H{version.fromWeek} programı gösteriliyor. Düzenlemeler seçilen haftadan bir sonraki program sürümüne kadar geçerlidir. Diğer fazları ve tamamlanmış antrenmanları değiştirmez.</p>
          {allowCopy && week > 0 && (
            <button className="h-11 px-4 rounded-xl bg-(--color-bg-input) text-[15px] font-medium" onClick={() => ctx.dispatch({ type: 'COPY_PHASE_PROGRAM', payload: { week, sourceWeek: week - 1 } })}>
              Önceki haftanın programını buraya kopyala
            </button>
          )}
          {allowCopy && <p className="text-[13px] leading-snug text-(--color-text-secondary)">Kopyalama yalnızca günleri ve hareket ayarlarını aktarır; antrenman sonucu oluşturmaz.</p>}
        </div>
      )}
    </div>
  );
}
