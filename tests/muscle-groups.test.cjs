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

const { suggestedGroup, groupOf, exerciseKey, blockPeriods, weeklyPeriods, muscleVolume } = loadTS('src/utils/muscleGroups.ts');
const { appReducer, initialState } = loadTS('src/context/appReducer.ts');

test('names suggest their muscle group; the specific movement wins over a word it contains', () => {
  const cases = {
    'Leg Curl': 'Bacak', 'Biceps Long Head': 'Biceps', 'Triceps Short Head': 'Triceps', 'Shoulder Press': 'Omuz',
    'Leg Press': 'Bacak', 'Flat Press': 'Göğüs', 'İncline Machine': 'Göğüs', 'Lateral Ön': 'Omuz', 'lateral arka': 'Omuz',
    'Kelso Shrug': 'Sırt', 'Latt Pulldown': 'Sırt', 'Pull Up': 'Sırt', 'Kalf': 'Baldır', 'RDL': 'Bacak', 'Adduction Machine': 'Bacak',
  };
  for (const [name, group] of Object.entries(cases)) assert.equal(suggestedGroup(name), group, name);
  // "machine" contains "chin"; a bare machine name says nothing about the muscle.
  assert.equal(suggestedGroup('Smith Machine'), null);
});

test('a group picked by hand overrides the suggestion for every spelling of the name', () => {
  assert.equal(exerciseKey('  İncline   Press '), 'incline press');
  let state = appReducer(initialState, { type: 'SET_MUSCLE_GROUP', payload: { key: exerciseKey('Smith Machine'), group: 'Göğüs' } });
  assert.equal(groupOf('smith machine', state.muscleGroups), 'Göğüs');
  assert.equal(groupOf('Unknown Thing', state.muscleGroups), 'Atanmamış');
  state = appReducer(state, { type: 'SET_MUSCLE_GROUP', payload: { key: exerciseKey('Smith Machine'), group: null } });
  assert.deepEqual(state.muscleGroups, {});
  assert.equal(groupOf('Smith Machine', state.muscleGroups), 'Atanmamış');
});

test('four-week blocks start at each phase H0 and never cross into the next phase', () => {
  const phases = [{ id: 'a', name: 'Faz 1', startWeek: 0, endWeek: 5 }, { id: 'b', name: 'Faz 2', startWeek: 6, endWeek: null }];
  const blocks = blockPeriods(phases, 8);
  assert.deepEqual(blocks.map(p => [p.phaseName, p.label, p.weeks]), [
    ['Faz 1', 'H0–H3', [0, 1, 2, 3]], ['Faz 1', 'H4–H5', [4, 5]], ['Faz 2', 'H0–H2', [6, 7, 8]],
  ]);
  assert.equal(weeklyPeriods(phases, 8).length, 9);
});

test('volume counts sets with reps and their tonnage; holiday weeks count nothing', () => {
  const phases = [{ id: 'a', name: 'Faz 1', startWeek: 0, endWeek: null }];
  const set = (weight, reps) => ({ weight, reps, intensity: 'failure' });
  const state = {
    muscleGroups: {},
    weekLogs: [
      { weekNumber: 0, isHoliday: false, exercises: [
        { exerciseName: 'Leg Curl', sets: [set(50, 10), set(50, 8)] },
        { exerciseName: 'Biceps Curl', sets: [set(15, 12), set(15, 0)] },
      ] },
      { weekNumber: 1, isHoliday: true, exercises: [{ exerciseName: 'Leg Curl', sets: [set(50, 10)] }] },
    ],
  };
  const rows = muscleVolume(state, weeklyPeriods(phases, 1));
  assert.deepEqual(rows.map(r => r.group), ['Biceps', 'Bacak']);
  assert.deepEqual(rows.find(r => r.group === 'Bacak').cells, [{ sets: 2, tonnage: 900 }, { sets: 0, tonnage: 0 }]);
  assert.deepEqual(rows.find(r => r.group === 'Biceps').cells[0], { sets: 1, tonnage: 180 });
});
