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
const { buildSheetRows, mergeSheetRows } = loadTS('src/utils/sheetExport.ts');
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

test('sheet export keeps a new exercise row alongside already logged weeks', () => {
  const edited = { ...program, exercises: [{ id: 'new', name: 'New movement', defaultSets: 2, defaultWeight: 0, defaultReps: 0, isActive: true }] };
  const logs = [{ id: 'log', programId: program.id, weekNumber: 1, date: '', notes: '', isHoliday: false, updatedAt: '', exercises: [
    { exerciseId: 'old', exerciseName: 'Old movement', sets: [{ weight: 40, reps: 8, intensity: 'failure' }] },
  ] }];
  const rows = buildSheetRows({ program: edited, weekLogs: logs, fromWeek: 1, toWeek: 2, rowOrder: ['new', 'old'] });
  assert.deepEqual(rows.slice(1).map(row => row[0]), ['New movement', 'SIRA: New movement', 'Old movement', 'SIRA: Old movement']);
  assert.deepEqual(rows[1].slice(2), ['-', '-']);
  assert.equal(rows[3][2], '40x8F');
});

test('weekly order is exported separately while a movement stays on one results row', () => {
  const definition = id => ({ id, name: id, defaultSets: 1, defaultWeight: 0, defaultReps: 0, isActive: true });
  const ids = ['a', 'b', 'triceps', 'c', 'd', 'e', 'f'];
  const at = position => {
    const ordered = ids.filter(id => id !== 'triceps');
    ordered.splice(position - 1, 0, 'triceps');
    return { ...program, exercises: ordered.map(definition) };
  };
  const versions = [
    { phaseId: 'phase-1', fromWeek: 0, programs: [at(3)], plans: [], activePlanId: null },
    { phaseId: 'phase-1', fromWeek: 3, programs: [at(5)], plans: [], activePlanId: null },
    { phaseId: 'phase-1', fromWeek: 5, programs: [at(7)], plans: [], activePlanId: null },
  ];
  const state = { ...initialState, currentWeek: 5, programs: [at(7)], programVersions: versions };
  const rows = buildSheetRows({ program: at(7), weekLogs: [], fromWeek: 0, toWeek: 5, state });
  const results = rows.find(row => row[0] === 'triceps');
  const order = rows.find(row => row[0] === 'SIRA: triceps');
  assert.deepEqual(results.slice(2), ['-', '-', '-', '-', '-', '-']);
  assert.deepEqual(order.slice(2), ['3', '3', '3', '5', '5', '7']);
  assert.equal(parseTabularText(rows.map(row => row.join('\t')).join('\n')).rows.length, 7);
  const existing = [['Egzersiz', 'Set', 'H0'], ['triceps', '1', '25x8F']];
  const merged = mergeSheetRows(existing, rows);
  assert.equal(merged.unmergeable, false);
  assert.deepEqual(merged.rows.slice(1, 3).map(row => row[0]), ['triceps', 'SIRA: triceps']);
  assert.equal(merged.rows[1][2], '25x8F');
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
  let state = appReducer(raw, { type: 'START_NEXT_PHASE', payload: { id: 'p4', startAt: 'current' } });
  const old = programVersionAt(state, 36);
  state = appReducer(state, { type: 'UPDATE_PROGRAM', payload: { ...programVersionAt(state, 37).programs[0], exercises: [] } });
  assert.deepEqual(programVersionAt(state, 36), old);
  assert.equal(programVersionAt(state, 37).programs[0].exercises.length, 0);
});

test('entering a future phase freezes its inherited baseline and activates scheduled program changes', () => {
  let state = appReducer(initialState, { type: 'ADD_PROGRAM', payload: program });
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
  const original = [...initialState.phases, { id: 'third', name: ' Faz 3 ', startWeek: 35, endWeek: null }];
  const phases = normalizePhaseBoundaries(original);
  assert.equal(phases[1].endWeek, 34);
  assert.equal(phases[2].name, 'Faz 3');
  assert.equal(phases[2].endWeek, null);
  const state = { ...initialState, currentWeek: 36, weekLogs: [{ id: 'past', weekNumber: 35, notes: 'keep' }] };
  const result = appReducer(state, { type: 'SET_PHASES', payload: phases });
  assert.equal(result.weekLogs, state.weekLogs);
  assert.equal(result.currentWeek, 36);
  assert.equal(original[1].endWeek, null);
  assert.throws(() => normalizePhaseBoundaries([...initialState.phases, { id: 'duplicate-start', name: 'Faz 3', startWeek: 15 }]), /aynı haftadan/);
  assert.throws(() => normalizePhaseBoundaries([{ id: 'first', name: 'Faz', startWeek: -1 }]), /İlk faz/);
  assert.throws(() => normalizePhaseBoundaries([{ id: 'first', name: '', startWeek: 0 }]), /ad ver/);
});

test('OAuth returns to the application root without forwarding route, query or fragment', () => {
  const { authRedirectUrl } = loadTS('src/utils/authRedirect.ts');
  assert.equal(authRedirectUrl('https://dogulusal.github.io/history?from=export#example', '/Tracking-My-Volume/'), 'https://dogulusal.github.io/Tracking-My-Volume/');
  assert.equal(authRedirectUrl('http://localhost:5173/workout', '/'), 'http://localhost:5173/');
});

test('phase template reserves all workouts and phase history in separate blocks with reusable H0 mappings', () => {
  const { buildPhaseSheetLayout, buildPhaseTemplateRequests } = loadTS('src/utils/sheetTemplate.ts');
  const programs = [{ ...program, exercises: [{ id: 'curl', name: 'Curl', defaultSets: 2, isActive: true }] }, { ...program, id: 'upper', name: 'Upper', exercises: [] }];
  const layout = buildPhaseSheetLayout('Faz 3', 35, programs, [
    { programId: program.id, weekNumber: 34, exercises: [{ exerciseId: 'old', exerciseName: 'Old phase only', sets: [] }] },
    { programId: program.id, weekNumber: 35, exercises: [{ exerciseId: 'removed', exerciseName: 'Retained history', sets: [{ reps: 8 }] }] },
  ]);
  assert.deepEqual(layout.blocks[0].exercises.map(e => e.id), ['curl', 'removed']);
  assert.equal(layout.blocks.length, 2);
  assert.ok(layout.blocks[1].titleRow > layout.blocks[0].notesRow + 1);
  assert.equal(layout.mappings.lower2.header, 'C2');
  assert.equal(layout.mappings.lower2.week, 35);
  const requests = buildPhaseTemplateRequests(42, layout);
  assert.equal(requests[0].addSheet.properties.sheetId, 42);
  const cells = requests.find(r => r.updateCells).updateCells;
  assert.equal(cells.start.sheetId, 42);
  assert.equal(cells.rows[1].values[2].userEnteredValue.stringValue, 'H0');
  assert.equal(cells.rows[1].values[3].userEnteredValue.stringValue, 'H1');
  assert.equal(cells.rows[layout.blocks[0].notesRow - 1].values[0].userEnteredValue.stringValue, 'HAFTALIK NOTLAR');
  assert.equal(JSON.stringify(requests).includes('formulaValue'), false);
  assert.equal(requests[0].addSheet.properties.gridProperties.hideGridlines, true);
  assert.equal(requests[0].addSheet.properties.gridProperties.frozenColumnCount, 2);
  assert.ok(requests.some(r => r.mergeCells?.range.startRowIndex === layout.blocks[0].titleRow - 1));
  assert.ok(requests.some(r => r.updateBorders?.range.endRowIndex === layout.blocks[0].notesRow));
  assert.ok(requests.some(r => r.updateDimensionProperties?.properties.pixelSize === 72));
  const titleStyle = requests.find(r => r.repeatCell?.cell.userEnteredFormat.textFormat?.fontSize === 11);
  assert.deepEqual(titleStyle.repeatCell.cell.userEnteredFormat.backgroundColorStyle.rgbColor,
    { red: 41 / 255, green: 50 / 255, blue: 58 / 255 });
  const noteStyle = requests.find(r => r.repeatCell?.range.startRowIndex === layout.blocks[0].notesRow - 1
    && r.repeatCell?.cell.userEnteredFormat.wrapStrategy === 'CLIP');
  assert.ok(noteStyle);
});

test('new phase sheet creation rejects existing titles and creates layout in one batch', async () => {
  const { createPhaseTemplate } = loadTS('src/lib/googleSheets.ts');
  const { buildPhaseSheetLayout } = loadTS('src/utils/sheetTemplate.ts');
  const layout = buildPhaseSheetLayout('Faz 3', 35, [program], []);
  const previousFetch = global.fetch;
  const calls = [];
  let duplicate = true;
  global.fetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, json: async () => ({ sheets: [{ properties: { title: duplicate ? 'Faz 3' : 'Faz 2', sheetId: 1 } }] }) };
  };
  try {
    await assert.rejects(createPhaseTemplate('test', 'file', layout), /zaten var/);
    assert.equal(calls.length, 1);
    duplicate = false; calls.length = 0;
    const tab = await createPhaseTemplate('test', 'file', layout);
    assert.equal(tab.title, 'Faz 3');
    assert.equal(calls.length, 2);
    assert.equal(calls[1].init.method, 'POST');
    const requests = JSON.parse(calls[1].init.body).requests;
    assert.equal(requests[0].addSheet.properties.sheetId, tab.sheetId);
    assert.ok(requests.some(r => r.updateCells));
    assert.equal(calls.some(c => c.url.includes(':clear')), false);
  } finally { global.fetch = previousFetch; }
});

test('sheet mappings are merged by file, program and phase without modifying workout data', () => {
  const mapping = { tab: 'Faz 3', header: 'C2', week: 35, rows: { curl: 3 }, notesRow: 4 };
  const state = { ...initialState, sheetColumnMappings: { 'file:lower:15': { ...mapping, tab: 'Faz 2', week: 15 } } };
  const result = appReducer(state, { type: 'SET_SHEET_MAPPINGS', payload: { 'file:lower:35': mapping } });
  assert.equal(Object.keys(result.sheetColumnMappings).length, 2);
  assert.equal(result.sheetColumnMappings['file:lower:35'].rows.curl, 3);
  assert.equal(result.weekLogs, state.weekLogs);
});

test('current-week phase transition keeps current and future records intact without advancing the week', () => {
  const state = { ...initialState, currentWeek: 35, weekLogs: [34, 35, 36].map(weekNumber => ({ id: String(weekNumber), weekNumber, notes: 'preserved', exercises: [] })) };
  const result = appReducer(state, { type: 'START_NEXT_PHASE', payload: { id: 'phase3', startAt: 'current' } });
  assert.equal(result.currentWeek, 35);
  assert.equal(result.phases[1].endWeek, 34);
  assert.equal(result.phases[2].startWeek, 35);
  assert.equal(result.weekLogs, state.weekLogs);
  assert.equal(appReducer(result, { type: 'START_NEXT_PHASE', payload: { id: 'accidental-repeat', startAt: 'current' } }), result);
});

test('Sheets baseline is neutral gray', () => {
  const { SHEET_STATUS_COLORS } = loadTS('src/utils/sheetFormat.ts');
  assert.equal(SHEET_STATUS_COLORS.new, '#dfe7ec');
  assert.equal(SHEET_STATUS_COLORS.improved, '#d9ead3');
  assert.equal(SHEET_STATUS_COLORS.decreased, '#f4cccc');
  assert.equal(SHEET_STATUS_COLORS.holiday, '#f5e6c8');
});

test('starting phase 3 retains all history and begins after the latest stored week', () => {
  const state = { ...initialState, currentWeek: 35, weekLogs: [{ id: 'future', weekNumber: 36, programId: 'lower1', notes: 'keep', exercises: [] }] };
  const result = appReducer(state, { type: 'START_NEXT_PHASE', payload: { id: 'third' } });
  assert.equal(result.currentWeek, 37);
  assert.deepEqual(result.phases[2], { id: 'third', name: 'Faz 3', startWeek: 37, endWeek: null });
  assert.equal(result.phases[1].endWeek, 36);
  assert.equal(result.weekLogs, state.weekLogs);
  assert.equal(result.programs, state.programs);
  assert.equal(state.phases[1].endWeek, null);
  assert.equal(appReducer(result, { type: 'START_NEXT_PHASE', payload: { id: 'third' } }), result);
});

test('clearing a history column removes notes and holiday without affecting adjacent weeks or programs', () => {
  const log = { id: 'a', programId: 'lower1', weekNumber: 35, notes: 'note', isHoliday: true, exercises: [{ exerciseId: 'squat', sets: [{ reps: 8 }] }] };
  const state = { ...initialState, currentWeek: 36, weekLogs: [log, { ...log, id: 'duplicate' }, { ...log, id: 'next', weekNumber: 36 }, { ...log, id: 'other', programId: 'upper1' }] };
  const result = appReducer(state, { type: 'CLEAR_HISTORY_DATA', payload: { programId: 'lower1', weeks: [35], updatedAt: 'now' } });
  assert.deepEqual(result.weekLogs.map(l => l.id), ['next', 'other']);
  assert.equal(result.currentWeek, 36);
  assert.equal(state.weekLogs.length, 4);
});

test('clearing a history row respects visible weeks and retains other exercises and notes', () => {
  const log = { id: 'a', programId: 'lower1', weekNumber: 35, notes: 'keep note', exercises: [{ exerciseId: 'squat', sets: [{ reps: 8 }] }, { exerciseId: 'curl', sets: [{ reps: 10 }] }] };
  const state = { ...initialState, weekLogs: [log, { ...log, id: 'earlier', weekNumber: 34 }, { ...log, id: 'other', programId: 'upper1' }] };
  const result = appReducer(state, { type: 'CLEAR_HISTORY_DATA', payload: { programId: 'lower1', weeks: [35], exerciseId: 'squat', updatedAt: 'now' } });
  assert.deepEqual(result.weekLogs[0].exercises.map(e => e.exerciseId), ['curl']);
  assert.equal(result.weekLogs[0].notes, 'keep note');
  assert.equal(result.weekLogs[0].updatedAt, 'now');
  assert.deepEqual(result.weekLogs.slice(1), state.weekLogs.slice(1));
  assert.equal(state.weekLogs[0].exercises.length, 2);
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

const { parseCellToSets, parseTabularText, convertParsedToProgram } = loadTS('src/utils/textImportParser.ts');
const { formatSets } = loadTS('src/utils/formatters.ts');
const { buildColumnRequests, buildWeekRequests, parseCellAddress, columnLetters, SHEET_NOTE_COLOR } = loadTS('src/utils/sheetColumn.ts');
const { writeWeekColumn, writeWeekColumns } = loadTS('src/lib/googleSheets.ts');

test('sheet layout sizes notes from all weeks and protects future data without rewriting values', () => {
  const { buildSheetLayoutRequests } = loadTS('src/utils/sheetLayout.ts');
  const rows = [
    ['Upper'], ['Egzersiz', 'Set', 'H0', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'],
    ['Row', '2', '', '75 x 9 F\n80 x 8 F'],
    ['HAFTALIK NOTLAR', '', 'Earlier note'], [],
    ['Lower'], ['Egzersiz', 'Set', 'H0', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'],
    ['Squat', '2', '', '', '', '', '50 x 8 F'], ['HAFTALIK NOTLAR'],
  ];
  const original = JSON.stringify(rows);
  const requests = buildSheetLayoutRequests(5, rows, 3);
  const dimensions = requests.filter(r => r.updateDimensionProperties).map(r => r.updateDimensionProperties);
  const height = row => dimensions.find(r => r.range.dimension === 'ROWS' && r.range.startIndex === row).properties.pixelSize;
  assert.equal(height(3), 72);
  assert.equal(height(8), 32);
  assert.ok(height(2) >= 48);
  assert.equal(dimensions.some(r => r.properties.hiddenByUser === true), false);
  rows[7][6] = '';
  const hidden = buildSheetLayoutRequests(5, rows, 3).find(r => r.updateDimensionProperties?.properties.hiddenByUser === true);
  assert.equal(hidden.updateDimensionProperties.range.startIndex, 6);
  assert.equal(requests.some(r => r.updateCells || r.deleteDimension), false);
  rows[7][6] = '50 x 8 F';
  assert.equal(JSON.stringify(rows), original);
});

test('single shorthand expands to the declared set count; explicit pipes stay ordered', () => {
  const sets = parseCellToSets('70 x 8 F', 2);
  assert.equal(sets.length, 2);
  assert.deepEqual(sets[0], sets[1]);
  assert.notEqual(sets[0], sets[1]);
  assert.equal(formatSets(sets), '70 x 8 F');
  const split = parseCellToSets('70 x 8 F | 8 +1', 2);
  assert.equal(split.length, 2);
  assert.equal(split[0].intensity, 'failure');
  assert.equal(split[1].intensity, 'rir1');
  assert.equal(formatSets(split), '70 x 8 F | 8 +1');
  assert.equal(parseCellToSets('70 x 8 F | 8 +1', 3).length, 2);
});

test('formatting mixed sets never drops duplicates or rearranges the set order', () => {
  const set = { weight: 70, reps: 8, intensity: 'failure' };
  assert.equal(formatSets([set, { ...set, intensity: 'rir1' }, set]), '70 x 8 F | 8 +1 | 8 F');
  assert.equal(formatSets([set, { ...set, weight: 60 }, set]), '70 x 8 F\n60 x 8 F\n70 x 8 F');
});

test('table import uses the Set column when a cell uses shorthand', () => {
  const parsed = parseTabularText('Egzersiz\tSet\tH0\nRow\t2\t70 x 8 F');
  const result = convertParsedToProgram('Test', parsed);
  assert.equal(result.weekLogs[0].exercises[0].sets.length, 2);
});

test('W1 maps to column 22 and targeted formatting includes notes and literal values', () => {
  assert.deepEqual(parseCellAddress('w1'), { column: 22, row: 1 });
  assert.equal(columnLetters(26), 'AA');
  const requests = buildColumnRequests(123, 22, [
    { row: 1, label: 'Başlık', value: 'H20' },
    { row: 2, label: 'Smith', value: '40 x 7 F', color: '#ff0000' },
    { row: 12, label: 'Açıklama', value: '=literal note\nsecond line', color: SHEET_NOTE_COLOR, kind: 'note' },
  ]);
  assert.equal(requests.length, 3);
  for (const request of requests) {
    assert.equal(request.updateCells.range.startColumnIndex, 22);
    assert.equal(request.updateCells.range.endColumnIndex, 23);
  }
  assert.equal(requests[0].updateCells.fields, 'userEnteredValue');
  assert.deepEqual(requests[1].updateCells.rows[0].values[0].userEnteredFormat.backgroundColorStyle.rgbColor, { red: 1, green: 0, blue: 0 });
  assert.equal(requests[2].updateCells.rows[0].values[0].userEnteredValue.stringValue, '=literal note\nsecond line');
  assert.equal(requests[2].updateCells.rows[0].values[0].userEnteredFormat.wrapStrategy, 'CLIP');
  assert.equal(requests[1].updateCells.rows[0].values[0].userEnteredFormat.horizontalAlignment, 'CENTER');
  assert.equal(requests[2].updateCells.rows[0].values[0].userEnteredFormat.horizontalAlignment, 'LEFT');
  assert.equal(requests[2].updateCells.rows[0].values[0].userEnteredFormat.textFormat.fontSize, 9);
  assert.equal(requests[2].updateCells.range.startRowIndex, 11);
  assert.throws(() => buildColumnRequests(1, 22, [{ row: 1, value: 'H20' }, { row: 1, value: 'wrong' }]));
});

test('week export checks the phase-relative header and updates values/colors in one batch without clearing', async () => {
  const previousFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, json: async () => calls.length === 1 ? { values: [['H20']] } : {} };
  };
  try {
    await writeWeekColumn('test-token', 'test-sheet', { title: 'weak15-28', sheetId: 5 }, 22, [
      { row: 1, label: 'Başlık', value: 'H20' }, { row: 12, label: 'Açıklama', value: 'dips kaldırdım', color: SHEET_NOTE_COLOR },
    ]);
    assert.equal(calls.length, 2);
    assert.ok(decodeURIComponent(calls[0].url).endsWith("'weak15-28'!W1"));
    assert.ok(calls[1].url.endsWith(':batchUpdate'));
    assert.equal(JSON.parse(calls[1].init.body).requests.length, 2);
    assert.equal(calls.some(call => call.url.includes(':clear')), false);
  } finally { global.fetch = previousFetch; }
});

test('a different week header prevents every write', async () => {
  const previousFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => { calls++; return { ok: true, json: async () => ({ values: [['H35']] }) }; };
  try {
    await assert.rejects(writeWeekColumn('test-token', 'test-sheet', { title: 'weak15-28', sheetId: 5 }, 22, [{ row: 1, label: 'Başlık', value: 'H20' }]), /H35/);
    assert.equal(calls, 1);
  } finally { global.fetch = previousFetch; }
});

test('stacked workout blocks share a column without touching separator rows', () => {
  const targets = [
    { sheetId: 5, column: 22, cells: [{ row: 1, value: 'H20' }, { row: 2, value: '40 x 7 F', color: '#ff0000' }, { row: 12, value: 'note', color: SHEET_NOTE_COLOR }] },
    { sheetId: 5, column: 22, cells: [{ row: 18, value: 'H20' }, { row: 19, value: '70 x 8 F', color: '#00ff00' }, { row: 24, value: '', color: '#ffffff' }] },
  ];
  const requests = buildWeekRequests(targets);
  assert.deepEqual(requests.map(r => r.updateCells.range.startRowIndex), [0, 1, 11, 17, 18, 23]);
  assert.equal(requests.length, 6);
  assert.throws(() => buildWeekRequests([targets[0], targets[0]]), /çakışıyor/);
});

test('phase backfill selects only empty mapped workout columns', () => {
  const { hasMappedWeekData } = loadTS('src/utils/sheetColumn.ts');
  const target = { tab: 'Faz 3', column: 3, cells: [
    { row: 2, value: 'H1' }, { row: 3, value: '40 x 8 F' }, { row: 4, value: '' },
  ] };
  const rows = [[], ['', '', '', 'H1'], ['', '', '', ''], ['', '', '', '']];
  assert.equal(hasMappedWeekData(rows, target), false);
  rows[2][3] = '40 x 7 F';
  assert.equal(hasMappedWeekData(rows, target), true);
  rows[2][3] = '';
  rows[3][3] = 'personal note';
  assert.equal(hasMappedWeekData(rows, target), true);
});

test('weekly send validates all headers before one batch write', async () => {
  const previousFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ values: [['H20']] }) }; };
  const tab = { title: 'weak15-28', sheetId: 5 };
  const targets = [{ tab, column: 22, cells: [{ row: 1, value: 'H20' }] }, { tab, column: 22, cells: [{ row: 18, value: 'H20' }] }];
  try {
    await writeWeekColumns('test-token', 'test-sheet', targets);
    assert.equal(calls.length, 3);
    assert.equal(calls.filter(c => c.init?.method === 'POST').length, 1);
    assert.equal(JSON.parse(calls[2].init.body).requests.length, 2);
    calls.length = 0;
    global.fetch = async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ values: [[calls.length === 1 ? 'H20' : 'H19']] }) }; };
    await assert.rejects(writeWeekColumns('test-token', 'test-sheet', targets), /H19/);
    assert.equal(calls.filter(c => c.init?.method === 'POST').length, 0);
  } finally { global.fetch = previousFetch; }
});

const { normalizeGoogleSettings } = loadTS('src/utils/googleSheetsSettings.ts');
const { DEFAULT_SPREADSHEET_ID } = loadTS('src/config.ts');
const { validGoogleToken, readGoogleSession, saveGoogleSession, GOOGLE_SESSION_EVENT } = loadTS('src/utils/googleSheetsSession.ts');

test('reference spreadsheet is the default on new devices and for older empty settings', () => {
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

test('token lifetime validation rejects expired, invalid and near-expiry tokens', () => {
  assert.equal(validGoogleToken({ value: 'test-token', expiresAt: 160001 }, 100000), true);
  assert.equal(validGoogleToken({ value: 'test-token', expiresAt: 160000 }, 100000), false);
  assert.equal(validGoogleToken({ value: 'test-token', expiresAt: Infinity }), false);
  assert.equal(validGoogleToken({ value: '', expiresAt: Date.now() + 3600000 }), false);
});

test('Google session is reused across dialogs and isolated by client and app account', () => {
  const oldWindow = global.window;
  const oldStorage = global.sessionStorage;
  const values = new Map();
  global.window = new EventTarget();
  global.sessionStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  let changes = 0;
  window.addEventListener(GOOGLE_SESSION_EVENT, () => changes++);
  const token = { value: 'test-token', expiresAt: Date.now() + 3600000 };
  try {
    saveGoogleSession(token, 'client-a', 'account-a');
    assert.deepEqual(readGoogleSession('client-a', 'account-a'), token);
    assert.deepEqual(readGoogleSession('client-a', 'account-a'), token);
    assert.equal(readGoogleSession('client-b', 'account-a'), null);
    assert.equal(readGoogleSession('client-a', 'account-b'), null);
    saveGoogleSession(null, 'client-a', 'account-a');
    assert.equal(readGoogleSession('client-a', 'account-a'), null);
    assert.equal(changes, 2);
  } finally { global.window = oldWindow; global.sessionStorage = oldStorage; }
});
