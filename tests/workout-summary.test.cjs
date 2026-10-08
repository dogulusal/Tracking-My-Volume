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

const { summarizeWorkout } = loadTS('src/utils/workoutSummary.ts');

const set = (weight, reps, intensity = 'failure') => ({ weight, reps, intensity });
const ex = (exerciseId, exerciseName, sets) => ({ exerciseId, exerciseName, sets });
const log = (programId, weekNumber, exercises, extra = {}) => ({
  id: `${programId}-${weekNumber}`, programId, weekNumber, date: `2026-01-${String(weekNumber + 1).padStart(2, '0')}`,
  notes: '', isHoliday: false, updatedAt: '', exercises, ...extra,
});

test('each movement is compared with the same day last time, as History colours it', () => {
  const previous = log('push', 1, [ex('bp', 'Bench Press', [set(60, 8)]), ex('fly', 'Pec Fly', [set(40, 12)]), ex('dip', 'Dips', [set(0, 10)])]);
  const today = log('push', 2, [ex('bp', 'Bench Press', [set(60, 9)]), ex('fly', 'Pec Fly', [set(40, 12)]), ex('dip', 'Dips', [set(0, 8)])]);
  const summary = summarizeWorkout(today, previous, { weekLogs: [previous] });
  assert.deepEqual(summary.lines.map(line => line.status), ['improved', 'same', 'decreased']);
  assert.deepEqual(summary.counts, { improved: 1, same: 1, decreased: 1 });
});

test('sets are counted per muscle group like the charts: worked sets only', () => {
  const today = log('push', 0, [
    ex('bp', 'Bench Press', [set(60, 8), set(60, 8), set(60, 0)]),
    ex('tri', 'Triceps Pushdown', [set(30, 12)]),
  ]);
  const summary = summarizeWorkout(today, null, { weekLogs: [] });
  assert.equal(summary.sets, 3);
  assert.deepEqual(summary.groups, [{ group: 'Göğüs', sets: 2 }, { group: 'Triceps', sets: 1 }]);
  assert.deepEqual(summary.lines.map(line => line.status), ['new', 'new']);
});

test('a record is an estimated 1RM above every earlier session of the movement, on any day', () => {
  const upper = log('upper', 1, [ex('bp-u', 'Bench Press', [set(80, 5)])]);
  const push = log('push', 1, [ex('bp', 'Bench Press', [set(70, 8)])], { date: '2026-01-03' });
  const today = log('push', 2, [ex('bp', 'Bench Press', [set(75, 8)])]);
  const summary = summarizeWorkout(today, push, { weekLogs: [upper, push] });
  // 75 × (1 + 8/30) = 95 beats Upper's 80 × (1 + 5/30) = 93.
  assert.deepEqual(summary.lines[0].record, { oneRM: 95, previous: 93 });

  const weaker = log('push', 2, [ex('bp', 'Bench Press', [set(72.5, 7)])]);
  assert.equal(summarizeWorkout(weaker, push, { weekLogs: [upper, push] }).lines[0].record, null);
});

test('the first time a movement is done is not a record', () => {
  const today = log('push', 0, [ex('bp', 'Bench Press', [set(60, 8)])]);
  assert.equal(summarizeWorkout(today, null, { weekLogs: [] }).lines[0].record, null);
});

test('reps left in reserve count toward the estimate', () => {
  const before = log('push', 1, [ex('bp', 'Bench Press', [set(60, 8, 'failure')])]);
  const today = log('push', 2, [ex('bp', 'Bench Press', [set(60, 8, 'rir2')])]);
  assert.ok(summarizeWorkout(today, before, { weekLogs: [before] }).lines[0].record);
});

test('a movement stuck for four weeks or more is flagged, counting this workout', () => {
  const weeks = [0, 1, 2, 3].map(week => log('pull', week, [ex('row', 'Seated Row', [set(50, 10)])]));
  const today = log('pull', 4, [ex('row', 'Seated Row', [set(50, 10)])]);
  assert.equal(summarizeWorkout(today, weeks[3], { weekLogs: weeks }).lines[0].stallWeeks, 4);
  const better = log('pull', 4, [ex('row', 'Seated Row', [set(52.5, 8)])]);
  assert.equal(summarizeWorkout(better, weeks[3], { weekLogs: weeks }).lines[0].stallWeeks, null);
});

test('the length runs from the first finished set to the last, shown from a minute to five hours', () => {
  const timed = (startedAt, finishedAt) => summarizeWorkout(
    log('push', 0, [ex('bp', 'Bench Press', [set(60, 8)])], { startedAt, finishedAt }), null, { weekLogs: [] }).minutes;
  assert.equal(timed('2026-10-08T10:00:00.000Z', '2026-10-08T11:04:40.000Z'), 65);
  assert.equal(timed('2026-10-08T10:00:00.000Z', '2026-10-08T10:00:00.000Z'), null);
  // A set added to the saved workout the next day.
  assert.equal(timed('2026-10-08T10:00:00.000Z', '2026-10-09T09:00:00.000Z'), null);
  assert.equal(timed(undefined, undefined), null);
});
