import { useContext, useMemo } from 'react';
import { AppContext } from '@/context/AppContext';
import { usePrograms } from '@/hooks/usePrograms';
import { usePlans } from '@/hooks/usePlans';
import { useWeekLogs } from '@/hooks/useWeekLogs';
import { stalledMovements } from '@/utils/movements';
import { bestSet, previousRecord } from '@/utils/progression';
import { trainingStreak } from '@/utils/weekAdvance';
import { buildPhaseGrid, formatSetLine } from '../../supabase/functions/_shared/historyGrid.mjs';
import { onlyFirstPhase } from '@/utils/phases';
import type { Program } from '@/types';

export type DayStatus = 'done' | 'holiday' | 'pending';
// How this week's workout of the day compares, movement by movement, coloured
// by the same rule as the History grid and the Sheet.
export type DayCounts = { improved: number; same: number; decreased: number; new: number };
export type WeekDay = { program: Program; status: DayStatus; hasDraft: boolean; counts: DayCounts };

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

  const weekStats = useMemo(() => {
    const thisWeekLogs = weekLogs.filter(w => w.weekNumber === currentWeek && activeProgramIds.includes(w.programId));
    return {
      completed: thisWeekLogs.filter(w => !w.isHoliday && w.exercises.length > 0).length,
      total: activePlanPrograms.length,
    };
  }, [weekLogs, currentWeek, activeProgramIds, activePlanPrograms.length]);

  const streak = useMemo(() => trainingStreak(weekLogs, currentWeek), [weekLogs, currentWeek]);

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
      return { program, status, hasDraft, counts };
    });
  }, [activePlanPrograms, weekLogs, currentWeek, grid]);

  const stalled = useMemo(() => stalledMovements(activePlanPrograms, weekLogs), [activePlanPrograms, weekLogs]);

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
