import type { DayMark } from './summary';
import { useCoach } from './store';

/** The last thing that failed to reach the cloud, until dismissed. */
export function CoachError() {
  const { error, clearError } = useCoach();
  if (!error) return null;
  return (
    <div role="alert" className="mt-3 a-card px-4 py-2.5 flex items-center gap-3 text-[15px]" style={{ boxShadow: 'inset 0 0 0 1.5px var(--lb-drop)' }}>
      <span className="flex-1 min-w-0">{error}</span>
      <button onClick={clearError} className="shrink-0 h-11 px-2 text-[14px] text-(--color-text-secondary)">Kapat</button>
    </div>
  );
}

/**
 * The athlete's initials; live, their Google photo would sit here. Neutral,
 * since colour is kept for meaning: the ring only says "needs you".
 */
export function Avatar({ name, alert = false, size = 44 }: { name: string; alert?: boolean; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).map(word => word[0]).slice(0, 2).join('').toLocaleUpperCase('tr-TR');
  return (
    <span aria-hidden="true" className="shrink-0 rounded-full bg-(--color-bg-input) flex items-center justify-center font-semibold"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36), boxShadow: alert ? 'inset 0 0 0 2px var(--lb-drop)' : undefined }}>
      {initials}
    </span>
  );
}

const MARK_FILL: Record<DayMark, string> = {
  done: 'var(--color-text-primary)',
  holiday: 'color-mix(in srgb, var(--color-text-secondary) 60%, transparent)',
  open: 'color-mix(in srgb, var(--color-text-secondary) 25%, transparent)',
};

/** One short bar per training day of the week: filled once it is done. */
export function WeekMarks({ days }: { days: DayMark[] }) {
  const done = days.filter(day => day === 'done').length;
  return (
    <span className="flex gap-[3px]" role="img" aria-label={`Bu hafta ${done}/${days.length} antrenman`}>
      {days.map((day, index) => <span key={index} className="h-1.5 w-4 rounded-full" style={{ background: MARK_FILL[day] }} />)}
    </span>
  );
}
