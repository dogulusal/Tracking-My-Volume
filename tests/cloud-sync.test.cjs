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

const { planSync, mergeStates } = loadTS('src/utils/cloudSync.ts');
const { initialState } = loadTS('src/context/appReducer.ts');

const log = (programId, weekNumber, updatedAt, weight = 50) => ({
  id: `${programId}-${weekNumber}-${updatedAt}`, programId, weekNumber, date: '2026-09-27', notes: '', isHoliday: false,
  updatedAt, exercises: [{ exerciseId: 'press', exerciseName: 'Press', sets: [{ weight, reps: 8, intensity: 'failure' }] }],
});

test('a workout saved while the upload failed is pushed on the next launch instead of being replaced by the cloud copy', () => {
  // The gym case: last good sync at 10:00, workout saved offline at 18:00, app
  // killed, reopened with signal. The cloud row still carries the 10:00 stamp.
  const meta = { userId: 'me', cloudUpdatedAt: '2026-09-27T10:00:00.000Z', localEditAt: '2026-09-27T18:00:00.000Z' };
  assert.equal(planSync(meta, 'me', '2026-09-27T10:00:00+00:00', true), 'push');
});

test('with nothing waiting locally the cloud copy still wins', () => {
  assert.equal(planSync(null, 'me', '2026-09-27T10:00:00Z', true), 'adopt');
  assert.equal(planSync({ userId: 'me', cloudUpdatedAt: '2026-09-27T10:00:00Z', localEditAt: null }, 'me', '2026-09-27T12:00:00Z', true), 'adopt');
  // Another account's pending edits never decide what this account sees.
  assert.equal(planSync({ userId: 'someone-else', cloudUpdatedAt: null, localEditAt: '2026-09-27T18:00:00Z' }, 'me', '2026-09-27T12:00:00Z', true), 'adopt');
});

test('local edits against a cloud row another device changed are merged, and a missing row is simply created', () => {
  const meta = { userId: 'me', cloudUpdatedAt: '2026-09-27T10:00:00Z', localEditAt: '2026-09-27T18:00:00Z' };
  assert.equal(planSync(meta, 'me', '2026-09-27T12:00:00Z', true), 'merge');
  assert.equal(planSync(meta, 'me', null, false), 'push');
});

test('merging keeps workouts from both devices and the newer save of the same session', () => {
  const phone = { ...initialState, currentWeek: 5, weekLogs: [log('upper', 5, '2026-09-27T18:00:00Z', 60), log('lower', 4, '2026-09-20T10:00:00Z', 40)] };
  const laptop = { ...initialState, currentWeek: 5, weekLogs: [log('lower', 4, '2026-09-27T12:00:00Z', 45), log('upper', 4, '2026-09-20T10:00:00Z')] };
  const merged = mergeStates(phone, laptop, '2026-09-27T18:00:00Z', '2026-09-27T12:00:00Z');
  const byKey = Object.fromEntries(merged.weekLogs.map(entry => [`${entry.programId}:${entry.weekNumber}`, entry.exercises[0].sets[0].weight]));
  assert.deepEqual(byKey, { 'upper:5': 60, 'lower:4': 45, 'upper:4': 50 });
});

test('outside workouts the side edited last wins', () => {
  const phone = { ...initialState, currentWeek: 6, weekLogs: [] };
  const laptop = { ...initialState, currentWeek: 5, weekLogs: [] };
  assert.equal(mergeStates(phone, laptop, '2026-09-27T18:00:00Z', '2026-09-27T12:00:00Z').currentWeek, 6);
  assert.equal(mergeStates(phone, laptop, '2026-09-27T11:00:00Z', '2026-09-27T12:00:00Z').currentWeek, 5);
});
