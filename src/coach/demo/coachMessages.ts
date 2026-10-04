import type { AppAction, AppState } from '@/types';
import { appReducer } from '@/context/appReducer';
import { programVersionAt } from '@/utils/programVersions';
import { exerciseKey } from '@/utils/muscleGroups';
import { describeProgramChanges } from '../programChanges';
import type { CoachComment } from '../comments';

/**
 * Demo only: what the made-up coach sends right after the viewer accepts the
 * invite, built from the viewer's own sample record so it lands on days and
 * movements they have: one program change on their first day (a set more on
 * the first movement, one movement added) and a comment on their latest workout.
 */
export function demoCoachMessages(own: AppState, coach: string) {
  const week = own.currentWeek;
  const scope = programVersionAt(own, week);
  const plan = scope.plans.find(p => p.id === scope.activePlanId) ?? scope.plans[0];
  const day = plan ? scope.programs.find(p => p.id === plan.programIds[0]) : undefined;
  if (!day) return null;
  const first = day.exercises.find(exercise => exercise.isActive);
  const extra = day.exercises.some(exercise => exerciseKey(exercise.name) === 'face pull') ? 'Lateral Raise' : 'Face Pull';
  const now = new Date().toISOString();

  const actions: AppAction[] = [{
    type: 'UPDATE_PROGRAM', atWeek: week,
    payload: {
      ...day,
      updatedAt: now,
      exercises: [
        ...day.exercises.map(exercise => exercise.id === first?.id ? { ...exercise, defaultSets: exercise.defaultSets + 1 } : exercise),
        { id: `antrenor_${Date.now().toString(36)}`, name: extra, defaultSets: 3, defaultWeight: 0, defaultReps: 12, isActive: true },
      ],
    },
  }];
  const lines = describeProgramChanges(own, actions.reduce(appReducer, own));

  const latest = own.weekLogs
    .filter(log => !log.isHoliday && log.exercises.some(exercise => exercise.sets.length > 0))
    .sort((a, b) => b.weekNumber - a.weekNumber || b.date.localeCompare(a.date))[0];
  const target = latest?.exercises.find(exercise => exercise.sets.length > 0);
  const comments: Omit<CoachComment, 'id'>[] = latest && target ? [{
    programId: latest.programId, weekNumber: latest.weekNumber,
    exerciseId: target.exerciseId, exerciseName: target.exerciseName,
    text: 'Son setlerde form iyiydi. Bu hafta ilk sette 2.5 kg ekle; tekrar 6\'nın altına düşerse geri al.',
    at: now, author: coach,
  }] : [];

  return { update: { at: now, actions, lines }, comments };
}
