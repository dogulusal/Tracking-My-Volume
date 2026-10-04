import type { AppAction, AppState, Plan, Program } from '@/types';
import { appReducer } from '@/context/appReducer';
import { programVersionAt } from '@/utils/programVersions';

/** A program saved in the coach's library: days and movements, no records. */
export interface ProgramTemplate {
  id: string;
  name: string;
  savedAt: string;
  days: { name: string; exercises: { name: string; defaultSets: number; defaultReps: number; defaultWeight: number }[] }[];
}

/** The plan someone trains this week and its days, in order. */
export function activePlanOf(state: AppState): { plan: Plan | null; days: Program[] } {
  const scope = programVersionAt(state, state.currentWeek);
  const plan = scope.plans.find(p => p.id === scope.activePlanId) ?? scope.plans[0] ?? null;
  return { plan, days: plan ? plan.programIds.flatMap(id => scope.programs.filter(program => program.id === id)) : [] };
}

/** The days someone trains now, as a library program. */
export function templateFrom(state: AppState, name: string, id: string, savedAt: string): ProgramTemplate {
  return {
    id, name, savedAt,
    days: activePlanOf(state).days.map(day => ({
      name: day.name,
      exercises: day.exercises.filter(exercise => exercise.isActive)
        .map(({ name: move, defaultSets, defaultReps, defaultWeight }) => ({ name: move, defaultSets, defaultReps, defaultWeight })),
    })),
  };
}

/**
 * The edits that copy a library program into someone's plan this week: its
 * days as new days (new ids, so later edits touch neither the library nor
 * anyone else's copy), either in place of the plan's days or after them.
 * Days taken out stay in the record, so their weeks keep their history.
 */
export function pasteActions(state: AppState, template: ProgramTemplate, mode: 'replace' | 'add', newId: () => string, now: string): AppAction[] {
  const week = state.currentWeek;
  const before = activePlanOf(state);
  // With no plan yet, one is made here: adding a day would otherwise make
  // one with a new random id each time the edits are applied.
  const start: AppAction[] = before.plan ? [] : (() => {
    const id = `plan_${newId()}`;
    return [
      { type: 'ADD_PLAN', atWeek: week, payload: { id, name: template.name, programIds: [], createdAt: now, updatedAt: now } },
      { type: 'SET_ACTIVE_PLAN', atWeek: week, payload: id },
    ];
  })();
  const adds: AppAction[] = template.days.map((day, index) => ({
    type: 'ADD_PROGRAM', atWeek: week,
    payload: {
      id: `p_${newId()}`, name: day.name, order: before.days.length + index + 1, createdAt: now, updatedAt: now,
      exercises: day.exercises.map(exercise => ({ ...exercise, id: `e_${newId()}`, isActive: true })),
    },
  }));
  const { plan } = activePlanOf([...start, ...adds].reduce(appReducer, state));
  if (!plan) return [...start, ...adds];
  const fresh = mode === 'replace' || before.days.length === 0;
  const newIds = adds.map(action => (action as { payload: Program }).payload.id);
  return [...start, ...adds, {
    type: 'UPDATE_PLAN', atWeek: week,
    payload: { ...plan, name: fresh ? template.name : plan.name, programIds: fresh ? newIds : plan.programIds, updatedAt: now },
  }];
}
