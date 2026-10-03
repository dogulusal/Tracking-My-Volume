const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function loadTS(relativePath) {
  const filename = path.resolve(__dirname, '..', relativePath);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = new Module(filename);
  module.filename = filename;
  module.paths = Module._nodeModulePaths(path.dirname(filename));
  const nativeRequire = module.require.bind(module);
  module.require = id => id.startsWith('@/') ? loadTS(`src/${id.slice(2)}.ts`) : nativeRequire(id);
  module._compile(compiled, filename);
  return module.exports;
}

const { appReducer, initialState } = loadTS('src/context/appReducer.ts');
const { applyMigrations, CURRENT_DATA_VERSION } = loadTS('src/data/migrations.ts');
const { calculateExerciseStatus } = loadTS('src/utils/statusCalculator.ts');
const { syncExerciseLogs, syncProgramFromWorkout } = loadTS('src/utils/exerciseSync.ts');
const program = { id: 'lower2', name: 'Lower 2', exercises: [], order: 1, createdAt: '2026-09-10', updatedAt: '2026-09-10' };

test('program edits reorder a saved workout by exercise ID and add the new movement without changing sets', () => {
  const definition = id => ({ id, name: id, defaultSets: 1, defaultWeight: 20, defaultReps: 10, isActive: true });
  const edited = { ...program, exercises: [definition('triceps'), definition('new'), definition('bench')] };
  const saved = [
    { exerciseId: 'bench', exerciseName: 'Old bench', sets: [{ weight: 80, reps: 5, intensity: 'failure' }] },
    { exerciseId: 'triceps', exerciseName: 'Triceps', sets: [{ weight: 25, reps: 8, intensity: 'rir1' }] },
  ];
  const result = syncExerciseLogs(edited, saved, ex => ({ exerciseId: ex.id, exerciseName: ex.name, sets: [] }));
  assert.deepEqual(result.map(ex => ex.exerciseId), ['triceps', 'new', 'bench']);
  assert.deepEqual(result[2].sets, saved[0].sets);
  assert.deepEqual(saved.map(ex => ex.exerciseId), ['bench', 'triceps']);
});

test('editing the current program is visible to both current-week views and preserves earlier weeks', () => {
  const definition = id => ({ id, name: id, defaultSets: 1, defaultWeight: 20, defaultReps: 10, isActive: true });
  const original = { ...program, exercises: [definition('bench'), definition('triceps')] };
  const edited = { ...original, exercises: [definition('triceps'), definition('new'), definition('bench')] };
  const plan = { id: 'plan', name: 'Plan', programIds: [program.id], createdAt: '', updatedAt: '' };
  const state = { ...initialState, currentWeek: 2, programs: [original], plans: [plan], activePlanId: plan.id,
    programVersions: [{ phaseId: 'phase-1', fromWeek: 0, programs: [original], plans: [plan], activePlanId: plan.id }] };
  const changed = appReducer(state, { type: 'UPDATE_PROGRAM', atWeek: 2, payload: edited });
  assert.deepEqual(programVersionAt(changed, 1).programs[0].exercises.map(ex => ex.id), ['bench', 'triceps']);
  assert.deepEqual(programVersionAt(changed, 2).programs[0].exercises.map(ex => ex.id), ['triceps', 'new', 'bench']);
  assert.deepEqual(changed.programs[0].exercises.map(ex => ex.id), ['triceps', 'new', 'bench']);
});

test('saving a workout updates only edited exercise defaults and order in the program', () => {
  const definition = (id, weight) => ({ id, name: id, defaultSets: 1, defaultWeight: weight, defaultReps: 10, isActive: true });
  const before = { ...program, exercises: [definition('bench', 80), definition('triceps', 20)] };
  const logs = [
    { exerciseId: 'triceps', exerciseName: 'triceps', sets: [{ weight: 25, reps: 12, intensity: 'failure' }] },
    { exerciseId: 'bench', exerciseName: 'bench', sets: [{ weight: 85, reps: 8, intensity: 'failure' }] },
  ];
  const after = syncProgramFromWorkout(before, logs, new Set(['triceps']), true);
  assert.deepEqual(after.exercises.map(ex => ex.id), ['triceps', 'bench']);
  assert.deepEqual([after.exercises[0].defaultWeight, after.exercises[0].defaultReps], [25, 12]);
  assert.equal(after.exercises[1].defaultWeight, 80);
  assert.equal(after.exercises[1].defaultReps, 10);
});

test('program editor changes matching current-week sets without touching earlier results', () => {
  const exercise = { id: 'bench', name: 'Bench', defaultSets: 2, defaultWeight: 80, defaultReps: 10, isActive: true };
  const before = { ...program, exercises: [exercise] };
  const after = { ...program, exercises: [{ ...exercise, defaultWeight: 82, defaultReps: 11 }] };
  const plan = { id: 'plan', name: 'Plan', programIds: [program.id], createdAt: '', updatedAt: '' };
  const log = week => ({ id: `log${week}`, programId: program.id, weekNumber: week, date: '', notes: '', isHoliday: false, updatedAt: '2026-09-20', exercises: [
    { exerciseId: 'bench', exerciseName: 'Bench', sets: [{ weight: 80, reps: 10, intensity: 'failure' }, { weight: 90, reps: 8, intensity: 'failure' }] },
  ] });
  const state = { ...initialState, currentWeek: 2, programs: [before], plans: [plan], activePlanId: plan.id, weekLogs: [log(1), log(2)],
    programVersions: [{ phaseId: 'phase-1', fromWeek: 0, programs: [before], plans: [plan], activePlanId: plan.id }] };
  const changed = appReducer(state, { type: 'UPDATE_PROGRAM', atWeek: 2, payload: after, syncCurrentLog: true });
  assert.deepEqual(changed.weekLogs[0], state.weekLogs[0]);
  assert.deepEqual(changed.weekLogs[1].exercises[0].sets.map(set => [set.weight, set.reps]), [[82, 11], [90, 8]]);
});

test('older saved workout edits are reconciled once with the current program', () => {
  const definition = id => ({ id, name: id, defaultSets: 1, defaultWeight: 20, defaultReps: 10, isActive: true });
  const before = { ...program, updatedAt: '2026-09-19T00:00:00.000Z', exercises: [definition('bench'), definition('triceps')] };
  const plan = { id: 'plan', name: 'Plan', programIds: [program.id], createdAt: '', updatedAt: '' };
  const currentLog = { id: 'current', programId: program.id, weekNumber: 2, date: '', notes: '', isHoliday: false, updatedAt: '2026-09-20T00:00:00.000Z', exercises: [
    { exerciseId: 'triceps', exerciseName: 'triceps', sets: [{ weight: 30, reps: 12, intensity: 'failure' }] },
    { exerciseId: 'bench', exerciseName: 'bench', sets: [{ weight: 80, reps: 8, intensity: 'failure' }] },
  ] };
  const state = { ...initialState, dataVersion: 9, currentWeek: 2, programs: [before], plans: [plan], activePlanId: plan.id, weekLogs: [currentLog],
    programVersions: [{ phaseId: 'phase-1', fromWeek: 0, programs: [before], plans: [plan], activePlanId: plan.id }] };
  const migrated = applyMigrations(state);
  assert.deepEqual(programVersionAt(migrated, 2).programs[0].exercises.map(ex => ex.id), ['triceps', 'bench']);
  assert.deepEqual(programVersionAt(migrated, 1).programs[0].exercises.map(ex => ex.id), ['bench', 'triceps']);
  assert.equal(programVersionAt(migrated, 2).programs[0].exercises[0].defaultWeight, 30);
  assert.deepEqual(migrated.exerciseRowOrder[program.id], ['triceps', 'bench']);
  assert.deepEqual(migrated.weekLogs, state.weekLogs);
  assert.deepEqual(applyMigrations(migrated), migrated);
});

test('editing an earlier Phase 3 week also updates the current dashboard program', () => {
  const exercise = id => ({ id, name: id, defaultSets: 1, defaultWeight: 20, defaultReps: 10, isActive: true });
  const old = { ...program, id: 'upper1', exercises: [exercise('old')] };
  const revised = { ...old, exercises: [exercise('new')] };
  const plan = { id: 'plan', name: 'Plan', programIds: ['upper1'], createdAt: '', updatedAt: '' };
  const phases = [{ id: 'p1', name: 'Faz 1', startWeek: 0, endWeek: 14 },
    { id: 'p2', name: 'Faz 2', startWeek: 15, endWeek: 35 },
    { id: 'p3', name: 'Faz 3', startWeek: 36, endWeek: null }];
  const state = { ...initialState, currentWeek: 37, phases, programs: [old], plans: [plan], activePlanId: 'plan',
    programVersions: phases.map(p => ({ phaseId: p.id, fromWeek: 0, programs: [old], plans: [plan], activePlanId: 'plan' })) };
  const changed = appReducer(state, { type: 'UPDATE_PROGRAM', atWeek: 36, payload: revised });
  assert.deepEqual(programVersionAt(changed, 37).programs[0].exercises.map(ex => ex.id), ['new']);
  assert.deepEqual(changed.programs[0].exercises.map(ex => ex.id), ['new']);
  assert.deepEqual(programVersionAt(changed, 35).programs[0].exercises.map(ex => ex.id), ['old']);
});

test('the earlier-week edit reaches the dashboard program in whichever phase is current, not only the third', () => {
  const exercise = id => ({ id, name: id, defaultSets: 1, defaultWeight: 20, defaultReps: 10, isActive: true });
  const old = { ...program, id: 'upper1', exercises: [exercise('old')] };
  const revised = { ...old, exercises: [exercise('new')] };
  const plan = { id: 'plan', name: 'Plan', programIds: ['upper1'], createdAt: '', updatedAt: '' };
  const phases = [{ id: 'p1', name: 'Faz 1', startWeek: 0, endWeek: 14 },
    { id: 'p2', name: 'Faz 2', startWeek: 15, endWeek: 35 },
    { id: 'p3', name: 'Faz 3', startWeek: 36, endWeek: 39 },
    { id: 'p4', name: 'Faz 4', startWeek: 40, endWeek: null }];
  const version = (phaseId, fromWeek) => ({ phaseId, fromWeek, programs: [old], plans: [plan], activePlanId: 'plan' });
  // Faz 4 has a later version at H1, so without propagation week 42 keeps 'old'.
  const state = { ...initialState, currentWeek: 42, phases, programs: [old], plans: [plan], activePlanId: 'plan',
    programVersions: [...phases.map(p => version(p.id, 0)), version('p4', 1)] };
  const changed = appReducer(state, { type: 'UPDATE_PROGRAM', atWeek: 40, payload: revised });
  assert.deepEqual(programVersionAt(changed, 42).programs[0].exercises.map(ex => ex.id), ['new']);
  assert.deepEqual(changed.programs[0].exercises.map(ex => ex.id), ['new']);
  assert.deepEqual(programVersionAt(changed, 39).programs[0].exercises.map(ex => ex.id), ['old']);
  // An edit in a finished phase stays in that phase.
  const past = appReducer(state, { type: 'UPDATE_PROGRAM', atWeek: 36, payload: revised });
  assert.deepEqual(programVersionAt(past, 42).programs[0].exercises.map(ex => ex.id), ['old']);
});

const { excludeProgramFromPhase, initializeProgramVersions, programVersionAt, programsForPhase, removeExerciseFromPhase } = loadTS('src/utils/programVersions.ts');
function versionFixture() {
  const oldExercise = { id: 'old', name: 'Old squat', defaultSets: 2, defaultWeight: 30, defaultReps: 14, isActive: true };
  const fixtureProgram = { ...program, id: 'upper1', name: 'Upper 1' };
  const newProgram = { ...fixtureProgram, exercises: [{ ...oldExercise, id: 'new', name: 'New squat' }] };
  const plan = { id: 'plan', name: 'Plan', programIds: [fixtureProgram.id], createdAt: '', updatedAt: '' };
  const log = (week, name) => ({ id: `log${week}`, programId: fixtureProgram.id, weekNumber: week, date: '2026-09-14', notes: 'keep note', isHoliday: false, updatedAt: '', exercises: [{ exerciseId: 'old', exerciseName: name, sets: [{ weight: 30, reps: 14, intensity: 'failure' }, { weight: 30, reps: 13, intensity: 'rir1' }] }] });
  return { ...initialState, dataVersion: 5, currentWeek: 36, programs: [newProgram], plans: [plan], activePlanId: plan.id,
    phases: [{ id: 'p1', name: 'Faz 1', startWeek: 0, endWeek: 14 }, { id: 'p2', name: 'Faz 2', startWeek: 15, endWeek: 34 }, { id: 'p3', name: 'Faz 3', startWeek: 35, endWeek: null }],
    weekLogs: [log(14, 'First phase squat'), log(34, 'Second phase squat'), log(35, 'H20 squat')] };
}

test('legacy phase programs are reconstructed independently and the migrated H1 edit is retained', () => {
  const raw = versionFixture();
  const state = applyMigrations(raw);
  assert.equal(programVersionAt(state, 14).programs[0].exercises[0].name, 'First phase squat');
  assert.equal(programVersionAt(state, 34).programs[0].exercises[0].name, 'Second phase squat');
  assert.equal(programVersionAt(state, 35).programs[0].exercises[0].name, 'H20 squat');
  assert.equal(programVersionAt(state, 36).programs[0].exercises[0].name, 'H20 squat');
  assert.equal(programVersionAt(state, 37).programs[0].exercises[0].name, 'New squat');
  assert.deepEqual(state.weekLogs.filter(l => l.weekNumber <= 35), raw.weekLogs);
  assert.deepEqual(applyMigrations(state), state);
});

test('explicit H20 transition gives H0 the same program and results while isolating H1', () => {
  const raw = versionFixture();
  const configured = appReducer(raw, { type: 'CONFIGURE_PHASE_TRANSITION', payload: { previousPhaseId: 'p2', lastWeek: 20, nextId: 'p3' } });
  assert.equal(configured.phases[1].endWeek, 35);
  assert.equal(configured.phases[2].startWeek, 36);
  const h20 = programVersionAt(configured, 35);
  assert.equal(h20.programs[0].exercises[0].name, 'H20 squat');
  assert.equal(h20.programs[0].exercises[0].defaultSets, 2);
  assert.deepEqual(programVersionAt(configured, 36).programs, h20.programs);
  assert.equal(programVersionAt(configured, 37).programs[0].exercises[0].name, 'New squat');
  assert.deepEqual(configured.weekLogs.filter(l => l.weekNumber < 36), raw.weekLogs);
  assert.deepEqual(configured.weekLogs.find(l => l.weekNumber === 36).exercises, raw.weekLogs.find(l => l.weekNumber === 35).exercises);
  const edited = appReducer(configured, { type: 'UPDATE_PROGRAM', atWeek: 37, payload: { ...programVersionAt(configured, 37).programs[0], exercises: [] } });
  assert.equal(programVersionAt(edited, 37).programs[0].exercises.length, 0);
  assert.deepEqual(programVersionAt(edited, 35).programs, h20.programs);
  assert.deepEqual(programVersionAt(edited, 36).programs, h20.programs);
  assert.equal(edited.weekLogs, configured.weekLogs);
  assert.equal('weekLogs' in edited.programVersions[0], false);
});

test('H20 stays intact, current H0 moves to H1 with all values and repeated application is a no-op', () => {
  const raw = versionFixture();
  raw.phases[1].endWeek = 35;
  raw.phases[2].startWeek = 36;
  const h20 = raw.weekLogs.find(l => l.weekNumber === 35);
  const h0 = { ...h20, id: 'current-h0', weekNumber: 36, notes: 'current notes', date: '2026-09-16',
    exercises: [{ exerciseId: 'new', exerciseName: 'New squat', sets: [{ weight: 40, reps: 8, intensity: 'failure' }, { weight: 40, reps: 7, intensity: 'rir1' }] }] };
  raw.weekLogs.push(h0);
  const before = JSON.stringify(raw);
  const action = { type: 'CONFIGURE_PHASE_TRANSITION', payload: { previousPhaseId: 'p2', lastWeek: 20, nextId: 'p3' } };
  const result = appReducer(raw, action);
  assert.equal(JSON.stringify(raw), before);
  assert.equal(result.weekLogs.find(l => l.weekNumber === 35), h20);
  const baseline = result.weekLogs.find(l => l.weekNumber === 36);
  assert.deepEqual(baseline.exercises, h20.exercises);
  assert.equal(baseline.notes, h20.notes);
  assert.equal(baseline.date, h20.date);
  assert.notEqual(baseline.id, h20.id);
  const moved = result.weekLogs.find(l => l.weekNumber === 37);
  assert.equal(moved.id, h0.id);
  assert.deepEqual(moved.exercises, h0.exercises);
  assert.equal(moved.notes, h0.notes);
  assert.equal(moved.date, h0.date);
  assert.equal(result.currentWeek, 37);
  assert.equal(appReducer(result, action), result);
  const restored = JSON.parse(JSON.stringify(result));
  assert.equal(appReducer(restored, action), restored);
});

test('phase record transfer does not overwrite an occupied H1 or invent a missing H20', () => {
  const raw = versionFixture();
  const h20 = raw.weekLogs.find(l => l.weekNumber === 35);
  raw.weekLogs.push({ ...h20, id: 'h0', weekNumber: 36 }, { ...h20, id: 'h1', weekNumber: 37 });
  const action = { type: 'CONFIGURE_PHASE_TRANSITION', payload: { previousPhaseId: 'p2', lastWeek: 20, nextId: 'p3' } };
  assert.equal(appReducer(raw, action), raw);
  const missing = { ...raw, weekLogs: [] };
  assert.equal(appReducer(missing, action), missing);
});

test('v7 migration automatically moves Faz 2 H20, H0 and H1 exactly once', () => {
  const raw = versionFixture();
  raw.dataVersion = 6;
  raw.phases[1].endWeek = 35;
  raw.phases[2].startWeek = 36;
  const h20 = raw.weekLogs.find(l => l.weekNumber === 35);
  const h0 = { ...h20, id: 'automatic-h0', weekNumber: 36, notes: 'move me', date: '2026-09-16' };
  raw.weekLogs.push(h0);
  const migrated = applyMigrations(raw);
  assert.equal(migrated.dataVersion, CURRENT_DATA_VERSION);
  assert.deepEqual(migrated.weekLogs.find(l => l.weekNumber === 36).exercises, h20.exercises);
  assert.equal(migrated.weekLogs.find(l => l.weekNumber === 37).id, h0.id);
  assert.equal(migrated.weekLogs.find(l => l.weekNumber === 37).notes, 'move me');
  assert.deepEqual(applyMigrations(migrated), migrated);
});

test('Faz 3 excludes Lower 2 while Faz 1–2 and real historical records remain intact', () => {
  const raw = versionFixture();
  const phase2Log = raw.weekLogs.find(l => l.weekNumber === 35);
  raw.programVersions = [
    { phaseId: 'p1', fromWeek: 0, programs: [program], plans: raw.plans, activePlanId: 'plan' },
    { phaseId: 'p2', fromWeek: 0, programs: [program], plans: raw.plans, activePlanId: 'plan' },
    { phaseId: 'p3', fromWeek: 0, programs: [program], plans: raw.plans, activePlanId: 'plan' },
  ];
  raw.weekLogs.push({ ...phase2Log, id: 'p3-baseline-source', programId: 'lower2', weekNumber: 36 });
  const result = excludeProgramFromPhase(raw, 'p3', 'lower2');
  assert.equal(programVersionAt(result, 14).programs.some(p => p.id === 'lower2'), true);
  assert.equal(programVersionAt(result, 34).programs.some(p => p.id === 'lower2'), true);
  assert.equal(programVersionAt(result, 36).programs.some(p => p.id === 'lower2'), false);
  assert.equal(programVersionAt(result, 36).plans[0].programIds.includes('lower2'), false);
  assert.equal(result.weekLogs.includes(phase2Log), true);
  assert.equal(result.weekLogs.some(l => l.id === 'p3-baseline-source'), false);
});

test('v8 migration removes Lower 2 only from Faz 3 and is stable after reload', () => {
  const raw = versionFixture();
  raw.dataVersion = 7;
  raw.programVersions = [
    { phaseId: 'p1', fromWeek: 0, programs: [program], plans: raw.plans, activePlanId: 'plan' },
    { phaseId: 'p2', fromWeek: 0, programs: [program], plans: raw.plans, activePlanId: 'plan' },
    { phaseId: 'p3', fromWeek: 0, programs: [program], plans: raw.plans, activePlanId: 'plan' },
  ];
  const migrated = applyMigrations(raw);
  assert.equal(programVersionAt(migrated, 34).programs[0].id, 'lower2');
  assert.equal(programVersionAt(migrated, 36).programs.length, 0);
  assert.deepEqual(applyMigrations(migrated), migrated);
});

test('phase exercise removal clears every version and log in that phase while preserving older phases', () => {
  const shortHead = { id: 'u1_triceps_short', name: 'Triceps Short Head', defaultSets: 1, defaultWeight: 60, defaultReps: 8, isActive: true };
  const press = { id: 'u1_press', name: 'Shoulder Press', defaultSets: 1, defaultWeight: 40, defaultReps: 8, isActive: true };
  const upper1 = { ...program, id: 'upper1', name: 'Upper 1', exercises: [press, shortHead] };
  const plan = { id: 'plan', name: 'Plan', programIds: ['upper1'], createdAt: '', updatedAt: '' };
  const exerciseLogs = [press, shortHead].map(exercise => ({ exerciseId: exercise.id, exerciseName: exercise.name, sets: [{ weight: exercise.defaultWeight, reps: 8, intensity: 'failure' }] }));
  const raw = {
    ...versionFixture(), dataVersion: CURRENT_DATA_VERSION, currentWeek: 36, programs: [upper1], plans: [plan], activePlanId: 'plan',
    phases: [{ id: 'p1', name: 'Faz 1', startWeek: 0, endWeek: 14 }, { id: 'p2', name: 'Faz 2', startWeek: 15, endWeek: 35 }, { id: 'p3', name: 'Faz 3', startWeek: 36, endWeek: null }],
    programVersions: [
      { phaseId: 'p2', fromWeek: 0, programs: [upper1], plans: [plan], activePlanId: 'plan' },
      { phaseId: 'p3', fromWeek: 0, programs: [upper1], plans: [plan], activePlanId: 'plan' },
      { phaseId: 'p3', fromWeek: 1, programs: [upper1], plans: [plan], activePlanId: 'plan' },
    ],
    weekLogs: [
      { id: 'p2-log', programId: 'upper1', weekNumber: 35, date: '', notes: '', isHoliday: false, updatedAt: '', exercises: exerciseLogs },
      { id: 'p3-log', programId: 'upper1', weekNumber: 36, date: '', notes: '', isHoliday: false, updatedAt: '', exercises: exerciseLogs },
    ],
  };
  const result = removeExerciseFromPhase(raw, 'p3', 'upper1', 'u1_triceps_short');
  assert.equal(programVersionAt(result, 35).programs[0].exercises.some(e => e.id === 'u1_triceps_short'), true);
  assert.equal(result.weekLogs.find(log => log.id === 'p2-log').exercises.some(e => e.exerciseId === 'u1_triceps_short'), true);
  assert.equal(result.programVersions.filter(v => v.phaseId === 'p3').every(v => v.programs[0].exercises.every(e => e.id !== 'u1_triceps_short')), true);
  assert.equal(result.weekLogs.find(log => log.id === 'p3-log').exercises.some(e => e.exerciseId === 'u1_triceps_short'), false);
  assert.equal(result.weekLogs.find(log => log.id === 'p3-log').exercises.some(e => e.exerciseId === 'u1_press'), true);
});

test('v9 migration removes Triceps Short Head from all three Upper days in Faz 3 only', () => {
  const shortHead = suffix => ({ id: `${suffix}_triceps_short`, name: 'Triceps Short Head', defaultSets: 1, defaultWeight: 60, defaultReps: 8, isActive: true });
  const upperPrograms = ['upper1', 'upper2', 'upper3'].map((id, order) => ({ ...program, id, name: `Upper ${order + 1}`, order, exercises: [shortHead(id)] }));
  const plan = { id: 'plan', name: 'Plan', programIds: upperPrograms.map(p => p.id), createdAt: '', updatedAt: '' };
  const raw = {
    ...versionFixture(), dataVersion: 8, currentWeek: 36, programs: upperPrograms, plans: [plan], activePlanId: 'plan',
    phases: [{ id: 'p1', name: 'Faz 1', startWeek: 0, endWeek: 14 }, { id: 'p2', name: 'Faz 2', startWeek: 15, endWeek: 35 }, { id: 'p3', name: 'Faz 3', startWeek: 36, endWeek: null }],
    programVersions: [
      { phaseId: 'p2', fromWeek: 0, programs: upperPrograms, plans: [plan], activePlanId: 'plan' },
      { phaseId: 'p3', fromWeek: 0, programs: upperPrograms, plans: [plan], activePlanId: 'plan' },
    ],
    weekLogs: upperPrograms.flatMap(p => [35, 36].map(weekNumber => ({ id: `${p.id}-${weekNumber}`, programId: p.id, weekNumber, date: '', notes: '', isHoliday: false, updatedAt: '', exercises: [{ exerciseId: p.exercises[0].id, exerciseName: 'Triceps Short Head', sets: [{ weight: 60, reps: 8, intensity: 'failure' }] }] }))),
  };
  const migrated = applyMigrations(raw);
  assert.equal(migrated.programVersions.find(v => v.phaseId === 'p2').programs.every(p => p.exercises.length === 1), true);
  assert.equal(migrated.weekLogs.filter(log => log.weekNumber === 35).every(log => log.exercises.length === 1), true);
  assert.equal(migrated.programVersions.find(v => v.phaseId === 'p3').programs.every(p => p.exercises.length === 0), true);
  assert.equal(migrated.weekLogs.filter(log => log.weekNumber === 36).every(log => log.exercises.length === 0), true);
  assert.deepEqual(applyMigrations(migrated), migrated);
});

test('v11 restores archived Upper 1 from its own logs and clears only Phase 3 Upper 3 rows', () => {
  const make = (id, name) => ({ id, name, defaultSets: 1, defaultWeight: 20, defaultReps: 10, isActive: true });
  const upper1 = { ...program, id: 'upper1', name: 'Upper 1', exercises: [make('phase3', 'Phase 3 press')] };
  const upper3 = { ...program, id: 'upper3', name: 'Upper 3', exercises: [make('low', 'Low Row'), make('single', 'Single Row'), make('press', 'Press')] };
  const plan = { id: 'plan', name: 'Plan', programIds: ['upper1', 'upper3'], createdAt: '', updatedAt: '' };
  const phases = [{ id: 'p1', name: 'Faz 1', startWeek: 0, endWeek: 14 },
    { id: 'p2', name: 'Faz 2', startWeek: 15, endWeek: 35 },
    { id: 'p3', name: 'Faz 3', startWeek: 36, endWeek: null }];
  const log = (programId, week, exercises) => ({ id: `${programId}-${week}`, programId, weekNumber: week,
    date: '', notes: '', isHoliday: false, updatedAt: '', exercises: exercises.map(([id, name]) => ({
      exerciseId: id, exerciseName: name, sets: [{ weight: 20, reps: 10, intensity: 'failure' }],
    })) });
  const state = { ...initialState, dataVersion: 10, currentWeek: 37, phases,
    programs: [upper1, upper3], plans: [plan], activePlanId: 'plan',
    programVersions: phases.map(p => ({ phaseId: p.id, fromWeek: 0, programs: [upper1, upper3], plans: [plan], activePlanId: 'plan' })),
    weekLogs: [log('upper1', 14, [['first', 'Phase 1 press']]), log('upper1', 35, [['second', 'Phase 2 press']]),
      log('upper3', 14, [['low', 'Low Row']]), log('upper3', 35, [['single', 'Single Row']]),
      log('upper3', 36, [['low', 'Low Row'], ['single', 'Single Row'], ['press', 'Press']])] };
  const result = applyMigrations(state);
  assert.deepEqual(programVersionAt(result, 14).programs.find(p => p.id === 'upper1').exercises.map(e => e.id), ['first']);
  assert.deepEqual(programVersionAt(result, 35).programs.find(p => p.id === 'upper1').exercises.map(e => e.id), ['second']);
  assert.deepEqual(programVersionAt(result, 37).programs.find(p => p.id === 'upper1').exercises.map(e => e.id), ['phase3']);
  assert.deepEqual(programVersionAt(result, 37).programs.find(p => p.id === 'upper3').exercises.map(e => e.id), ['press']);
  assert.deepEqual(result.weekLogs.find(l => l.programId === 'upper3' && l.weekNumber === 36).exercises.map(e => e.exerciseId), ['press']);
  assert.deepEqual(result.weekLogs.find(l => l.programId === 'upper3' && l.weekNumber === 35).exercises.map(e => e.exerciseId), ['single']);
  assert.deepEqual(applyMigrations(result), result);
});

test('day removal, copying and future effective weeks respect phase boundaries and survive JSON reload', () => {
  let state = initializeProgramVersions(versionFixture());
  const baseline = programVersionAt(state, 35);
  state = appReducer(state, { type: 'UPDATE_PLAN', atWeek: 36, payload: { ...programVersionAt(state, 36).plans[0], programIds: [] } });
  assert.deepEqual(programVersionAt(state, 36).plans[0].programIds, []);
  assert.deepEqual(programVersionAt(state, 35).plans, baseline.plans);
  state = appReducer(state, { type: 'COPY_PHASE_PROGRAM', payload: { week: 36, sourceWeek: 35 } });
  assert.deepEqual(programVersionAt(state, 36).programs, baseline.programs);
  state = appReducer(state, { type: 'UPDATE_PROGRAM', atWeek: 38, payload: { ...baseline.programs[0], name: 'Future day' } });
  assert.notEqual(programVersionAt(state, 37).programs[0].name, 'Future day');
  assert.equal(programVersionAt(state, 38).programs[0].name, 'Future day');
  const restored = applyMigrations(JSON.parse(JSON.stringify({ ...state, dataVersion: CURRENT_DATA_VERSION })));
  assert.deepEqual(restored.programVersions, state.programVersions);
  assert.equal(programsForPhase(restored, 'p1')[0].exercises[0].name, 'First phase squat');
});

test('new phases preserve earlier program definitions when their first week is edited', () => {
  const raw = { ...versionFixture(), currentWeek: 37 };
  const { normalizePhaseBoundaries } = loadTS('src/utils/phases.ts');
  let state = appReducer(raw, { type: 'SET_PHASES', payload: normalizePhaseBoundaries([...raw.phases, { id: 'p4', name: 'Faz 4', startWeek: 37, endWeek: null }]) });
  const old = programVersionAt(state, 36);
  state = appReducer(state, { type: 'UPDATE_PROGRAM', payload: { ...programVersionAt(state, 37).programs[0], exercises: [] } });
  assert.deepEqual(programVersionAt(state, 36), old);
  assert.equal(programVersionAt(state, 37).programs[0].exercises.length, 0);
});

// Two phases, the second from week 15: these tests are about phase
// boundaries, whatever a new person starts with.
const twoPhaseState = { ...initialState, phases: [
  { id: 'phase-1', name: 'Faz 1', startWeek: 0, endWeek: 14 },
  { id: 'phase-2', name: 'Faz 2', startWeek: 15, endWeek: null },
] };

test('entering a future phase freezes its inherited baseline and activates scheduled program changes', () => {
  let state = appReducer(twoPhaseState, { type: 'ADD_PROGRAM', payload: program });
  assert.equal(programVersionAt(state, 15).programs[0].id, program.id);
  state = appReducer(state, { type: 'UPDATE_PROGRAM', atWeek: 16, payload: { ...program, name: 'H1 plan' } });
  state = appReducer(state, { type: 'SET_WEEK', payload: 15 });
  assert.equal(state.programs[0].name, program.name);
  state = appReducer(state, { type: 'INCREMENT_WEEK' });
  assert.equal(state.programs[0].name, 'H1 plan');
  state = appReducer(state, { type: 'UPDATE_PROGRAM', atWeek: 14, payload: { ...program, name: 'Changed earlier phase' } });
  assert.equal(programVersionAt(state, 15).programs[0].name, program.name);
});

test('phase settings close previous ranges when an earlier program-change week is selected', () => {
  const { normalizePhaseBoundaries } = loadTS('src/utils/phases.ts');
  const original = [...twoPhaseState.phases, { id: 'third', name: ' Faz 3 ', startWeek: 35, endWeek: null }];
  const phases = normalizePhaseBoundaries(original);
  assert.equal(phases[1].endWeek, 34);
  assert.equal(phases[2].name, 'Faz 3');
  assert.equal(phases[2].endWeek, null);
  const state = { ...twoPhaseState, currentWeek: 36, weekLogs: [{ id: 'past', weekNumber: 35, notes: 'keep' }] };
  const result = appReducer(state, { type: 'SET_PHASES', payload: phases });
  assert.equal(result.weekLogs, state.weekLogs);
  assert.equal(result.currentWeek, 36);
  assert.equal(original[1].endWeek, null);
  assert.throws(() => normalizePhaseBoundaries([...twoPhaseState.phases, { id: 'duplicate-start', name: 'Faz 3', startWeek: 15 }]), /aynı haftadan/);
  assert.throws(() => normalizePhaseBoundaries([{ id: 'first', name: 'Faz', startWeek: -1 }]), /İlk faz/);
  assert.throws(() => normalizePhaseBoundaries([{ id: 'first', name: '', startWeek: 0 }]), /ad ver/);
});

test('OAuth returns to the application root without forwarding route, query or fragment', () => {
  const { authRedirectUrl } = loadTS('src/utils/authRedirect.ts');
  assert.equal(authRedirectUrl('https://dogulusal.github.io/history?from=export#example', '/Tracking-My-Volume/'), 'https://dogulusal.github.io/Tracking-My-Volume/');
  assert.equal(authRedirectUrl('http://localhost:5173/workout', '/'), 'http://localhost:5173/');
});

test('clearing a history column removes notes and holiday without affecting adjacent weeks or programs', () => {
  const log = { id: 'a', programId: 'lower1', weekNumber: 35, notes: 'note', isHoliday: true, exercises: [{ exerciseId: 'squat', sets: [{ reps: 8 }] }] };
  const state = { ...initialState, currentWeek: 36, weekLogs: [log, { ...log, id: 'duplicate' }, { ...log, id: 'next', weekNumber: 36 }, { ...log, id: 'other', programId: 'upper1' }] };
  const result = appReducer(state, { type: 'CLEAR_HISTORY_DATA', payload: { programId: 'lower1', weeks: [35] } });
  assert.deepEqual(result.weekLogs.map(l => l.id), ['next', 'other']);
  assert.equal(result.currentWeek, 36);
  assert.equal(state.weekLogs.length, 4);
});

test('first program creates a usable active plan without seeded history', () => {
  const result = appReducer(initialState, { type: 'ADD_PROGRAM', payload: program });
  assert.equal(result.plans.length, 1);
  assert.equal(result.activePlanId, result.plans[0].id);
  assert.deepEqual(result.plans[0].programIds, ['lower2']);
  assert.deepEqual(result.weekLogs, []);
});

test('adding a copied day attaches it only to the active plan and preserves logs', () => {
  const log = { id: 'past-log', programId: 'lower2', weekNumber: 20, exercises: [] };
  const state = { ...initialState, programs: [program], activePlanId: 'plan-b', plans: [
    { id: 'plan-a', programIds: ['lower2'] }, { id: 'plan-b', programIds: ['lower2'] },
  ], weekLogs: [log] };
  const result = appReducer(state, { type: 'ADD_PROGRAM', payload: { ...program, id: 'copy', name: 'Lower 2 · 2' } });
  assert.deepEqual(result.plans[0].programIds, ['lower2']);
  assert.deepEqual(result.plans[1].programIds, ['lower2', 'copy']);
  assert.deepEqual(result.weekLogs, [log]);
  assert.deepEqual(state.plans[1].programIds, ['lower2']);
});

test('removing a day from one plan preserves history, program and other plan', () => {
  const state = { ...initialState, programs: [program], plans: [{ id: 'a', programIds: ['lower2'] }, { id: 'b', programIds: ['lower2'] }], weekLogs: [{ id: 'past', programId: 'lower2' }] };
  const result = appReducer(state, { type: 'UPDATE_PLAN', payload: { ...state.plans[0], programIds: [] } });
  assert.deepEqual(result.plans[0].programIds, []);
  assert.deepEqual(result.plans[1].programIds, ['lower2']);
  assert.deepEqual(result.programs, state.programs);
  assert.deepEqual(result.weekLogs, state.weekLogs);
});

test('removing an exercise definition leaves its historical sets intact', () => {
  const state = { ...initialState, programs: [{ ...program, exercises: [{ id: 'hack', name: 'Hack Squat', isActive: false }] }], weekLogs: [{ id: 'past', exercises: [{ exerciseId: 'hack', sets: [{ weight: 75, reps: 10 }] }] }] };
  const result = appReducer(state, { type: 'UPDATE_PROGRAM', payload: program });
  assert.deepEqual(result.programs[0].exercises, []);
  assert.deepEqual(result.weekLogs, state.weekLogs);
});

test('current user data and intentional empty state survive migration unchanged', () => {
  for (const programs of [[], [program]]) {
    const state = { ...initialState, programs, dataVersion: CURRENT_DATA_VERSION };
    assert.deepEqual(applyMigrations(state), state);
  }
});

test('reset stays empty after reload rather than triggering personal legacy migrations', () => {
  const reset = appReducer({ ...initialState, programs: [program] }, { type: 'RESET_DATA' });
  assert.deepEqual(applyMigrations(reset).programs, []);
  assert.deepEqual(applyMigrations(reset).weekLogs, []);
});

test('legacy migration still adds plan and phases without changing v3 workout records', () => {
  const log = { id: 'past', programId: 'lower2', weekNumber: 1 };
  const result = applyMigrations({ ...initialState, programs: [program], weekLogs: [log], phases: [], dataVersion: 3 });
  assert.deepEqual(result.weekLogs, [log]);
  assert.deepEqual(result.plans[0].programIds, ['lower2']);
  assert.equal(result.dataVersion, CURRENT_DATA_VERSION);
  assert.equal(result.phases.length, 2);
});

test('custom progress rule keeps improvement priority over simultaneous decline', () => {
  assert.equal(calculateExerciseStatus([{ weight: 62.5, reps: 5, intensity: 'rir1' }], [{ weight: 60, reps: 10, intensity: 'rir1' }]), 'improved');
  assert.equal(calculateExerciseStatus([{ weight: 60, reps: 10, intensity: 'rir2' }], [{ weight: 60, reps: 10, intensity: 'rir1' }]), 'improved');
  assert.equal(calculateExerciseStatus([{ weight: 60, reps: 9, intensity: 'rir1' }], [{ weight: 60, reps: 10, intensity: 'rir1' }]), 'decreased');
});

test('extra unmatched sets and missing reference retain the custom status rules', () => {
  const set = { weight: 60, reps: 10, intensity: 'failure' };
  assert.equal(calculateExerciseStatus([set, { ...set, weight: 50 }], [set]), 'same');
  assert.equal(calculateExerciseStatus([set], []), 'new');
  assert.equal(calculateExerciseStatus([], [set]), 'removed');
});

const { formatSets } = loadTS('src/utils/formatters.ts');

test('every set is written on its own line, in full, without pipes', () => {
  const set = { weight: 70, reps: 8, intensity: 'failure' };
  assert.equal(formatSets([set, set]), '70 x 8 F\n70 x 8 F');
  assert.equal(formatSets([set, { ...set, intensity: 'rir1' }, set]), '70 x 8 F\n70 x 8 +1\n70 x 8 F');
  assert.equal(formatSets([set, { ...set, weight: 60 }, set]), '70 x 8 F\n60 x 8 F\n70 x 8 F');
  assert.equal(formatSets([set]), '70 x 8 F');
  assert.equal(formatSets([]), '');
});

const { normalizeGoogleSettings } = loadTS('src/utils/googleSheetsSettings.ts');
const { DEFAULT_SPREADSHEET_ID } = loadTS('src/config.ts');

test('new users never inherit another account’s spreadsheet', () => {
  assert.equal(normalizeGoogleSettings(null).spreadsheetId, DEFAULT_SPREADSHEET_ID);
  assert.equal(normalizeGoogleSettings({ spreadsheetId: '' }).spreadsheetId, DEFAULT_SPREADSHEET_ID);
  assert.equal(normalizeGoogleSettings({ spreadsheetId: 'https://docs.google.com/spreadsheets/d/replacement/edit?gid=1' }).spreadsheetId, 'replacement');
});

test('cloud preferences preserve custom files but exclude Google credentials', () => {
  const next = appReducer(initialState, { type: 'SET_GOOGLE_SHEETS_SETTINGS', payload: { spreadsheetId: 'replacement', access_token: 'not-to-sync', refresh_token: 'not-to-sync', tabByProgramId: { lower1: 'weak15-28' } } });
  assert.equal(next.googleSheetsSettings.spreadsheetId, 'replacement');
  assert.deepEqual(next.googleSheetsSettings.tabByProgramId, { lower1: 'weak15-28' });
  assert.equal(JSON.stringify(next).includes('not-to-sync'), false);
  assert.equal(appReducer(initialState, { type: 'IMPORT_DATA', payload: next }).googleSheetsSettings.spreadsheetId, 'replacement');
});

