import { useContext, useMemo } from 'react';
import { AppContext } from '@/context/AppContext';
import { usePrograms } from '@/hooks/usePrograms';
import { usePlans } from '@/hooks/usePlans';
import { useWeekLogs } from '@/hooks/useWeekLogs';
import { calculateWeeklyVolume } from '@/utils/volumeCalculator';
import { exerciseKey } from '@/utils/muscleGroups';
import { movementSessions } from '@/utils/movements';
import { STALL_WEEKS, bestSet, previousRecord, stallOf } from '@/utils/progression';
import { buildPhaseGrid, formatSetLine } from '../../supabase/functions/_shared/historyGrid.mjs';
import { onlyFirstPhase } from '@/utils/phases';
import type { Program } from '@/types';

export type DayStatus = 'done' | 'holiday' | 'pending';
// How this week's workout of the day compares, movement by movement, coloured
// by the same rule as the History grid and the Sheet.
export type DayCounts = { improved: number; same: number; decreased: number; new: number };
export type WeekDay = { program: Program; status: DayStatus; hasDraft: boolean; volume: number; counts: DayCounts };

/** Everything the home page shows about the current week, whatever it looks like. */
export function useWeekOverview() {
  const { activePlan, activePlanPrograms } = usePlans();
  const { weekLogs, currentWeek, incrementWeek } = useWeekLogs();
  const { programs, addProgram } = usePrograms();
  const ctx = useContext(AppContext);
  const state = ctx?.state;
  const phase = state?.phases.find(p => currentWeek >= p.startWeek && (p.endWeek === null || currentWeek <= p.endWeek));
  const displayWeek = currentWeek - (phase?.startWeek ?? 0);
  // "4. hafta" while there is one phase; the phase and its week once there are more.
  const weekLabel = state && onlyFirstPhase(state.phases, currentWeek) ? `${currentWeek + 1}. hafta` : `${phase?.name ?? ''} · Hafta ${displayWeek}`;

  const activeProgramIds = useMemo(() => activePlanPrograms.map(p => p.id), [activePlanPrograms]);

  const volumeForWeek = useMemo(() => {
    return (week: number) =>
      weekLogs
        .filter(w => w.weekNumber === week && activeProgramIds.includes(w.programId))
        .reduce((sum, log) => sum + calculateWeeklyVolume(log), 0);
  }, [weekLogs, activeProgramIds]);

  const weekStats = useMemo(() => {
    const thisWeekLogs = weekLogs.filter(w => w.weekNumber === currentWeek && activeProgramIds.includes(w.programId));
    const completed = thisWeekLogs.filter(w => !w.isHoliday && w.exercises.length > 0).length;
    const volume = volumeForWeek(currentWeek);
    const lastVolume = currentWeek > 0 ? volumeForWeek(currentWeek - 1) : 0;
    return {
      completed,
      total: activePlanPrograms.length,
      volume,
      // Only a real comparison counts — no delta against a week with no data.
      delta: lastVolume > 0 ? volume - lastVolume : null,
    };
  }, [weekLogs, currentWeek, activeProgramIds, activePlanPrograms.length, volumeForWeek]);

  // Consecutive weeks before this one with at least one logged workout
  const streak = useMemo(() => {
    let count = 0;
    for (let w = currentWeek - 1; w >= 0; w--) {
      const hasWorkout = weekLogs.some(log => log.weekNumber === w && !log.isHoliday && log.exercises.length > 0);
      if (hasWorkout) count++;
      else break;
    }
    return count;
  }, [weekLogs, currentWeek]);

  const grid = useMemo(() => state && phase ? buildPhaseGrid(state, phase.id) : null, [state, phase]);

  const programStatuses: WeekDay[] = useMemo(() => {
    return activePlanPrograms.map(program => {
      const log = weekLogs.find(w => w.programId === program.id && w.weekNumber === currentWeek);
      const status: DayStatus = log?.isHoliday ? 'holiday' : log && log.exercises.length > 0 ? 'done' : 'pending';
      let hasDraft = false;
      try {
        const raw = localStorage.getItem(`draft-${program.id}-${currentWeek}`);
        const draft = raw ? JSON.parse(raw) : null;
        hasDraft = Array.isArray(draft?.exerciseLogs) && (!log?.updatedAt || !draft.savedAt || draft.savedAt >= log.updatedAt);
      } catch { /* Ignore an unreadable draft. */ }
      const counts: DayCounts = { improved: 0, same: 0, decreased: 0, new: 0 };
      for (const row of grid?.programs.find(p => p.id === program.id)?.rows ?? []) {
        const cellStatus = row.cells.find(cell => cell.week === currentWeek)?.status;
        if (cellStatus === 'improved' || cellStatus === 'same' || cellStatus === 'decreased' || cellStatus === 'new') counts[cellStatus] += 1;
      }
      return { program, status, hasDraft, volume: log ? calculateWeeklyVolume(log) : 0, counts };
    });
  }, [activePlanPrograms, weekLogs, currentWeek, grid]);

  // Movements of the plan whose best set has not been beaten for a while,
  // counted across every day that trains them and across phases: the
  // week-to-week colours cannot show this, each compares one week only.
  const stalled = useMemo(() => {
    const seen = new Set<string>();
    const items: { key: string; name: string; stall: NonNullable<ReturnType<typeof stallOf>> }[] = [];
    for (const program of activePlanPrograms) {
      for (const exercise of program.exercises) {
        const key = exerciseKey(exercise.name);
        if (!exercise.isActive || seen.has(key)) continue;
        seen.add(key);
        const stall = stallOf(movementSessions(weekLogs, key));
        if (stall && stall.weeks >= STALL_WEEKS) items.push({ key, name: exercise.name, stall });
      }
    }
    return items.sort((a, b) => b.stall.weeks - a.stall.weeks);
  }, [activePlanPrograms, weekLogs]);

  const nextWorkout = programStatuses.find(p => p.hasDraft) ?? programStatuses.find(p => p.status === 'pending');

  // What the next workout has to beat: each movement's best set from the
  // record this workout will be compared with.
  const nextTargets = useMemo(() => {
    if (!nextWorkout) return [];
    const program = nextWorkout.program;
    return program.exercises.filter(exercise => exercise.isActive).map(exercise => {
      const sets = previousRecord(weekLogs, program.id, exercise.id, currentWeek);
      const best = sets ? bestSet(sets) : null;
      return { id: exercise.id, name: exercise.name, text: best ? formatSetLine(best) : null };
    });
  }, [nextWorkout, weekLogs, currentWeek]);

  return {
    activePlan, activePlanPrograms, programs, addProgram, weekLogs, currentWeek, incrementWeek,
    phase, displayWeek, weekLabel, weekStats, streak, programStatuses, stalled, nextWorkout, nextTargets,
  };
}
