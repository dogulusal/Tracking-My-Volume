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

const { addMovementsFromWorkout, syncExerciseLogs } = loadTS('src/utils/exerciseSync.ts');

const set = (weight, reps, intensity = 'failure') => ({ weight, reps, intensity });
const program = (exercises) => ({ id: 'p1', name: 'Upper 1', order: 1, exercises, createdAt: '', updatedAt: '' });
const definition = (id, name) => ({ id, name, defaultSets: 2, defaultWeight: 50, defaultReps: 8, isActive: true });

test('a movement added during the workout joins the program with the first set as defaults', () => {
  const before = program([definition('bench', 'Bench Press')]);
  const after = addMovementsFromWorkout(before, [
    { exerciseId: 'bench', exerciseName: 'Bench Press', sets: [set(75, 8)] },
    { exerciseId: 'new-1', exerciseName: 'Cable Fly', sets: [set(15, 12, 'rir1'), set(15, 10)] },
  ]);
  assert.deepEqual(after.exercises.map(e => e.id), ['bench', 'new-1']);
  assert.deepEqual(after.exercises[1], { id: 'new-1', name: 'Cable Fly', defaultSets: 2, defaultWeight: 15, defaultReps: 12, isActive: true });
  assert.equal(after.exercises[0], before.exercises[0]);
});

test('nothing new, or a new movement with no sets, leaves the program as it was', () => {
  const before = program([definition('bench', 'Bench Press')]);
  assert.equal(addMovementsFromWorkout(before, [{ exerciseId: 'bench', exerciseName: 'Bench Press', sets: [set(75, 8)] }]), before);
  assert.equal(addMovementsFromWorkout(before, [{ exerciseId: 'x', exerciseName: 'Dips', sets: [] }]), before);
});

test('an empty day is built entirely from its first workout, in the order done', () => {
  const after = addMovementsFromWorkout(program([]), [
    { exerciseId: 'a', exerciseName: 'Squat', sets: [set(80, 6)] },
    { exerciseId: 'b', exerciseName: 'Leg Curl', sets: [set(40, 10)] },
  ]);
  assert.deepEqual(after.exercises.map(e => e.name), ['Squat', 'Leg Curl']);
});

test('a reloaded draft keeps movements the program does not have yet', () => {
  const logs = syncExerciseLogs(program([definition('bench', 'Bench Press')]), [
    { exerciseId: 'new-1', exerciseName: 'Cable Fly', sets: [set(15, 12)] },
  ], exercise => ({ exerciseId: exercise.id, exerciseName: exercise.name, sets: [] }));
  assert.deepEqual(logs.map(log => log.exerciseId), ['bench', 'new-1']);
});
