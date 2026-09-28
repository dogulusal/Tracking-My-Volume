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

const { progressionRule, nextTarget, stallOf, previousRecord } = loadTS('src/utils/progression.ts');
const { movementSessions } = loadTS('src/utils/movements.ts');

const set = (weight, reps, intensity = 'failure') => ({ weight, reps, intensity });
const log = (programId, weekNumber, sets, extra = {}) => ({
  id: `${programId}-${weekNumber}`, programId, weekNumber, date: `2026-01-${String(weekNumber + 1).padStart(2, '0')}`,
  notes: '', isHoliday: false, updatedAt: '', exercises: [{ exerciseId: `${programId}-fly`, exerciseName: 'Pec Fly', sets }], ...extra,
});

test('the rule is read from the reps reached before each weight increase, day by day', () => {
  const weekLogs = [
    log('a', 0, [set(50, 9)]), log('b', 0, [set(40, 12)]),
    log('a', 1, [set(50, 10)]), log('b', 1, [set(40, 12)]),
    log('a', 2, [set(51.25, 8)]), log('b', 2, [set(40, 13)]),
    log('a', 3, [set(51.25, 10)]),
    log('a', 4, [set(52.5, 7)]),
  ];
  const rule = progressionRule(movementSessions(weekLogs, 'pec fly'));
  // Day b's lighter weight never reads as an increase on day a.
  assert.deepEqual(rule, { repTop: 10, step: 1.25, source: 'log' });
  assert.deepEqual(progressionRule(movementSessions(weekLogs, 'pec fly'), { repTop: 12 }), { repTop: 12, step: 1.25, source: 'manual' });
  // A single increase shows the step, not yet the top of the range, and the
  // label says so instead of calling the whole rule a default.
  assert.deepEqual(progressionRule(movementSessions(weekLogs.slice(0, 5), 'pec fly')), { repTop: 10, step: 1.25, source: 'step' });
  assert.deepEqual(progressionRule(movementSessions(weekLogs.slice(0, 2), 'pec fly')), { repTop: 10, step: 2.5, source: 'default' });
});

test('the target is one more rep, or the next weight once the top of the range was reached', () => {
  const rule = { repTop: 10, step: 1.25, source: 'log' };
  assert.deepEqual(nextTarget([set(75, 8, 'rir1'), set(75, 8)], rule), { weight: 75, reps: 9, from: set(75, 8, 'rir1') });
  assert.deepEqual(nextTarget([set(91.75, 10)], rule), { weight: 93, reps: null, from: set(91.75, 10) });
  assert.equal(nextTarget([set(0, 0)], rule), null);
  const weekLogs = [log('a', 0, [set(50, 9)]), log('a', 1, [], { isHoliday: true }), log('a', 2, [set(0, 0)])];
  assert.deepEqual(previousRecord(weekLogs, 'a', 'a-fly', 3), [set(50, 9)], 'holidays and empty records are skipped');
});

test('a stall counts the weeks since the best set at the current weight, and a new weight restarts it', () => {
  const weekLogs = [
    log('a', 0, [set(90, 10)]),
    log('a', 1, [set(91.75, 8)]),
    log('a', 2, [set(91.75, 9, 'rir1')]),
    log('a', 3, [set(91.75, 9)]), log('b', 3, [set(91.75, 9)]),
    log('a', 6, [set(91.75, 9)]),
    log('a', 8, [set(91.75, 8, 'rir1')]),
  ];
  const stall = stallOf(movementSessions(weekLogs, 'pec fly'));
  // 9 reps with one in reserve at week 2 was never beaten: 9 to failure only matches it.
  assert.deepEqual(stall, { weeks: 6, since: 2, weight: 91.75, best: set(91.75, 9, 'rir1') });
  const moved = stallOf(movementSessions([...weekLogs, log('a', 9, [set(93, 7)])], 'pec fly'));
  assert.equal(moved.weeks, 0);
});

test('targets and stalls pass over hard days', () => {
  const weekLogs = [
    log('a', 0, [set(91.75, 9, 'rir1')]),
    log('a', 1, [set(80, 6)], { offDay: true }),
  ];
  assert.deepEqual(previousRecord(weekLogs, 'a', 'a-fly', 2), [set(91.75, 9, 'rir1')]);
  // The light hard day is not a reset: the stall still runs from week 0.
  assert.deepEqual(stallOf(movementSessions([...weekLogs, log('a', 5, [set(91.75, 9)])], 'pec fly')).since, 0);
  assert.deepEqual(previousRecord([weekLogs[1]], 'a', 'a-fly', 2), [set(80, 6)], 'only hard days left: the nearest counts');
});
