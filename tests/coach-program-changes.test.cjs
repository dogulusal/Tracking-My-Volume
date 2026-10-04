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

const { describeProgramChanges } = loadTS('src/coach/programChanges.ts');
const { appReducer } = loadTS('src/context/appReducer.ts');

const now = '2026-09-01T00:00:00.000Z';
const exercise = (id, name, sets = 3, reps = 8, weight = 60) => ({ id, name, defaultSets: sets, defaultWeight: weight, defaultReps: reps, isActive: true });
const program = (id, name, exercises) => ({ id, name, order: 0, exercises, createdAt: now, updatedAt: now });
const base = {
  dataVersion: 11, currentWeek: 3, weekLogs: [],
  phases: [{ id: 'phase-1', name: 'Faz 1', startWeek: 0, endWeek: null }],
  programs: [
    program('A', 'Üst A', [exercise('b', 'Bench Press'), exercise('r', 'Cable Row'), exercise('c', 'Biceps Curl', 3, 10, 12)]),
    program('B', 'Alt A', [exercise('s', 'Squat', 3, 6, 80)]),
  ],
  plans: [{ id: 'plan', name: 'Plan', programIds: ['A', 'B'], createdAt: now, updatedAt: now }],
  activePlanId: 'plan',
};
// Changes go through the reducer, as the athlete's app would apply them.
const apply = (state, ...actions) => actions.reduce(appReducer, state);
const update = (state, programId, change) => {
  const day = state.programs.find(p => p.id === programId);
  return { type: 'UPDATE_PROGRAM', atWeek: state.currentWeek, payload: { ...day, ...change(day) } };
};

test('added, removed and retargeted movements, each in its day', () => {
  const after = apply(base, update(base, 'A', day => ({
    exercises: [
      { ...day.exercises[0], defaultSets: 4 },
      day.exercises[1],
      exercise('i', 'Incline Dumbbell Press', 3, 10, 22),
    ],
  })));
  assert.deepEqual(describeProgramChanges(base, after), [
    'Üst A · Bench Press: 3 → 4 set',
    'Üst A: + Incline Dumbbell Press',
    'Üst A: − Biceps Curl',
  ]);
});

test('a new day, a renamed day and a new order', () => {
  const renamed = apply(base, update(base, 'B', day => ({ name: 'Bacak' })));
  const added = apply(renamed, { type: 'ADD_PROGRAM', atWeek: 3, payload: program('C', 'Üst B', [exercise('p', 'Lat Pulldown')]) });
  const reordered = apply(added, update(added, 'A', day => ({ exercises: [day.exercises[1], day.exercises[0], day.exercises[2]] })));
  assert.deepEqual(describeProgramChanges(base, reordered), [
    'Üst A: hareketlerin sırası değişti',
    'Alt A → Bacak',
    'Yeni gün: Üst B (1 hareket)',
  ]);
});

test('nothing changed, nothing to say', () => {
  assert.deepEqual(describeProgramChanges(base, base), []);
});
