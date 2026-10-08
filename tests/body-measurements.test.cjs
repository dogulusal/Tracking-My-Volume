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

const { weekStart, weeklySeries, measureStatus, measurementDue } = loadTS('src/utils/body.ts');
const { appReducer, initialState } = loadTS('src/context/appReducer.ts');

test('weeks start on Monday', () => {
  assert.equal(weekStart('2026-10-08'), '2026-10-05'); // Thursday
  assert.equal(weekStart('2026-10-05'), '2026-10-05'); // Monday
  assert.equal(weekStart('2026-10-11'), '2026-10-05'); // Sunday
});

test('the chart takes each week’s mean, and a measurement left blank is not a zero', () => {
  const entries = [
    { date: '2026-09-29', weight: 82, waist: 86 },
    { date: '2026-10-01', weight: 81 },
    { date: '2026-10-06', weight: 80.4 },
  ];
  assert.deepEqual(weeklySeries(entries, 'weight'), [{ week: '2026-09-28', value: 81.5 }, { week: '2026-10-05', value: 80.4 }]);
  assert.deepEqual(weeklySeries(entries, 'waist'), [{ week: '2026-09-28', value: 86 }]);
  assert.deepEqual(weeklySeries(entries, 'arm'), []);
});

test('start, latest and the way left to the goal', () => {
  const entries = [{ date: '2026-09-01', weight: 84 }, { date: '2026-09-20', weight: 82.3, waist: 88 }, { date: '2026-10-06', weight: 81 }];
  assert.deepEqual(measureStatus(entries, 'weight', 78), { first: 84, latest: 81, latestDate: '2026-10-06', change: -3, toGoal: -3 });
  assert.deepEqual(measureStatus(entries, 'waist'), { first: 88, latest: 88, latestDate: '2026-09-20', change: 0, toGoal: null });
  assert.equal(measureStatus(entries, 'arm'), null);
});

test('the reminder is only for someone who measures, a week after the last time', () => {
  assert.equal(measurementDue(undefined, '2026-10-08'), false);
  assert.equal(measurementDue([], '2026-10-08'), false);
  assert.equal(measurementDue([{ date: '2026-10-02', weight: 81 }], '2026-10-08'), false);
  assert.equal(measurementDue([{ date: '2026-10-01', weight: 81 }], '2026-10-08'), true);
});

test('saving a day again replaces it, entries stay in date order, goals can be removed', () => {
  let state = { ...initialState };
  state = appReducer(state, { type: 'SAVE_MEASUREMENT', payload: { date: '2026-10-08', weight: 81 } });
  state = appReducer(state, { type: 'SAVE_MEASUREMENT', payload: { date: '2026-10-01', weight: 82 } });
  state = appReducer(state, { type: 'SAVE_MEASUREMENT', payload: { date: '2026-10-08', weight: 80.6, waist: 85 } });
  assert.deepEqual(state.bodyMeasurements, [{ date: '2026-10-01', weight: 82 }, { date: '2026-10-08', weight: 80.6, waist: 85 }]);
  state = appReducer(state, { type: 'DELETE_MEASUREMENT', payload: '2026-10-01' });
  assert.equal(state.bodyMeasurements.length, 1);
  state = appReducer(state, { type: 'SET_BODY_GOAL', payload: { key: 'weight', value: 78 } });
  state = appReducer(state, { type: 'SET_BODY_GOAL', payload: { key: 'waist', value: 80 } });
  state = appReducer(state, { type: 'SET_BODY_GOAL', payload: { key: 'waist', value: null } });
  assert.deepEqual(state.bodyGoals, { weight: 78 });
});
