import { STATUS_INK } from '@/components/shared/ExerciseTrend';
import { formatSet } from '@/utils/formatters';
import type { SetLog } from '@/types';
import type { WorkoutSummary } from '@/utils/workoutSummary';

const setsText = (sets: SetLog[]) => sets.map(formatSet).join(' · ');

/**
 * The workout just done, on the screen shown once every set is: against
 * last time in figures, then each movement with today's sets beside last
 * time's (its dot coloured as in History), a record or a stall said on its
 * own line, and sets per muscle group.
 */
export function WorkoutSummaryCard({ summary }: { summary: WorkoutSummary }) {
  const { counts, groups, lines } = summary;
  const compared = counts.improved + counts.same + counts.decreased;
  if (!lines.length) return null;
  return (
    <div className="mt-6 a-card px-4 py-1">
      {compared > 0 && (
        <div className="py-2.5 border-b border-(--color-border)">
          <p className="text-[14px] text-(--color-text-secondary)">Geçen haftaya göre</p>
          <p className="text-[16px] leading-snug">
            <span style={{ color: counts.improved ? 'var(--lb-gain)' : undefined }}>{counts.improved} ilerleme</span>
            {' · '}{counts.same} aynı{' · '}
            <span style={{ color: counts.decreased ? 'var(--lb-drop)' : undefined }}>{counts.decreased} düşüş</span>
          </p>
        </div>
      )}
      <ul>
        {lines.map((line, index) => (
          <li key={`${line.name}-${index}`} className="py-2.5 border-b border-(--color-border)">
            <div className="flex items-baseline gap-2.5">
              <span aria-hidden="true" className="w-2 h-2 rounded-full shrink-0 self-center" style={{ background: STATUS_INK[line.status] ?? 'var(--color-text-secondary)' }} />
              <span className="flex-1 min-w-0 text-[16px] truncate">{line.name}</span>
              <span className="lb-figure shrink-0 max-w-[55%] text-right text-[18px] font-semibold">{setsText(line.sets)}</span>
            </div>
            <p className="pl-[18px] text-[14px] leading-snug text-(--color-text-secondary)">
              {line.previous ? <>geçen <span className="lb-figure">{setsText(line.previous)}</span></> : 'ilk kayıt'}
            </p>
            {line.record && (
              <p className="pl-[18px] text-[14px] leading-snug" style={{ color: 'var(--lb-gain)' }}>
                Rekor: tahmini 1RM {line.record.oneRM} kg <span className="text-(--color-text-secondary)">(önceki en iyi {line.record.previous})</span>
              </p>
            )}
            {line.stallWeeks !== null && (
              <p className="pl-[18px] text-[14px] leading-snug text-(--color-text-secondary)">{line.stallWeeks} haftadır yerinde sayıyor</p>
            )}
          </li>
        ))}
      </ul>
      {groups.length > 0 && (
        <div className="py-2.5">
          <p className="text-[14px] text-(--color-text-secondary)">Kas grubu başına set</p>
          <p className="text-[16px] leading-snug">{groups.map(group => `${group.group} ${group.sets}`).join(' · ')}</p>
        </div>
      )}
    </div>
  );
}
