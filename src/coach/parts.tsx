import type { DayMark } from './summary';

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
