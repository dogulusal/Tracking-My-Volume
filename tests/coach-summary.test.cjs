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

const { summarizeAthlete, needsAttention, agoText } = loadTS('src/coach/summary.ts');

const today = new Date('2026-10-10T09:00:00');
const now = '2026-09-01T00:00:00.000Z';
const exercise = (id, name) => ({ id, name, defaultSets: 1, defaultWeight: 0, defaultReps: 8, isActive: true });
const program = (id, exercises) => ({ id, name: id, order: 0, exercises, createdAt: now, updatedAt: now });
const log = (programId, weekNumber, date, sets, extra = {}) => ({
  id: `${programId}-${weekNumber}`, programId, weekNumber, date, notes: '', isHoliday: false, updatedAt: now,
  exercises: Object.entries(sets).map(([exerciseId, [weight, reps]]) => ({
    exerciseId, exerciseName: exerciseId === 'b' ? 'Bench Press' : exerciseId === 's' ? 'Squat' : 'Row',
    sets: [{ weight, reps, intensity: 'failure' }],
  })),
  ...extra,
});

function state(weekLogs, currentWeek) {
  const programs = [program('A', [exercise('b', 'Bench Press'), exercise('s', 'Squat')]), program('B', [exercise('r', 'Row')])];
  return {
    programs, weekLogs, currentWeek,
    plans: [{ id: 'plan', name: 'Plan', programIds: ['A', 'B'], createdAt: now, updatedAt: now }],
    activePlanId: 'plan',
    phases: [{ id: 'phase-1', name: 'Faz 1', startWeek: 0, endWeek: null }],
  };
}

test('the week, the last workout and the comparison with last week', () => {
  const summary = summarizeAthlete(state([
    log('A', 0, '2026-09-29', { b: [60, 8], s: [80, 8] }),
    log('B', 0, '2026-10-01', { r: [50, 10] }),
    log('A', 1, '2026-10-07', { b: [60, 9], s: [80, 8] }),
  ], 1), today);
  assert.equal(summary.lastWorkout, '2026-10-07');
  assert.equal(summary.daysSinceLast, 3);
  assert.equal(summary.weekLabel, '2. hafta');
  assert.equal(summary.weekDone, 1);
  assert.equal(summary.weekTotal, 2);
  // Bench beat last week, squat matched it.
  assert.equal(summary.improved, 1);
  assert.equal(summary.compared, 2);
  assert.equal(summary.workouts, 3);
  assert.equal(needsAttention(summary), null);
  assert.deepEqual(summary.days, ['done', 'open']);
});

test('a holiday is not a workout, and a quiet week asks for attention', () => {
  const summary = summarizeAthlete(state([
    log('A', 0, '2026-10-01', { b: [60, 8] }),
    log('B', 1, '2026-10-08', {}, { isHoliday: true }),
  ], 1), today);
  assert.equal(summary.lastWorkout, '2026-10-01');
  assert.equal(summary.daysSinceLast, 9);
  assert.equal(summary.weekDone, 0);
  assert.deepEqual(summary.days, ['open', 'holiday']);
  assert.equal(needsAttention(summary), '9 gündür antrenman yok');
});

test('someone who joined and has not trained yet', () => {
  const summary = summarizeAthlete(state([], 0), today);
  assert.equal(summary.lastWorkout, null);
  assert.equal(summary.workouts, 0);
  assert.equal(needsAttention(summary), 'Henüz antrenman kaydı yok');
  assert.equal(agoText(summary.daysSinceLast), 'kayıt yok');
});

test('a movement stuck at the same best set for four weeks counts as stalled', () => {
  const weeks = [0, 1, 2, 3, 4].map(week => log('A', week, `2026-09-${String(5 + week * 7).padStart(2, '0')}`, { b: [60, 8] }));
  assert.equal(summarizeAthlete(state(weeks, 4), today).stalled, 1);
  assert.equal(summarizeAthlete(state(weeks.slice(0, 4), 3), today).stalled, 0);
});

test('days since the last workout in words', () => {
  assert.equal(agoText(0), 'bugün');
  assert.equal(agoText(1), 'dün');
  assert.equal(agoText(5), '5 gün önce');
});
