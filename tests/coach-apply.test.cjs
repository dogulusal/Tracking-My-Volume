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

const { activePlanOf, coachPlanOf, ownPlanOf, newPlanActions, addDayActions } = loadTS('src/coach/templates.ts');
const { appReducer } = loadTS('src/context/appReducer.ts');

const now = '2026-10-04T10:00:00.000Z';
const exercise = (id, name, sets = 3) => ({ id, name, defaultSets: sets, defaultWeight: 60, defaultReps: 8, isActive: true });
const log = (id, programId, weekNumber) => ({
  id, programId, weekNumber, date: '2026-09-28', notes: '', isHoliday: false, updatedAt: now,
  exercises: [{ exerciseId: 'b', exerciseName: 'Bench Press', sets: [{ weight: 60, reps: 8, intensity: 'failure' }] }],
});
const athlete = {
  dataVersion: 11, currentWeek: 5,
  phases: [{ id: 'phase-1', name: 'Faz 1', startWeek: 0, endWeek: null }],
  programs: [
    { id: 'A', name: 'Üst A', order: 1, createdAt: now, updatedAt: now, exercises: [exercise('b', 'Bench Press')] },
    { id: 'B', name: 'Alt A', order: 2, createdAt: now, updatedAt: now, exercises: [exercise('s', 'Squat')] },
  ],
  plans: [{ id: 'plan', name: 'Kendi planım', programIds: ['A', 'B'], createdAt: now, updatedAt: now }],
  activePlanId: 'plan',
  weekLogs: [log('l1', 'A', 4), log('l2', 'B', 4), log('l3', 'A', 5)],
};
const ahmet = { id: 'coach-1', name: 'Ahmet Yılmaz' };
const template = {
  id: 't', name: 'Tüm vücut', savedAt: now,
  days: [{ name: 'Tüm vücut A', exercises: [{ name: 'Squat', defaultSets: 3, defaultReps: 10, defaultWeight: 0 }] }],
};
let counter = 0;
const ids = () => String(++counter);
const send = (state, id, actions, coach = ahmet) =>
  appReducer(state, { type: 'APPLY_COACH_UPDATE', payload: { id, coachId: coach.id, coachName: coach.name, actions } });

test("a coach's new program arrives beside the person's own, which stays in use", () => {
  const after = send(athlete, 'u1', newPlanActions(athlete, ahmet, template, ids, now));
  const mine = coachPlanOf(after, ahmet.id);
  assert.equal(mine.plan.name, 'Tüm vücut');
  assert.equal(mine.plan.coach, 'Ahmet Yılmaz');
  assert.deepEqual(mine.days.map(day => day.name), ['Tüm vücut A']);
  assert.equal(activePlanOf(after).plan.id, 'plan');
  assert.deepEqual(after.weekLogs, athlete.weekLogs);
  assert.deepEqual(after.appliedCoachUpdates, ['u1']);
});

test('an update is applied once, however many times it is read', () => {
  const actions = newPlanActions(athlete, ahmet, template, ids, now);
  const once = send(athlete, 'u1', actions);
  const twice = send(once, 'u1', actions);
  assert.equal(twice, once);
  assert.equal(twice.plans.length, 2);
});

test('the update lands in the week the person is in when it arrives', () => {
  const set = send(athlete, 'u1', newPlanActions(athlete, ahmet, template, ids, now));
  const day = coachPlanOf(set, ahmet.id).days[0];
  // Written while the person was in week 5; they moved on to week 7 before it arrived.
  const moved = appReducer(set, { type: 'SET_WEEK', payload: 7 });
  const changed = { ...day, exercises: day.exercises.map(item => ({ ...item, defaultSets: 5 })) };
  const after = send(moved, 'u2', [{ type: 'UPDATE_PROGRAM', atWeek: 5, payload: changed }]);
  assert.equal(coachPlanOf(after, ahmet.id).days[0].exercises[0].defaultSets, 5);
  // Weeks 5 and 6 keep what they were trained on.
  assert.equal(coachPlanOf({ ...after, currentWeek: 6 }, ahmet.id).days[0].exercises[0].defaultSets, 3);
});

test("someone with no program at all trains the coach's", () => {
  const empty = { ...athlete, programs: [], plans: [], activePlanId: null, weekLogs: [] };
  const after = send(empty, 'u1', newPlanActions(empty, ahmet, template, ids, now));
  assert.equal(activePlanOf(after).plan.coachId, ahmet.id);
});

test('the plan in use stays in use, even when the coach saw another one in use', () => {
  const set = send(athlete, 'u1', newPlanActions(athlete, ahmet, template, ids, now));
  const coachPlan = coachPlanOf(set, ahmet.id).plan.id;
  // The coach's view still had the coach's plan in use; the person has gone back to their own.
  const coachView = appReducer(set, { type: 'SET_ACTIVE_PLAN', atWeek: 5, payload: coachPlan });
  const day = { type: 'ADD_PROGRAM', atWeek: 5, payload: { id: 'D', name: 'Bacak', order: 2, createdAt: now, updatedAt: now, exercises: [] } };
  const after = send(set, 'u2', addDayActions(coachView, coachPlan, day));
  assert.equal(activePlanOf(after).plan.id, 'plan');
  assert.deepEqual(coachPlanOf(after, ahmet.id).days.map(item => item.id).slice(-1), ['D']);
  assert.deepEqual(ownPlanOf(after).days.map(item => item.id), ['A', 'B']);
});

test("nothing in an update reaches the person's workouts or their own plan", () => {
  const set = send(athlete, 'u1', newPlanActions(athlete, ahmet, template, ids, now));
  const coachPlan = coachPlanOf(set, ahmet.id).plan;
  const hostile = [
    { type: 'RESET_DATA' },
    { type: 'IMPORT_DATA', payload: { ...athlete, weekLogs: [] } },
    { type: 'DELETE_WORKOUT', payload: 'l1' },
    { type: 'CLEAR_HISTORY_DATA', payload: { programId: 'A', weeks: [4, 5] } },
    { type: 'DELETE_PROGRAM', atWeek: 5, payload: 'A' },
    { type: 'DELETE_PLAN', atWeek: 5, payload: 'plan' },
    // The person's own day, changed directly or by first pulling it into the coach's plan.
    { type: 'UPDATE_PROGRAM', atWeek: 5, payload: { ...athlete.programs[0], exercises: [] }, syncCurrentLog: true },
    { type: 'UPDATE_PLAN', atWeek: 5, payload: { ...coachPlan, programIds: [...coachPlan.programIds, 'A'] } },
    { type: 'UPDATE_PROGRAM', atWeek: 5, payload: { ...athlete.programs[0], name: 'Ele geçirildi' } },
    { type: 'UPDATE_PLAN', atWeek: 5, payload: { ...athlete.plans[0], programIds: [] } },
    // A day added while the person's own plan is in use lands in the coach's.
    { type: 'ADD_PROGRAM', atWeek: 5, payload: { id: 'X', name: 'Sızma', order: 3, createdAt: now, updatedAt: now, exercises: [] } },
    { type: 'APPLY_COACH_UPDATE', payload: { id: 'inner', coachId: ahmet.id, coachName: ahmet.name, actions: [{ type: 'RESET_DATA' }] } },
  ];
  const after = send(set, 'u2', hostile);
  assert.deepEqual(after.weekLogs, athlete.weekLogs);
  assert.deepEqual(ownPlanOf(after).plan.programIds, ['A', 'B']);
  assert.deepEqual(ownPlanOf(after).days, athlete.programs);
  assert.deepEqual(coachPlanOf(after, ahmet.id).plan.programIds, [...coachPlan.programIds, 'X']);
  assert.equal(activePlanOf(after).plan.id, 'plan');
});

test("one coach cannot change another coach's plan", () => {
  const set = send(athlete, 'u1', newPlanActions(athlete, ahmet, template, ids, now));
  const plan = coachPlanOf(set, ahmet.id);
  const other = { id: 'coach-2', name: 'Başka' };
  const after = send(set, 'u2', [
    { type: 'UPDATE_PLAN', atWeek: 5, payload: { ...plan.plan, name: 'Benim' } },
    { type: 'UPDATE_PROGRAM', atWeek: 5, payload: { ...plan.days[0], exercises: [] } },
  ], other);
  assert.deepEqual(coachPlanOf(after, ahmet.id), plan);
});
