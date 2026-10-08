import { configurePhaseTransition, initializeProgramVersions, programVersionAt, saveProgramVersion } from '@/utils/programVersions';
import type { AppState, AppAction, CoachUpdatePayload } from '@/types';
import { CURRENT_DATA_VERSION } from '@/data/migrations';
import { normalizeGoogleSettings } from '@/utils/googleSheetsSettings';
import { syncWeekLogFromProgramEdit } from '@/utils/exerciseSync';
import { exerciseKey } from '@/utils/muscleGroups';
import { videoLink } from '@/utils/videoLink';

export const initialState: AppState = {
  dataVersion: CURRENT_DATA_VERSION,
  programs: [],
  plans: [],
  activePlanId: null,
  weekLogs: [],
  currentWeek: 0,
  // One open-ended phase: a new person counts weeks; phases are added when
  // they want them.
  phases: [
    { id: 'phase-1', name: 'Faz 1', startWeek: 0, endWeek: null },
  ],
};

/** How many applied coach updates a record remembers; older ones are long settled. */
const APPLIED_KEPT = 200;

/**
 * Program changes a coach sent, applied by the person's own app as if they
 * had made them, from the week they are in now; earlier weeks keep the
 * program they were trained on.
 *
 * Only what a coach may do gets through: set up a plan of their own, add days
 * to it and change its days. Workouts, the person's own plans and their days
 * are never touched, whatever the update holds, and the plan in use stays
 * the one in use (someone with no plan at all trains the coach's). Each
 * update is applied once, so a second device or a repeated read does nothing.
 */
export function applyCoachUpdate(state: AppState, update: CoachUpdatePayload): AppState {
  if (state.appliedCoachUpdates?.includes(update.id)) return state;
  const week = state.currentWeek;
  const scopeOf = (current: AppState) => programVersionAt(current, week);
  const before = scopeOf(state).activePlanId;
  const isCoachPlan = (current: AppState, planId: string) =>
    scopeOf(current).plans.some(plan => plan.id === planId && plan.coachId === update.coachId);
  // The coach's days: those of their plans, and those this update adds.
  const owned = new Set(scopeOf(state).plans.filter(plan => plan.coachId === update.coachId).flatMap(plan => plan.programIds));
  const stamp = <T extends object>(plan: T) => ({ ...plan, coach: update.coachName, coachId: update.coachId });

  let next = state;
  for (const action of Array.isArray(update.actions) ? update.actions : []) {
    const scope = scopeOf(next);
    if (action.type === 'ADD_PLAN') {
      if (scope.plans.some(plan => plan.id === action.payload.id)) continue;
      next = appReducer(next, { type: 'ADD_PLAN', atWeek: week, payload: stamp({ ...action.payload, programIds: [] }) });
    } else if (action.type === 'UPDATE_PLAN') {
      if (!isCoachPlan(next, action.payload.id)) continue;
      const programIds = action.payload.programIds.filter(id => owned.has(id));
      next = appReducer(next, { type: 'UPDATE_PLAN', atWeek: week, payload: stamp({ ...action.payload, programIds }) });
    } else if (action.type === 'SET_ACTIVE_PLAN') {
      if (!isCoachPlan(next, action.payload) && action.payload !== before) continue;
      next = appReducer(next, { type: 'SET_ACTIVE_PLAN', atWeek: week, payload: action.payload });
    } else if (action.type === 'ADD_PROGRAM') {
      // A day goes into the plan in use. That is the coach's plan whatever the
      // coach saw in use: the person may have switched since.
      const inUse = scope.plans.find(plan => plan.id === scope.activePlanId) ?? scope.plans[0];
      const target = inUse?.coachId === update.coachId ? inUse : scope.plans.find(plan => plan.coachId === update.coachId);
      if (!target || scope.programs.some(program => program.id === action.payload.id)) continue;
      if (target !== inUse) next = appReducer(next, { type: 'SET_ACTIVE_PLAN', atWeek: week, payload: target.id });
      owned.add(action.payload.id);
      next = appReducer(next, { type: 'ADD_PROGRAM', atWeek: week, payload: action.payload });
    } else if (action.type === 'UPDATE_PROGRAM') {
      // No syncCurrentLog: a coach's change never rewrites a workout already logged.
      if (!owned.has(action.payload.id)) continue;
      next = appReducer(next, { type: 'UPDATE_PROGRAM', atWeek: week, payload: action.payload });
    } else if (action.type === 'SET_EXERCISE_SETTINGS') {
      // Only a technique video, a web link, for a movement of the coach's days:
      // the person's own settings (seat note, rule, bar) stay theirs.
      const link = action.payload.settings?.videoUrl;
      if (typeof link !== 'string' || videoLink(link) !== link) continue;
      const coached = scope.programs.some(program => owned.has(program.id)
        && program.exercises.some(exercise => exercise.isActive && exerciseKey(exercise.name) === action.payload.key));
      if (!coached) continue;
      next = appReducer(next, { type: 'SET_EXERCISE_SETTINGS', payload: { key: action.payload.key, settings: { videoUrl: link } } });
    }
  }

  const after = scopeOf(next);
  if (before && after.activePlanId !== before && after.plans.some(plan => plan.id === before)) {
    next = appReducer(next, { type: 'SET_ACTIVE_PLAN', atWeek: week, payload: before });
  }
  return { ...next, appliedCoachUpdates: [...(state.appliedCoachUpdates ?? []), update.id].slice(-APPLIED_KEPT) };
}

export function appReducer(state: AppState, action: AppAction): AppState {
  if (action.type === 'APPLY_COACH_UPDATE') return applyCoachUpdate(state, action.payload);
  if (action.type === 'SET_WEEK' || action.type === 'INCREMENT_WEEK') {
    const week = action.type === 'SET_WEEK' ? action.payload : state.currentWeek + 1;
    if (!Number.isInteger(week) || week < 0) return state;
    const next = { ...initializeProgramVersions(state), currentWeek: week };
    const scope = programVersionAt(next, week);
    const phase = next.phases.find(p => p.id === scope.phaseId);
    if (phase && !next.programVersions!.some(v => v.phaseId === phase.id && v.fromWeek === 0)) return saveProgramVersion(next, phase.startWeek, scope);
    return { ...next, programs: scope.programs, plans: scope.plans, activePlanId: scope.activePlanId };
  }
  if (['ADD_PROGRAM', 'UPDATE_PROGRAM', 'DELETE_PROGRAM', 'ADD_PLAN', 'UPDATE_PLAN', 'DELETE_PLAN', 'SET_ACTIVE_PLAN'].includes(action.type)) {
    const week = ('atWeek' in action ? action.atWeek : undefined) ?? state.currentWeek;
    const scope = programVersionAt(state, week);
    const edited = reduceData({ ...state, programs: scope.programs, plans: scope.plans, activePlanId: scope.activePlanId }, action);
    let saved = saveProgramVersion(state, week, edited);
    // An edit made while browsing an earlier week of the current phase is
    // still the main program shown on the dashboard at the current week.
    const editedPhase = state.phases.find(p => week >= p.startWeek && (p.endWeek === null || week <= p.endWeek));
    if (action.type === 'UPDATE_PROGRAM' && editedPhase
      && state.currentWeek > week && state.currentWeek >= editedPhase.startWeek
      && (editedPhase.endWeek === null || state.currentWeek <= editedPhase.endWeek)) {
      const main = programVersionAt(saved, state.currentWeek);
      const beforeMain = main.programs.find(program => program.id === action.payload.id);
      saved = saveProgramVersion(saved, state.currentWeek, {
        ...main,
        programs: main.programs.map(program => program.id === action.payload.id ? action.payload : program),
      });
      if (action.syncCurrentLog && beforeMain) saved = { ...saved, weekLogs: saved.weekLogs.map(log =>
        log.programId === action.payload.id && log.weekNumber === state.currentWeek
          ? syncWeekLogFromProgramEdit(beforeMain, action.payload, log)
          : log) };
    }
    if (action.type !== 'UPDATE_PROGRAM' || !action.syncCurrentLog) return saved;
    const before = scope.programs.find(program => program.id === action.payload.id);
    if (!before) return saved;
    return { ...saved, weekLogs: saved.weekLogs.map(log =>
      log.programId === action.payload.id && log.weekNumber === week
        ? syncWeekLogFromProgramEdit(before, action.payload, log)
        : log) };
  }
  if (action.type === 'CONFIGURE_PHASE_TRANSITION') {
    return configurePhaseTransition(state, action.payload.previousPhaseId, action.payload.lastWeek, action.payload.nextId);
  }
  if (action.type === 'COPY_PHASE_PROGRAM') {
    return saveProgramVersion(state, action.payload.week, programVersionAt(state, action.payload.sourceWeek));
  }
  if (action.type === 'SET_PHASES') {
    const archived = initializeProgramVersions(state);
    const next = { ...archived, phases: action.payload };
    for (const phase of next.phases) {
      if (!next.programVersions!.some(v => v.phaseId === phase.id)) {
        const source = programVersionAt(archived, Math.max(0, phase.startWeek - 1));
        next.programVersions = [...next.programVersions!, { ...source, phaseId: phase.id, fromWeek: 0 }];
      }
    }
    const current = programVersionAt(next, next.currentWeek);
    return { ...next, programs: current.programs, plans: current.plans, activePlanId: current.activePlanId };
  }
  return reduceData(state, action);
}

function reduceData(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'CLEAR_HISTORY_DATA': {
      const { programId, weeks } = action.payload;
      return { ...state, weekLogs: state.weekLogs.filter(log => log.programId !== programId || !weeks.includes(log.weekNumber)) };
    }
    case 'SET_GOOGLE_SHEETS_SETTINGS':
      return { ...state, googleSheetsSettings: normalizeGoogleSettings(action.payload) };
    case 'ADD_PROGRAM': {
      const activePlan = state.plans.find(p => p.id === state.activePlanId) ?? state.plans[0];
      const planId = activePlan?.id ?? crypto.randomUUID();
      return {
        ...state,
        programs: [...state.programs, action.payload],
        activePlanId: planId,
        plans: activePlan
          ? state.plans.map(p => p.id === planId ? { ...p, programIds: [...p.programIds, action.payload.id], updatedAt: action.payload.updatedAt } : p)
          : [{ id: planId, name: 'Varsayılan Plan', programIds: [action.payload.id], createdAt: action.payload.createdAt, updatedAt: action.payload.updatedAt }],
      };
    }

    case 'UPDATE_PROGRAM':
      return {
        ...state,
        programs: state.programs.map(p =>
          p.id === action.payload.id ? action.payload : p
        ),
      };

    case 'DELETE_PROGRAM':
      return {
        ...state,
        programs: state.programs.filter(p => p.id !== action.payload),
        plans: state.plans.map(plan => ({
          ...plan,
          programIds: plan.programIds.filter(id => id !== action.payload),
        })),
      };

    case 'ADD_PLAN':
      return { ...state, plans: [...state.plans, action.payload] };

    case 'UPDATE_PLAN':
      return {
        ...state,
        plans: state.plans.map(p => p.id === action.payload.id ? action.payload : p),
      };

    case 'DELETE_PLAN': {
      const remaining = state.plans.filter(p => p.id !== action.payload);
      return {
        ...state,
        plans: remaining,
        activePlanId: state.activePlanId === action.payload
          ? (remaining[0]?.id ?? null)
          : state.activePlanId,
      };
    }

    case 'SET_ACTIVE_PLAN':
      return { ...state, activePlanId: action.payload };

    case 'SAVE_WORKOUT':
      return { ...state, weekLogs: [...state.weekLogs, action.payload] };

    case 'UPDATE_WORKOUT':
      return {
        ...state,
        weekLogs: state.weekLogs.map(w =>
          w.id === action.payload.id ? action.payload : w
        ),
      };

    case 'DELETE_WORKOUT':
      return {
        ...state,
        weekLogs: state.weekLogs.filter(w => w.id !== action.payload),
      };

    case 'SET_HOLIDAY': {
      const { programId, weekNumber } = action.payload;
      const existing = state.weekLogs.find(
        w => w.programId === programId && w.weekNumber === weekNumber
      );
      if (existing) {
        return {
          ...state,
          weekLogs: state.weekLogs.map(w =>
            w.id === existing.id ? { ...w, isHoliday: !w.isHoliday } : w
          ),
        };
      }
      const newLog: import('@/types').WeekLog = {
        id: crypto.randomUUID(),
        weekNumber,
        programId,
        date: new Date().toISOString().split('T')[0],
        exercises: [],
        notes: '',
        isHoliday: true,
        updatedAt: new Date().toISOString(),
      };
      return { ...state, weekLogs: [...state.weekLogs, newLog] };
    }

    case 'INCREMENT_WEEK':
      return { ...state, currentWeek: state.currentWeek + 1 };

    case 'SET_WEEK':
      return { ...state, currentWeek: action.payload };

    case 'SET_PHASES':
      return { ...state, phases: action.payload };

    case 'SET_EXERCISE_ROW_ORDER':
      return {
        ...state,
        exerciseRowOrder: {
          ...state.exerciseRowOrder,
          [action.payload.programId]: action.payload.exerciseIds,
        },
      };

    case 'SET_MUSCLE_GROUP': {
      // null goes back to the group the name suggests.
      const { [action.payload.key]: _previous, ...rest } = state.muscleGroups ?? {};
      return { ...state, muscleGroups: action.payload.group ? { ...rest, [action.payload.key]: action.payload.group } : rest };
    }

    case 'SET_EXERCISE_SETTINGS': {
      // Merged into what the movement already has; an empty value removes
      // the field, and a movement with nothing left drops out of the map.
      const { [action.payload.key]: current, ...rest } = state.exerciseSettings ?? {};
      const merged: Record<string, unknown> = { ...current, ...action.payload.settings };
      for (const field of Object.keys(merged)) {
        const value = merged[field];
        if (value === undefined || value === null || value === '') delete merged[field];
      }
      return { ...state, exerciseSettings: Object.keys(merged).length ? { ...rest, [action.payload.key]: merged } : rest };
    }

    case 'SET_HIDE_REMOVED_EXERCISES': {
      // Showing them is the default, so it is stored as the field's absence.
      const { hideRemovedExercises: _previous, ...rest } = state;
      return action.payload ? { ...rest, hideRemovedExercises: true } : rest;
    }

    case 'SAVE_MEASUREMENT': {
      // One entry per day: saving a day again replaces it, and undoes its deletion.
      const others = (state.bodyMeasurements ?? []).filter(entry => entry.date !== action.payload.date);
      const { [action.payload.date]: _undone, ...deleted } = state.deletedMeasurements ?? {};
      return {
        ...state,
        bodyMeasurements: [...others, action.payload].sort((a, b) => a.date.localeCompare(b.date)),
        ...(state.deletedMeasurements && { deletedMeasurements: deleted }),
      };
    }

    case 'DELETE_MEASUREMENT':
      return {
        ...state,
        bodyMeasurements: (state.bodyMeasurements ?? []).filter(entry => entry.date !== action.payload),
        deletedMeasurements: { ...state.deletedMeasurements, [action.payload]: new Date().toISOString() },
      };

    case 'SET_BODY_GOAL': {
      const { [action.payload.key]: _previous, ...rest } = state.bodyGoals ?? {};
      return { ...state, bodyGoals: action.payload.value === null ? rest : { ...rest, [action.payload.key]: action.payload.value } };
    }

    case 'SET_MEASURE_REMINDER': {
      // Weekly is the default, stored as the field's absence.
      const { measureReminder: _previous, ...rest } = state;
      return action.payload === 'daily' ? { ...rest, measureReminder: 'daily' } : rest;
    }

    case 'SET_BODY_PROFILE':
      return { ...state, bodyProfile: action.payload };

    case 'SET_PLATES': {
      // The standard set is stored as the field's absence.
      const { plates: _previous, ...rest } = state;
      return action.payload?.length ? { ...rest, plates: [...action.payload].sort((a, b) => b - a) } : rest;
    }

    case 'IMPORT_DATA':
      return { ...action.payload };

    case 'RESET_DATA':
      return initialState;

    default:
      return state;
  }
}
