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

const { planSync, mergeStates, writeOverRead } = loadTS('src/utils/cloudSync.ts');
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

test('body measurements from both devices are kept, day by day', () => {
  const phone = { ...initialState, weekLogs: [], bodyMeasurements: [{ date: '2026-10-06', weight: 81 }, { date: '2026-10-08', weight: 80.4 }] };
  const laptop = { ...initialState, weekLogs: [], bodyMeasurements: [{ date: '2026-10-01', weight: 81.6 }, { date: '2026-10-08', weight: 80.9 }] };
  const merged = mergeStates(phone, laptop, '2026-10-08T18:00:00Z', '2026-10-08T12:00:00Z');
  // The same day on both sides keeps the side edited last.
  assert.deepEqual(merged.bodyMeasurements.map(entry => `${entry.date} ${entry.weight}`), ['2026-10-01 81.6', '2026-10-06 81', '2026-10-08 80.4']);
  assert.equal('bodyMeasurements' in mergeStates({ ...initialState, weekLogs: [] }, { ...initialState, weekLogs: [] }, '2026-10-08T18:00:00Z', '2026-10-08T12:00:00Z'), false);
});

// The calls writeOverRead makes, over one stored row, as Supabase answers them.
function cloudRow(initial) {
  const store = { row: initial };
  const client = {
    from: () => ({
      update(values) {
        const filters = {};
        const query = {
          eq(column, value) { filters[column] = value; return query; },
          async select() {
            const row = store.row;
            if (!row || row.user_id !== filters.user_id || row.updated_at !== filters.updated_at) return { data: [], error: null };
            store.row = { ...row, ...values };
            return { data: [{ user_id: row.user_id }], error: null };
          },
        };
        return query;
      },
      insert(values) {
        return {
          async select() {
            if (store.row) return { data: null, error: { code: '23505', message: 'duplicate key value' } };
            store.row = values;
            return { data: [{ user_id: values.user_id }], error: null };
          },
        };
      },
    }),
  };
  return { store, client };
}

test('two devices that read the same copy cannot both write: the second is told to read again', async () => {
  const { store, client } = cloudRow({ user_id: 'me', data: { weekLogs: [] }, updated_at: '2026-10-08T10:00:00+00:00' });
  const phone = { ...initialState, weekLogs: [log('upper', 5, '2026-10-08T10:01:00Z')] };
  const laptop = { ...initialState, weekLogs: [log('lower', 5, '2026-10-08T10:01:00Z')] };
  assert.equal(await writeOverRead(client, 'me', phone, '2026-10-08T10:02:00.000Z', '2026-10-08T10:00:00+00:00'), 'written');
  assert.equal(await writeOverRead(client, 'me', laptop, '2026-10-08T10:02:01.000Z', '2026-10-08T10:00:00+00:00'), 'conflict');
  // The phone's workout is still there for the laptop to merge with.
  assert.equal(store.row.data.weekLogs[0].programId, 'upper');
  assert.equal(await writeOverRead(client, 'me', laptop, '2026-10-08T10:02:02.000Z', '2026-10-08T10:02:00.000Z'), 'written');
});

test('with no row read the row is created; one another device created meanwhile is a conflict', async () => {
  const empty = cloudRow(null);
  assert.equal(await writeOverRead(empty.client, 'me', initialState, '2026-10-08T10:00:00.000Z', null), 'written');
  assert.equal(await writeOverRead(empty.client, 'me', initialState, '2026-10-08T10:00:01.000Z', null), 'conflict');
});
