import { useContext } from 'react';
import { AppContext } from '@/context/AppContext';
import { phaseAt, programVersionAt } from '@/utils/programVersions';

export function ProgramWeekPicker({ week, onChange, allowCopy = false }: { week: number; onChange: (week: number) => void; allowCopy?: boolean }) {
  const ctx = useContext(AppContext)!;
  const phase = phaseAt(ctx.state, week) ?? ctx.state.phases[0];
  if (!phase) return null;
  const version = programVersionAt(ctx.state, week);
  const relative = week - phase.startWeek;
  const maxWeek = phase.endWeek === null ? Math.max(1, ctx.state.currentWeek - phase.startWeek + 1, relative) : phase.endWeek - phase.startWeek;
  return <div className="border lb-rule rounded-lg p-4 mb-5 space-y-3">
    <div className="flex flex-wrap gap-3 items-end">
      <label className="text-sm">Faz<select aria-label="Program fazı" className="block mt-1 p-2 border lb-rule rounded bg-(--color-bg-input)" value={phase.id} onChange={e => onChange(ctx.state.phases.find(p => p.id === e.target.value)!.startWeek)}>{ctx.state.phases.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label className="text-sm">Hafta<select aria-label="Program haftası" className="block mt-1 p-2 border lb-rule rounded bg-(--color-bg-input)" value={relative} onChange={e => onChange(phase.startWeek + Number(e.target.value))}>{Array.from({ length: maxWeek + 1 }, (_, i) => <option key={i} value={i}>H{i}</option>)}</select></label>
    </div>
    <p className="lb-label">{phase.name} · H{relative}: H{version.fromWeek} programı gösteriliyor. Düzenlemeler seçilen haftadan bir sonraki program sürümüne kadar geçerlidir. Diğer fazları ve tamamlanmış antrenmanları değiştirmez.</p>
    {allowCopy && week > 0 && <button className="lb-press px-3 py-2 text-sm border lb-rule rounded" onClick={() => ctx.dispatch({ type: 'COPY_PHASE_PROGRAM', payload: { week, sourceWeek: week - 1 } })}>Önceki haftanın programını buraya kopyala</button>}
    {allowCopy && <p className="lb-label">Kopyalama yalnızca günleri ve egzersiz ayarlarını aktarır; antrenman sonucu oluşturmaz. H1'i seçerek yeni programını düzenleyebilirsin.</p>}
  </div>;
}
