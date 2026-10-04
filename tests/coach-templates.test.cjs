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

const { activePlanOf, coachPlanOf, ownPlanOf, newPlanActions, addDayActions, templateFrom } = loadTS('src/coach/templates.ts');
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
const ahmet = { id: 'coach-1', name: 'Ahmet' };

test('saving keeps the days and movements in use, nothing of the records', () => {
  const saved = templateFrom(athlete, 'plan', 'Üst/Alt', 't1', now);
  assert.deepEqual(saved.days.map(day => day.name), ['Üst A', 'Alt A']);
  // A movement taken out of the program is not copied.
  assert.deepEqual(saved.days[0].exercises, [{ name: 'Bench Press', defaultSets: 3, defaultReps: 8, defaultWeight: 60 }]);
});

test("the person's own plan is never the coach's", () => {
  assert.equal(coachPlanOf(athlete, ahmet.id).plan, null);
});

test("a coach's program goes beside the person's own, which stays in use", () => {
  const after = apply(athlete, newPlanActions(athlete, ahmet, template, ids, now));
  const mine = coachPlanOf(after, ahmet.id);
  assert.equal(mine.plan.name, 'Tüm vücut · 2 gün');
  assert.deepEqual(mine.days.map(day => day.name), ['Tüm vücut A', 'Tüm vücut B']);
  // Copied with new ids, so editing it touches neither the saved program nor anyone else's copy.
  assert.ok(mine.days.every(day => !['A', 'B'].includes(day.id)));
  const own = activePlanOf(after);
  assert.equal(own.plan.id, 'plan');
  assert.deepEqual(own.days.map(day => day.name), ['Üst A', 'Alt A']);
  assert.equal(after.weekLogs.length, 2);
  assert.deepEqual(describeProgramChanges(athlete, after, mine.plan.id), ['Yeni gün: Tüm vücut A (1 hareket)', 'Yeni gün: Tüm vücut B (1 hareket)']);
});

test("for someone with no program yet, the coach's is the one in use", () => {
  const empty = { ...athlete, programs: [], plans: [], activePlanId: null, weekLogs: [] };
  const after = apply(empty, newPlanActions(empty, ahmet, template, ids, now));
  assert.equal(activePlanOf(after).plan.coach, 'Ahmet');
  assert.equal(activePlanOf(after).days.length, 2);
});

test("a new day goes into the coach's program, not the one in use", () => {
  const set = apply(athlete, newPlanActions(athlete, ahmet, null, ids, now));
  const planId = coachPlanOf(set, ahmet.id).plan.id;
  const day = { type: 'ADD_PROGRAM', atWeek: 5, payload: { id: 'D', name: 'Bacak', order: 1, createdAt: now, updatedAt: now, exercises: [] } };
  const after = apply(set, addDayActions(set, planId, day));
  assert.deepEqual(coachPlanOf(after, ahmet.id).days.map(item => item.id), ['D']);
  assert.deepEqual(activePlanOf(after).days.map(item => item.id), ['A', 'B']);
});

test("the person's own plan is found whether or not they train the coach's", () => {
  const set = apply(athlete, newPlanActions(athlete, ahmet, template, ids, now));
  assert.equal(ownPlanOf(set).plan.id, 'plan');
  const switched = apply(set, [{ type: 'SET_ACTIVE_PLAN', atWeek: 5, payload: coachPlanOf(set, ahmet.id).plan.id }]);
  assert.equal(activePlanOf(switched).plan.coach, 'Ahmet');
  assert.equal(ownPlanOf(switched).plan.id, 'plan');
});
