import type { AppState, ProgramVersion, Program } from '@/types';
import { normalizePhaseBoundaries } from '@/utils/phases';

export function phaseAt(state: Pick<AppState, 'phases'>, week: number) {
  return state.phases.find(p => week >= p.startWeek && (p.endWeek === null || week <= p.endWeek));
}

function recordedPrograms(state: AppState, start: number, end: number): Program[] {
  const latest = new Map<string, AppState['weekLogs'][number]>();
  state.weekLogs.filter(l => l.weekNumber >= start && l.weekNumber <= end && !l.isHoliday && l.exercises?.length)
    .sort((a, b) => a.weekNumber - b.weekNumber).forEach(l => latest.set(l.programId, l));
  return [...latest].map(([id, log], order) => {
    const known = state.programs.find(p => p.id === id);
    return { id, name: known?.name ?? id, order: known?.order ?? order, createdAt: known?.createdAt ?? log.date,
      updatedAt: known?.updatedAt ?? log.date, exercises: log.exercises.map(e => ({
        id: e.exerciseId, name: e.exerciseName, defaultSets: e.sets.length || 1,
        defaultWeight: e.sets[0]?.weight ?? 0, defaultReps: e.sets[0]?.reps ?? 0, isActive: true,
      })) };
  }).sort((a, b) => a.order - b.order);
}

function snapshot(state: AppState, phaseId: string, fromWeek: number, programs: Program[]): ProgramVersion {
  const ids = programs.map(p => p.id);
  const planId = state.activePlanId ?? state.plans[0]?.id ?? `plan-${phaseId}`;
  const plans = state.plans.length ? state.plans.map(p => ({ ...p, programIds: p.id === planId ? ids : p.programIds.filter(id => ids.includes(id)) }))
    : [{ id: planId, name: 'Program', programIds: ids, createdAt: '', updatedAt: '' }];
  return { phaseId, fromWeek, programs, plans, activePlanId: planId };
}

/** Old saves have no program archive. Recover definitions from actual logged sets. */
export function initializeProgramVersions(state: AppState): AppState {
  if (state.programVersions) return state;
  const versions: ProgramVersion[] = [];
  const phases = [...state.phases].sort((a, b) => a.startWeek - b.startWeek);
  phases.forEach((phase, index) => {
    if (phase.startWeek > state.currentWeek) return;
    const end = phase.endWeek ?? state.currentWeek;
    const loggedWeeks = [...new Set(state.weekLogs.filter(l => l.weekNumber >= phase.startWeek && l.weekNumber <= end && !l.isHoliday && l.exercises?.length).map(l => l.weekNumber))].sort((a, b) => a - b);
    const firstPrograms = recordedPrograms(state, phase.startWeek, loggedWeeks[0] ?? end);
    let baseline = firstPrograms.length ? firstPrograms : versions[versions.length - 1]?.programs ?? state.programs;
    const newPhase = phase.endWeek === null && index >= 2;
    if (newPhase) {
      const previous = phases[index - 1];
      const recorded = recordedPrograms(state, previous.startWeek, phase.startWeek - 1);
      if (recorded.length) baseline = recorded;
    }
    versions.push(snapshot(state, phase.id, 0, baseline));
    if (!newPhase) {
      for (const week of loggedWeeks) {
        if (week === phase.startWeek) continue;
        versions.push(snapshot(state, phase.id, week - phase.startWeek, recordedPrograms(state, phase.startWeek, week)));
      }
    }
    if (phase.endWeek === null && state.currentWeek >= phase.startWeek) {
      const fromWeek = newPhase ? 1 : Math.max(0, state.currentWeek - phase.startWeek);
      const current: ProgramVersion = { phaseId: phase.id, fromWeek, programs: state.programs, plans: state.plans, activePlanId: state.activePlanId };
      const duplicate = versions.findIndex(v => v.phaseId === phase.id && v.fromWeek === fromWeek);
      if (duplicate >= 0) versions.splice(duplicate, 1);
      versions.push(current);
    }
  });
  return { ...state, programVersions: versions };
}

export function programVersionAt(raw: AppState, week: number): ProgramVersion {
  const state = initializeProgramVersions(raw);
  const phase = phaseAt(state, week);
  const version = state.programVersions!.filter(v => v.phaseId === phase?.id && v.fromWeek <= week - (phase?.startWeek ?? 0))
    .sort((a, b) => b.fromWeek - a.fromWeek)[0];
  if (!version && phase && phase.startWeek > 0) {
    return { ...programVersionAt(state, phase.startWeek - 1), phaseId: phase.id, fromWeek: 0 };
  }
  return version ?? { phaseId: phase?.id ?? '', fromWeek: 0, programs: state.programs, plans: state.plans, activePlanId: state.activePlanId };
}

export function saveProgramVersion(raw: AppState, week: number, value: Pick<ProgramVersion, 'programs' | 'plans' | 'activePlanId'>): AppState {
  const state = initializeProgramVersions(raw);
  const phase = phaseAt(state, week);
  if (!phase || !Number.isInteger(week) || week < 0) return state;
  const fromWeek = week - phase.startWeek;
  const version: ProgramVersion = { phaseId: phase.id, fromWeek, programs: value.programs, plans: value.plans, activePlanId: value.activePlanId };
  const baseline = fromWeek > 0 && !state.programVersions!.some(v => v.phaseId === phase.id && v.fromWeek === 0)
    ? [programVersionAt(state, phase.startWeek)] : [];
  const programVersions = [...state.programVersions!.filter(v => v.phaseId !== phase.id || v.fromWeek !== fromWeek), ...baseline, version];
  const next = { ...state, programVersions };
  const current = programVersionAt(next, state.currentWeek);
  return { ...next, programs: current.programs, plans: current.plans, activePlanId: current.activePlanId };
}

/** Include days/exercises used anywhere in this phase, including retired ones. */
export function programsForPhase(raw: AppState, phaseId: string): Program[] {
  const state = initializeProgramVersions(raw);
  const phase = state.phases.find(p => p.id === phaseId);
  if (!phase) return [];
  const programs = new Map<string, Program>();
  for (const version of state.programVersions!.filter(v => v.phaseId === phaseId && (phase.endWeek === null || v.fromWeek <= phase.endWeek - phase.startWeek)).sort((a, b) => a.fromWeek - b.fromWeek)) {
    const active = version.plans.find(p => p.id === version.activePlanId) ?? version.plans[0];
    for (const program of version.programs.filter(p => !active || active.programIds.includes(p.id))) {
      const prior = programs.get(program.id);
      const exercises = new Map(prior?.exercises.map(e => [e.id, e]));
      program.exercises.filter(e => e.isActive).forEach(e => exercises.set(e.id, e));
      programs.set(program.id, { ...program, exercises: [...exercises.values()] });
    }
  }
  for (const program of recordedPrograms(state, phase.startWeek, phase.endWeek ?? state.currentWeek)) {
    const existing = programs.get(program.id);
    if (!existing) programs.set(program.id, program);
    else programs.set(program.id, { ...existing, exercises: [...existing.exercises, ...program.exercises.filter(e => !existing.exercises.some(x => x.id === e.id))] });
  }
  return [...programs.values()].sort((a, b) => a.order - b.order);
}

function normalizedProgramName(value: string): string {
  return value.toLocaleLowerCase('tr-TR').replace(/[^a-z0-9]/g, '');
}

/** Remove an exercise from one program for the whole selected phase. */
export function removeExerciseFromPhase(
  raw: AppState,
  phaseId: string,
  programIdOrName: string,
  exerciseIdOrName: string,
): AppState {
  const state = initializeProgramVersions(raw);
  const phase = state.phases.find(p => p.id === phaseId);
  if (!phase) return state;

  const programNeedle = normalizedProgramName(programIdOrName);
  const exerciseNeedle = normalizedProgramName(exerciseIdOrName);
  const phaseVersions = state.programVersions!.filter(v => v.phaseId === phaseId);
  const programIds = new Set(phaseVersions
    .flatMap(v => v.programs)
    .filter(p => p.id === programIdOrName || normalizedProgramName(p.name) === programNeedle)
    .map(p => p.id));
  if (!programIds.size) programIds.add(programIdOrName);

  const exerciseIds = new Set<string>([exerciseIdOrName]);
  phaseVersions.flatMap(v => v.programs)
    .filter(p => programIds.has(p.id))
    .flatMap(p => p.exercises)
    .filter(e => e.id === exerciseIdOrName || normalizedProgramName(e.name) === exerciseNeedle)
    .forEach(e => exerciseIds.add(e.id));
  state.weekLogs
    .filter(log => programIds.has(log.programId)
      && log.weekNumber >= phase.startWeek
      && (phase.endWeek === null || log.weekNumber <= phase.endWeek))
    .flatMap(log => log.exercises)
    .filter(e => e.exerciseId === exerciseIdOrName || normalizedProgramName(e.exerciseName) === exerciseNeedle)
    .forEach(e => exerciseIds.add(e.exerciseId));

  const matchesExercise = (id: string, name: string) => exerciseIds.has(id)
    || id === exerciseIdOrName
    || normalizedProgramName(name) === exerciseNeedle;
  const programVersions = state.programVersions!.map(version => version.phaseId !== phaseId ? version : {
    ...version,
    programs: version.programs.map(program => !programIds.has(program.id) ? program : {
      ...program,
      exercises: program.exercises.filter(exercise => !matchesExercise(exercise.id, exercise.name)),
    }),
  });
  const weekLogs = state.weekLogs.map(log => {
    const belongsToPhase = log.weekNumber >= phase.startWeek
      && (phase.endWeek === null || log.weekNumber <= phase.endWeek);
    if (!belongsToPhase || !programIds.has(log.programId)) return log;
    return {
      ...log,
      exercises: log.exercises.filter(exercise => !matchesExercise(exercise.exerciseId, exercise.exerciseName)),
      updatedAt: new Date().toISOString(),
    };
  });
  const next = { ...state, programVersions, weekLogs };
  const current = programVersionAt(next, next.currentWeek);
  return { ...next, programs: current.programs, plans: current.plans, activePlanId: current.activePlanId };
}

/** Remove a day only from one phase's program versions; older phases and logs survive. */
export function excludeProgramFromPhase(raw: AppState, phaseId: string, programIdOrName: string): AppState {
  const state = initializeProgramVersions(raw);
  const needle = normalizedProgramName(programIdOrName);
  const removedIds = new Set(state.programVersions!
    .filter(v => v.phaseId === phaseId)
    .flatMap(v => v.programs)
    .filter(p => p.id === programIdOrName || normalizedProgramName(p.name) === needle)
    .map(p => p.id));
  if (!removedIds.size && programIdOrName === 'lower2') removedIds.add('lower2');
  const programVersions = state.programVersions!.map(version => version.phaseId !== phaseId ? version : {
    ...version,
    programs: version.programs.filter(program => !removedIds.has(program.id)),
    plans: version.plans.map(plan => ({ ...plan, programIds: plan.programIds.filter(id => !removedIds.has(id)) })),
  });
  const phase = state.phases.find(p => p.id === phaseId);
  const next = {
    ...state,
    programVersions,
    // Only remove copies generated by the H20 → H0 correction. User-entered
    // history is retained even if that day is no longer in the phase plan.
    weekLogs: state.weekLogs.filter(log => !(removedIds.has(log.programId)
      && log.id.startsWith(`${phaseId}-baseline-`)
      && phase && log.weekNumber >= phase.startWeek)),
  };
  const current = programVersionAt(next, next.currentWeek);
  return { ...next, programs: current.programs, plans: current.plans, activePlanId: current.activePlanId };
}

export function phaseTransitionError(raw: AppState, previousPhaseId: string, lastWeek: number, nextId: string): string | null {
  const previous = raw.phases.find(p => p.id === previousPhaseId);
  if (!previous || !Number.isInteger(lastWeek) || lastWeek < 0) return 'Faz ve son hafta seçimini kontrol et.';
  if (raw.phaseRecordTransitions?.[`${previousPhaseId}:${lastWeek}:${nextId}`]) return 'Bu taşıma daha önce uygulandı. Kayıtlar tekrar taşınmadı.';
  const h0 = previous.startWeek + lastWeek + 1;
  if (!raw.weekLogs.some(l => l.weekNumber === h0 - 1)) return `H${lastWeek} haftasında aktarılacak kayıt bulunamadı.`;
  const moving = raw.weekLogs.filter(l => l.weekNumber === h0);
  if (moving.some(l => raw.weekLogs.some(target => target.weekNumber === h0 + 1 && target.programId === l.programId))) {
    return 'H1’de aynı antrenman için kayıt var. Üzerine yazmamak için taşıma yapılmadı. Önce Geçmiş bölümünden H1 kaydını kontrol et.';
  }
  return null;
}

/** Retain H20, copy its results to H0 and move the current H0 results to H1 once. */
export function configurePhaseTransition(raw: AppState, previousPhaseId: string, lastWeek: number, nextId: string): AppState {
  if (phaseTransitionError(raw, previousPhaseId, lastWeek, nextId)) return raw;
  const previous = raw.phases.find(p => p.id === previousPhaseId);
  if (!previous || !Number.isInteger(lastWeek) || lastWeek < 0) return raw;
  const nextStart = previous.startWeek + lastWeek + 1;
  const archived = initializeProgramVersions(raw);
  const nextPhase = raw.phases.find(p => p.id === nextId);
  const phases = normalizePhaseBoundaries([...raw.phases.filter(p => p.id !== nextId),
    { id: nextId, name: nextPhase?.name ?? `Faz ${raw.phases.length + 1}`, startWeek: nextStart, endWeek: null }]);
  let state = { ...archived, phases, currentWeek: Math.max(raw.currentWeek, nextStart) };
  const existing = archived.programVersions!.find(v => v.phaseId === previous.id && v.fromWeek === lastWeek);
  const recorded = recordedPrograms(raw, previous.startWeek, nextStart - 1);
  const source = existing ?? (recorded.length ? snapshot(state, previous.id, lastWeek, recorded) : programVersionAt(state, nextStart - 1));
  state = saveProgramVersion(state, nextStart - 1, source);
  state = saveProgramVersion(state, nextStart, source);
  // Keep the user's newly edited plan ready for H1, independent of the H0 copy.
  const h1 = archived.programVersions!.find(v => v.phaseId === nextId && v.fromWeek === 1);
  state = saveProgramVersion(state, nextStart + 1, h1 ?? { programs: raw.programs, plans: raw.plans, activePlanId: raw.activePlanId });
  const updatedAt = new Date().toISOString();
  const moving = raw.weekLogs.filter(l => l.weekNumber === nextStart);
  const copies = raw.weekLogs.filter(l => l.weekNumber === nextStart - 1).map(l => ({
    ...l, id: `${nextId}-baseline-${l.id}`, weekNumber: nextStart, updatedAt,
    exercises: l.exercises.map(e => ({ ...e, sets: e.sets.map(set => ({ ...set })) })),
  }));
  const currentWeek = Math.max(state.currentWeek, moving.length ? nextStart + 1 : nextStart);
  const current = programVersionAt(state, currentWeek);
  return { ...state, currentWeek, programs: current.programs, plans: current.plans, activePlanId: current.activePlanId,
    weekLogs: [...raw.weekLogs.map(l => l.weekNumber === nextStart ? { ...l, weekNumber: nextStart + 1, updatedAt } : l), ...copies],
    phaseRecordTransitions: { ...raw.phaseRecordTransitions, [`${previousPhaseId}:${lastWeek}:${nextId}`]: true },
  };
}
