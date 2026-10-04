import type { AppState } from '@/types';
import { appReducer } from '@/context/appReducer';
import { describeProgramChanges } from '../programChanges';
import { coachPlanOf, newPlanActions } from '../templates';
import type { CoachComment } from '../comments';
import { DEMO_TEMPLATES } from './athletes';

let counter = 0;
const newId = () => `demo${Date.now().toString(36)}${++counter}`;

/**
 * Demo only: what the made-up coach sends right after the viewer accepts the
 * invite. A program set up for them beside their own plan (theirs stays in
 * use until they choose), and a comment on their latest workout.
 */
export function demoCoachMessages(own: AppState, coach: string) {
  const now = new Date().toISOString();
  const template = DEMO_TEMPLATES.find(item => item.id === 'tum-vucut') ?? DEMO_TEMPLATES[0];
  const actions = newPlanActions(own, coach, template, newId, now);
  const after = actions.reduce(appReducer, own);
  const plan = coachPlanOf(after, coach).plan!;
  const lines = [`Yeni program: ${plan.name}`, ...describeProgramChanges(own, after, plan.id)];

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

  return { update: { at: now, actions, lines, planId: plan.id, planName: plan.name, isNew: true }, comments };
}
