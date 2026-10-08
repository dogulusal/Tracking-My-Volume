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

const { daysSince, staleRecordAge, staleWeekAge } = loadTS('src/utils/weekAdvance.ts');

const today = new Date('2026-10-10T09:00:00');
const log = (weekNumber, date, extra = {}) => ({
  id: `p-${weekNumber}`, programId: 'p', weekNumber, date, notes: '', isHoliday: false, updatedAt: '',
  exercises: [{ exerciseId: 'a', exerciseName: 'Squat', sets: [{ weight: 80, reps: 6, intensity: 'failure' }] }], ...extra,
});

test('days are counted by calendar day, for plain and ISO dates', () => {
  assert.equal(daysSince('2026-10-10', today), 0);
  assert.equal(daysSince('2026-10-05', today), 5);
  // An ISO time is read in the phone's own time zone; midday is the same date everywhere.
  assert.equal(daysSince('2026-10-03T12:00:00.000Z', today), 7);
  assert.equal(daysSince('not a date', today), null);
});

test('a record this week from 5+ days ago is probably a new workout', () => {
  assert.equal(staleRecordAge(log(7, '2026-10-05'), 7, today), 5);
  assert.equal(staleRecordAge(log(7, '2026-10-06'), 7, today), null);
});

test('an earlier week, a holiday or an empty record is never questioned', () => {
  assert.equal(staleRecordAge(log(6, '2026-09-20'), 7, today), null);
  assert.equal(staleRecordAge(log(7, '2026-09-20', { isHoliday: true }), 7, today), null);
  assert.equal(staleRecordAge(log(7, '2026-09-20', { exercises: [] }), 7, today), null);
  assert.equal(staleRecordAge(undefined, 7, today), null);
});

test('the week is questioned once a day has gone more than a week without being trained again', () => {
  const day = (weekNumber, date, programId) => ({ ...log(weekNumber, date), programId });
  // Today is the 10th: the 2nd is 8 days ago, the 3rd only 7 — a normal weekly repeat.
  assert.deepEqual(staleWeekAge([day(7, '2026-10-02', 'upper'), day(7, '2026-10-08', 'lower')], 7, today), { days: 8, programId: 'upper' });
  assert.equal(staleWeekAge([day(7, '2026-10-03', 'upper')], 7, today), null);
  assert.equal(staleWeekAge([log(6, '2026-09-01')], 7, today), null);
});
