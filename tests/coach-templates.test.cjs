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

const { activePlanOf, pasteActions, templateFrom } = loadTS('src/coach/templates.ts');
const { appReducer } = loadTS('src/context/appReducer.ts');
const { describeProgramChanges } = loadTS('src/coach/programChanges.ts');

const now = '2026-10-04T10:00:00.000Z';
const exercise = (id, name, sets = 3, reps = 8, weight = 60, isActive = true) => ({ id, name, defaultSets: sets, defaultWeight: weight, defaultReps: reps, isActive });
const athlete = {
  dataVersion: 11, currentWeek: 5,
  phases: [{ id: 'phase-1', name: 'Faz 1', startWeek: 0, endWeek: null }],
  programs: [
    { id: 'A', name: 'Üst A', order: 1, createdAt: now, updatedAt: now, exercises: [exercise('b', 'Bench Press'), exercise('x', 'Dips', 3, 8, 0, false)] },
    { id: 'B', name: 'Alt A', order: 2, createdAt: now, updatedAt: now, exercises: [exercise('s', 'Squat', 3, 6, 80)] },
  ],
  plans: [{ id: 'plan', name: 'Kendi planım', programIds: ['A', 'B'], createdAt: now, updatedAt: now }],
  activePlanId: 'plan',
  // Both days trained last week: a record without saved program versions
  // has its earlier programs rebuilt from what was trained.
  weekLogs: [
    { id: 'l1', programId: 'A', weekNumber: 4, date: '2026-09-28', notes: '', isHoliday: false, updatedAt: now,
      exercises: [{ exerciseId: 'b', exerciseName: 'Bench Press', sets: [{ weight: 60, reps: 8, intensity: 'failure' }] }] },
    { id: 'l2', programId: 'B', weekNumber: 4, date: '2026-09-30', notes: '', isHoliday: false, updatedAt: now,
      exercises: [{ exerciseId: 's', exerciseName: 'Squat', sets: [{ weight: 80, reps: 6, intensity: 'failure' }] }] },
  ],
};
const template = {
  id: 't', name: 'Tüm vücut · 2 gün', savedAt: now,
  days: [
    { name: 'Tüm vücut A', exercises: [{ name: 'Squat', defaultSets: 3, defaultReps: 10, defaultWeight: 0 }] },
    { name: 'Tüm vücut B', exercises: [{ name: 'Deadlift', defaultSets: 3, defaultReps: 6, defaultWeight: 0 }] },
  ],
};
let counter = 0;
const ids = () => String(++counter);
const apply = (state, actions) => actions.reduce(appReducer, state);

test('saving keeps the days and movements in use, nothing of the records', () => {
  const saved = templateFrom(athlete, 'Elif · Üst/Alt', 't1', now);
  assert.deepEqual(saved.days.map(day => day.name), ['Üst A', 'Alt A']);
  // A movement taken out of the program is not copied.
  assert.deepEqual(saved.days[0].exercises, [{ name: 'Bench Press', defaultSets: 3, defaultReps: 8, defaultWeight: 60 }]);
});

test('pasting in place of the days: the plan has only the copy, the old days keep their history', () => {
  const after = apply(athlete, pasteActions(athlete, template, 'replace', ids, now));
  const { plan, days } = activePlanOf(after);
  assert.equal(plan.name, 'Tüm vücut · 2 gün');
  assert.deepEqual(days.map(day => day.name), ['Tüm vücut A', 'Tüm vücut B']);
  assert.ok(days.every(day => !['A', 'B'].includes(day.id)));
  assert.equal(after.weekLogs.length, 2);
  // Last week still shows the program it was trained on.
  const lastWeek = activePlanOf({ ...after, currentWeek: 4 });
  assert.deepEqual(lastWeek.days.map(day => day.name), ['Üst A', 'Alt A']);
  assert.deepEqual(describeProgramChanges(athlete, after), [
    'Yeni gün: Tüm vücut A (1 hareket)', 'Yeni gün: Tüm vücut B (1 hareket)', 'Plandan çıktı: Üst A', 'Plandan çıktı: Alt A',
  ]);
});

test('pasting after the days keeps the plan and its name', () => {
  const after = apply(athlete, pasteActions(athlete, template, 'add', ids, now));
  const { plan, days } = activePlanOf(after);
  assert.equal(plan.name, 'Kendi planım');
  assert.deepEqual(days.map(day => day.name), ['Üst A', 'Alt A', 'Tüm vücut A', 'Tüm vücut B']);
});

test('pasting for someone with no program yet makes their plan', () => {
  const empty = { ...athlete, programs: [], plans: [], activePlanId: null, weekLogs: [] };
  const after = apply(empty, pasteActions(empty, template, 'add', ids, now));
  const { plan, days } = activePlanOf(after);
  assert.equal(plan.name, 'Tüm vücut · 2 gün');
  assert.equal(days.length, 2);
});
