import type { AppAction, AppState, Plan, Program } from '@/types';
import { programVersionAt } from '@/utils/programVersions';

/** A program the coach saved, to start someone else's from: days and movements, no records. */
export interface ProgramTemplate {
  id: string;
  name: string;
  savedAt: string;
  days: { name: string; exercises: { name: string; defaultSets: number; defaultReps: number; defaultWeight: number }[] }[];
}

type PlanDays = { plan: Plan | null; days: Program[] };

const daysOf = (state: AppState, plan: Plan | undefined | null): PlanDays => {
  if (!plan) return { plan: null, days: [] };
  const { programs } = programVersionAt(state, state.currentWeek);
  return { plan, days: plan.programIds.flatMap(id => programs.filter(program => program.id === id)) };
};

/** The plan someone trains this week and its days, in order. */
export function activePlanOf(state: AppState): PlanDays {
  const scope = programVersionAt(state, state.currentWeek);
  return daysOf(state, scope.plans.find(p => p.id === scope.activePlanId) ?? scope.plans[0]);
}

/**
 * The plan this coach set up for the person, trained or not. The person's
 * own plans have no coach on them and are never the coach's to change.
 */
export function coachPlanOf(state: AppState, coach: string): PlanDays {
  return daysOf(state, programVersionAt(state, state.currentWeek).plans.find(plan => plan.coach === coach));
}

/** A plan's days, as a program to save. */
export function templateFrom(state: AppState, planId: string, name: string, id: string, savedAt: string): ProgramTemplate {
  const plan = programVersionAt(state, state.currentWeek).plans.find(p => p.id === planId);
  return {
    id, name, savedAt,
    days: daysOf(state, plan).days.map(day => ({
      name: day.name,
      exercises: day.exercises.filter(exercise => exercise.isActive)
        .map(({ name: move, defaultSets, defaultReps, defaultWeight }) => ({ name: move, defaultSets, defaultReps, defaultWeight })),
    })),
  };
}

/**
 * The edits that set up a new plan of the coach's for someone, empty or from
 * a saved program (copied with new ids, so editing it touches neither the
 * saved one nor anyone else's). Their own plan stays the one they train: a
 * day is added to whichever plan is in use, so the new plan is in use only
 * while its days go in. Someone with no plan at all trains the new one.
 */
export function newPlanActions(state: AppState, coach: string, template: ProgramTemplate | null, newId: () => string, now: string): AppAction[] {
  const week = state.currentWeek;
  const previous = programVersionAt(state, week).activePlanId;
  const id = `plan_${newId()}`;
  const days: AppAction[] = (template?.days ?? []).map((day, index) => ({
    type: 'ADD_PROGRAM', atWeek: week,
    payload: {
      id: `p_${newId()}`, name: day.name, order: index + 1, createdAt: now, updatedAt: now,
      exercises: day.exercises.map(exercise => ({ ...exercise, id: `e_${newId()}`, isActive: true })),
    },
  }));
  return [
    { type: 'ADD_PLAN', atWeek: week, payload: { id, name: template?.name ?? 'Antrenör programı', programIds: [], coach, createdAt: now, updatedAt: now } },
    { type: 'SET_ACTIVE_PLAN', atWeek: week, payload: id },
    ...days,
    ...(previous ? [{ type: 'SET_ACTIVE_PLAN', atWeek: week, payload: previous } as AppAction] : []),
  ];
}

/**
 * A day added to the coach's plan while the person trains another: the coach's
 * plan is in use only while the day goes in, as in newPlanActions.
 */
export function addDayActions(state: AppState, planId: string, add: AppAction): AppAction[] {
  const week = state.currentWeek;
  const active = programVersionAt(state, week).activePlanId;
  if (active === planId || !active) return [add];
  return [
    { type: 'SET_ACTIVE_PLAN', atWeek: week, payload: planId },
    add,
    { type: 'SET_ACTIVE_PLAN', atWeek: week, payload: active },
  ];
}
