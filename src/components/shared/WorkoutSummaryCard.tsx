import type { ReactNode } from 'react';
import type { WorkoutSummary } from '@/utils/workoutSummary';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="py-2 border-b border-(--color-border) last:border-b-0">
      <p className="text-[14px] text-(--color-text-secondary)">{label}</p>
      <p className="text-[16px] leading-snug">{children}</p>
    </div>
  );
}

/**
 * The workout in a few lines, on the screen shown once every set is done:
 * against last time, any record, what is stuck and sets per muscle group.
 */
export function WorkoutSummaryCard({ summary }: { summary: WorkoutSummary }) {
  const { counts, groups } = summary;
  const compared = counts.improved + counts.same + counts.decreased;
  const records = summary.lines.filter(line => line.record);
  const stuck = summary.lines.filter(line => line.stallWeeks !== null);
  if (!compared && !records.length && !stuck.length && !groups.length) return null;
  return (
    <div className="mt-6 a-card px-4 py-1">
      {compared > 0 && (
        <Row label="Geçen haftaya göre">
          <span style={{ color: counts.improved ? 'var(--lb-gain)' : undefined }}>{counts.improved} ilerleme</span>
          {' · '}{counts.same} aynı{' · '}
          <span style={{ color: counts.decreased ? 'var(--lb-drop)' : undefined }}>{counts.decreased} düşüş</span>
        </Row>
      )}
      {records.map(line => (
        <Row key={`record-${line.name}`} label="Rekor">
          {line.name}: tahmini 1RM <span className="font-semibold" style={{ color: 'var(--lb-gain)' }}>{line.record!.oneRM} kg</span>
          <span className="text-(--color-text-secondary)"> (önceki en iyi {line.record!.previous})</span>
        </Row>
      ))}
      {stuck.map(line => (
        <Row key={`stall-${line.name}`} label="Yerinde sayıyor">{line.name}: {line.stallWeeks} haftadır</Row>
      ))}
      {groups.length > 0 && (
        <Row label="Kas grubu başına set">{groups.map(group => `${group.group} ${group.sets}`).join(' · ')}</Row>
      )}
    </div>
  );
}
