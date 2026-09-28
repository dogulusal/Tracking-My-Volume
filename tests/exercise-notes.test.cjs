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

const { movementSessions, sessionsBefore } = loadTS('src/utils/movements.ts');
const { appReducer, initialState } = loadTS('src/context/appReducer.ts');

const set = (weight, reps) => ({ weight, reps, intensity: 'failure' });
const log = (programId, weekNumber, date, exercises, extra = {}) =>
  ({ id: `${programId}-${weekNumber}`, programId, weekNumber, date, notes: '', isHoliday: false, updatedAt: '', exercises, ...extra });

test('a pinned note is merged into the movement settings and an empty one removes it', () => {
  let state = appReducer(initialState, { type: 'SET_EXERCISE_SETTINGS', payload: { key: 'shrug', settings: { note: 'koltuk 3' } } });
  assert.deepEqual(state.exerciseSettings, { shrug: { note: 'koltuk 3' } });
  state = appReducer(state, { type: 'SET_EXERCISE_SETTINGS', payload: { key: 'shrug', settings: { note: '' } } });
  assert.deepEqual(state.exerciseSettings, {});
});

test('the previous session of a movement is the last one on any day before this workout', () => {
  const weekLogs = [
    log('upper1', 37, '2026-09-11', [{ exerciseId: 'a', exerciseName: 'Pec Fly', sets: [set(90, 9)], note: 'sol ağır' }]),
    log('upper3', 37, '2026-09-16', [{ exerciseId: 'b', exerciseName: 'pec fly ', sets: [set(90, 9)] }]),
    log('upper1', 38, '2026-09-18', [{ exerciseId: 'a', exerciseName: 'Pec Fly', sets: [set(90, 10)], note: '+1.25 ekle' }]),
    log('upper2', 38, '2026-09-21', [], { isHoliday: true }),
    log('upper3', 38, '2026-09-23', [{ exerciseId: 'b', exerciseName: 'Pec Fly', sets: [set(91.25, 8)] }]),
  ];
  const sessions = movementSessions(weekLogs, 'pec fly');
  assert.deepEqual(sessions.map(s => `${s.log.programId}:${s.log.weekNumber}`), ['upper1:37', 'upper3:37', 'upper1:38', 'upper3:38']);
  // Upper 3 later in week 38 sees what Upper 1 wrote earlier that week.
  const beforeUpper3 = sessionsBefore(sessions, { programId: 'upper3', weekNumber: 38, date: '2026-09-23' });
  assert.equal(beforeUpper3.at(-1).exercise.note, '+1.25 ekle');
  // Re-opening Upper 1 week 38 never shows its own note as the previous one.
  const beforeUpper1 = sessionsBefore(sessions, { programId: 'upper1', weekNumber: 38, date: '2026-09-18T09:00:00.000Z' });
  assert.equal(beforeUpper1.at(-1).log.programId, 'upper3');
  assert.equal(beforeUpper1.at(-1).exercise.note, undefined);
});
