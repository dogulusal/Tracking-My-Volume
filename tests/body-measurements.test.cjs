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

const { weekStart, pointsOf, weeklySeries, weekOffsets, seriesChange, chartScale, measureStatus, measurementDue, navyBodyFat, estimatedBodyFat, formMeasures } = loadTS('src/utils/body.ts');
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
  assert.deepEqual(weeklySeries(pointsOf(entries, 'weight')), [{ week: '2026-09-28', value: 81.5 }, { week: '2026-10-05', value: 80.4 }]);
  assert.deepEqual(weeklySeries(pointsOf(entries, 'waist')), [{ week: '2026-09-28', value: 86 }]);
  assert.deepEqual(weeklySeries(pointsOf(entries, 'arm')), []);
});

test('start, latest and the way left to the goal', () => {
  const entries = [{ date: '2026-09-01', weight: 84 }, { date: '2026-09-20', weight: 82.3, waist: 88 }, { date: '2026-10-06', weight: 81 }];
  assert.deepEqual(measureStatus(pointsOf(entries, 'weight'), 78), { first: 84, latest: 81, latestDate: '2026-10-06', change: -3, toGoal: -3 });
  assert.deepEqual(measureStatus(pointsOf(entries, 'waist')), { first: 88, latest: 88, latestDate: '2026-09-20', change: 0, toGoal: null });
  assert.equal(measureStatus(pointsOf(entries, 'arm')), null);
});

test('the change over the weeks and per week, a missed week counted as a week', () => {
  const series = [{ week: '2026-08-17', value: 84.6 }, { week: '2026-08-24', value: 84.1 }, { week: '2026-09-14', value: 82.6 }, { week: '2026-09-28', value: 81.8 }];
  assert.deepEqual(weekOffsets(series), [0, 1, 4, 6]);
  assert.deepEqual(seriesChange(series), { change: -2.8, weeks: 6, perWeek: -0.5 });
  assert.deepEqual(seriesChange([{ week: '2026-09-28', value: 81.8 }]), { change: 0, weeks: 0, perWeek: null });
  assert.equal(seriesChange([]), null);
});

test('the chart scale has whole-unit gridlines and is never narrower than two units', () => {
  // A few kilos: a gridline per kilo.
  assert.deepEqual(chartScale([84.6, 83, 81.8]), { lo: 81, hi: 85, ticks: [81, 82, 83, 84, 85] });
  // The target below widens it, still a kilo apart.
  assert.deepEqual(chartScale([84.6, 81.8, 79]).ticks, [79, 80, 81, 82, 83, 84, 85]);
  // Half a centimetre does not fill the chart.
  assert.deepEqual(chartScale([39.5, 39]), { lo: 38, hi: 41, ticks: [38, 39, 40, 41] });
  // Twenty kilos: five apart.
  assert.deepEqual(chartScale([100, 80]).ticks, [80, 85, 90, 95, 100]);
});

test('the reminder is only for someone who measures: each new calendar week, or each day if chosen', () => {
  assert.equal(measurementDue(undefined, '2026-10-08'), false);
  assert.equal(measurementDue([], '2026-10-08'), false);
  // Thursday the 8th: measured on Monday this week, nothing to ask; on Sunday, a new week has begun.
  assert.equal(measurementDue([{ date: '2026-10-05', weight: 81 }], '2026-10-08'), false);
  assert.equal(measurementDue([{ date: '2026-10-04', weight: 81 }], '2026-10-08'), true);
  // Daily: anything before today.
  assert.equal(measurementDue([{ date: '2026-10-08', weight: 81 }], '2026-10-08', true), false);
  assert.equal(measurementDue([{ date: '2026-10-07', weight: 81 }], '2026-10-08', true), true);
});

test('the reminder is weekly unless daily is chosen, weekly stored as nothing', () => {
  const daily = appReducer({ ...initialState }, { type: 'SET_MEASURE_REMINDER', payload: 'daily' });
  assert.equal(daily.measureReminder, 'daily');
  assert.equal('measureReminder' in appReducer(daily, { type: 'SET_MEASURE_REMINDER', payload: 'weekly' }), false);
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

test('body fat by the US Navy method: men from waist, neck and height, women also from the hips', () => {
  const man = { sex: 'male', heightCm: 178 };
  const woman = { sex: 'female', heightCm: 165 };
  assert.equal(navyBodyFat({ date: '2026-10-08', weight: 80, waist: 85, neck: 38 }, man), 16.4);
  assert.equal(navyBodyFat({ date: '2026-10-08', weight: 62, waist: 72, neck: 32, hips: 97 }, woman), 26.9);
  // Without the hips a woman's estimate cannot be made; without sex or height nobody's.
  assert.equal(navyBodyFat({ date: '2026-10-08', weight: 62, waist: 72, neck: 32 }, woman), null);
  assert.equal(navyBodyFat({ date: '2026-10-08', weight: 80, waist: 85, neck: 38 }, { heightCm: 178 }), null);
  assert.equal(navyBodyFat({ date: '2026-10-08', weight: 80, waist: 85, neck: 38 }, { sex: 'male' }), null);
  assert.equal(navyBodyFat({ date: '2026-10-08', weight: 80, waist: 85, neck: 38 }, undefined), null);
  // A neck typed into the waist field is not a body fat figure.
  assert.equal(navyBodyFat({ date: '2026-10-08', weight: 80, waist: 38, neck: 85 }, man), null);
});

test('the estimate is made for the days that have what it needs', () => {
  const entries = [{ date: '2026-09-29', weight: 82, waist: 88, neck: 39 }, { date: '2026-10-01', weight: 81.6 }, { date: '2026-10-06', weight: 81, waist: 86, neck: 39 }];
  assert.deepEqual(estimatedBodyFat(entries, { sex: 'male', heightCm: 180 }).map(point => point.date), ['2026-09-29', '2026-10-06']);
});

test('the form offers what each sex mostly follows first, and never withholds the rest', () => {
  assert.deepEqual(formMeasures('male').first, ['waist', 'neck', 'chest', 'arm', 'shoulders']);
  assert.deepEqual(formMeasures('female').first, ['waist', 'hips', 'neck', 'thigh', 'arm']);
  for (const sex of ['male', 'female', undefined]) {
    const { first, other } = formMeasures(sex);
    assert.equal(first.length + other.length, 9);
    assert.ok(!first.includes('weight') && !other.includes('weight'));
  }
});

test('the profile is kept as given, an empty one meaning asked and left blank', () => {
  let state = appReducer({ ...initialState }, { type: 'SET_BODY_PROFILE', payload: {} });
  assert.deepEqual(state.bodyProfile, {});
  state = appReducer(state, { type: 'SET_BODY_PROFILE', payload: { sex: 'female', heightCm: 165 } });
  assert.deepEqual(state.bodyProfile, { sex: 'female', heightCm: 165 });
});
