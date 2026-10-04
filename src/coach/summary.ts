import type { AppState } from '@/types';
import { programVersionAt } from '@/utils/programVersions';
import { weekName } from '@/utils/phases';
import { daysSince } from '@/utils/weekAdvance';
import { exerciseKey } from '@/utils/muscleGroups';
import { movementSessions } from '@/utils/movements';
import { STALL_WEEKS, stallOf } from '@/utils/progression';
import { buildPhaseGrid } from '../../supabase/functions/_shared/historyGrid.mjs';

/**
 * What a coach's list shows of one athlete. Small on purpose: the athlete's
 * app can store it next to the full record, so a list of twenty athletes
 * reads twenty of these instead of twenty full histories.
 */
export interface AthleteSummary {
  /** Date of the latest logged workout (YYYY-MM-DD), null before the first. */
  lastWorkout: string | null;
  daysSinceLast: number | null;
  /** "8. hafta", or "Faz 2 · H3" once there are phases. */
  weekLabel: string;
  weekDone: number;
  weekTotal: number;
  /** This week's movements that beat last week, out of those that could be compared. */
  improved: number;
  compared: number;
  /** Movements whose best set has not been beaten for STALL_WEEKS or more. */
  stalled: number;
  workouts: number;
  /** This week's training days in the plan's order. */
  days: DayMark[];
}

export type DayMark = 'done' | 'holiday' | 'open';

export function summarizeAthlete(state: AppState, today: Date): AthleteSummary {
  const week = state.currentWeek;
  const scope = programVersionAt(state, week);
  const plan = scope.plans.find(p => p.id === scope.activePlanId) ?? scope.plans[0] ?? null;
  const programs = plan ? scope.programs.filter(p => plan.programIds.includes(p.id)) : [];
  const programIds = new Set(programs.map(p => p.id));

  const trained = state.weekLogs.filter(log => !log.isHoliday && log.exercises.some(exercise => exercise.sets.length > 0));
  const dates = trained.map(log => log.date.slice(0, 10)).sort();
  const lastWorkout = dates.length ? dates[dates.length - 1] : null;

  const phase = state.phases.find(p => week >= p.startWeek && (p.endWeek === null || week <= p.endWeek));
  const grid = phase ? buildPhaseGrid(state, phase.id) : null;
  let improved = 0;
  let compared = 0;
  for (const program of grid?.programs ?? []) {
    if (!programIds.has(program.id)) continue;
    for (const row of program.rows) {
      const status = row.cells.find(cell => cell.week === week)?.status;
      if (status === 'improved') improved++;
      if (status === 'improved' || status === 'same' || status === 'decreased') compared++;
    }
  }

  // Counted as on the athlete's own home page: each movement once, across days.
  const seen = new Set<string>();
  let stalled = 0;
  for (const program of programs) {
    for (const exercise of program.exercises) {
      const key = exerciseKey(exercise.name);
      if (!exercise.isActive || seen.has(key)) continue;
      seen.add(key);
      const stall = stallOf(movementSessions(state.weekLogs, key));
      if (stall && stall.weeks >= STALL_WEEKS) stalled++;
    }
  }

  const days: DayMark[] = programs.map(program => {
    const log = state.weekLogs.find(item => item.programId === program.id && item.weekNumber === week);
    return log?.isHoliday ? 'holiday' : log && trained.includes(log) ? 'done' : 'open';
  });

  return {
    lastWorkout,
    daysSinceLast: lastWorkout ? daysSince(lastWorkout, today) : null,
    weekLabel: weekName(state.phases, week, week),
    weekDone: trained.filter(log => log.weekNumber === week && programIds.has(log.programId)).length,
    weekTotal: programs.length,
    improved,
    compared,
    stalled,
    workouts: trained.length,
    days,
  };
}

/** A full week without training; below that, a gap is an ordinary rest. */
export const QUIET_DAYS = 7;

/**
 * Where the athlete stands, as the coach's list groups them: never trained,
 * on a break (a full week without training), or keeping on.
 */
export type Standing = 'not-started' | 'on-break' | 'training';

export function standingOf(summary: AthleteSummary): Standing {
  if (summary.daysSinceLast === null) return 'not-started';
  return summary.daysSinceLast >= QUIET_DAYS ? 'on-break' : 'training';
}

/** Why the athlete is not among those keeping on, or null. */
export function needsAttention(summary: AthleteSummary): string | null {
  const standing = standingOf(summary);
  if (standing === 'not-started') return 'Henüz antrenman kaydı yok';
  if (standing === 'on-break') return `${summary.daysSinceLast} gündür antrenman yok`;
  return null;
}

/** "bugün", "dün", "3 gün önce". */
export function agoText(days: number | null): string {
  if (days === null) return 'kayıt yok';
  if (days <= 0) return 'bugün';
  if (days === 1) return 'dün';
  return `${days} gün önce`;
}
