const test = require('node:test');
const assert = require('node:assert/strict');

const set = (weight, reps, intensity = 'failure') => ({ weight, reps, intensity });
const exercise = (id, name, defaultSets = 2) => ({ id, name, defaultSets, isActive: true });
const log = (weekNumber, exercises, extra = {}) => ({ id: `w${weekNumber}`, programId: 'upper', weekNumber, exercises, notes: '', isHoliday: false, ...extra });

function phaseState() {
  return {
    currentWeek: 5,
    phases: [{ id: 'p1', name: 'Faz 1', startWeek: 0, endWeek: 1 }, { id: 'p2', name: 'Faz 2', startWeek: 2, endWeek: null }],
    programVersions: [
      { phaseId: 'p1', fromWeek: 0, programs: [{ id: 'upper', name: 'Upper', order: 0, exercises: [exercise('press', 'Press'), exercise('row', 'Row')] }] },
      { phaseId: 'p2', fromWeek: 0, programs: [{ id: 'upper', name: 'Upper', order: 0, exercises: [exercise('press', 'Press'), exercise('row', 'Row'), exercise('curl', 'Curl')] }] },
    ],
    exerciseRowOrder: { upper: ['curl', 'press', 'row'] },
    weekLogs: [
      log(0, [{ exerciseId: 'press', exerciseName: 'Press', sets: [set(50, 8)] }, { exerciseId: 'row', exerciseName: 'row_legacy', sets: [set(40, 10)] }]),
      log(2, [{ exerciseId: 'press', exerciseName: 'Press', sets: [set(60, 8), set(60, 6)] }], { notes: 'iyi gün' }),
      log(3, [{ exerciseId: 'press', exerciseName: 'Press', sets: [set(60, 8), set(60, 7)] }, { exerciseId: 'curl', exerciseName: 'Curl', sets: [set(15, 10)] }]),
      log(4, [], { isHoliday: true }),
      log(5, [{ exerciseId: 'press', exerciseName: 'Press', sets: [set(60, 8, 'rir1'), set(60, 7)] }]),
    ],
  };
}

test('grid cells use the app comparison: every set and RIR, against the nearest earlier record', async () => {
  const { buildPhaseGrid } = await import('../supabase/functions/_shared/historyGrid.mjs');
  const grid = buildPhaseGrid(phaseState(), 'p2');
  assert.deepEqual(grid.weeks, [2, 3, 4, 5]);
  const press = grid.programs[0].rows.find(row => row.exerciseId === 'press');
  assert.deepEqual(press.cells.map(cell => cell.status), ['new', 'improved', 'holiday', 'improved']);
  // The second set improved while the first stayed: the Sheet used to call this "same".
  assert.equal(press.cells[1].text, '60 x 8 F\n60 x 7 F');
  assert.equal(press.cells[2].text, 'TATİL');
  // H3 skipped over the holiday: compared with H1 (week 3), RIR up on the first set.
  assert.equal(press.cells[3].status, 'improved');
  const curl = grid.programs[0].rows.find(row => row.exerciseId === 'curl');
  // First record of an exercise that joined after H0 is its reference, not "no colour".
  assert.deepEqual(curl.cells.map(cell => cell.status), [null, 'new', 'holiday', null]);
  assert.deepEqual(grid.programs[0].notes, ['iyi gün', '', '', '']);
});

test('grid rows take names from the program, and only the latest phase follows the saved row order', async () => {
  const { buildPhaseGrid } = await import('../supabase/functions/_shared/historyGrid.mjs');
  const state = phaseState();
  const current = buildPhaseGrid(state, 'p2').programs[0].rows.map(row => row.name);
  assert.deepEqual(current, ['Curl', 'Press', 'Row']);
  const finished = buildPhaseGrid(state, 'p1');
  assert.deepEqual(finished.weeks, [0, 1]);
  // The record carried a raw id-like name; the program's name wins, as in History.
  assert.deepEqual(finished.programs[0].rows.map(row => row.name), ['Press', 'Row']);
  assert.equal(finished.programs[0].rows[0].defaultSets, 2);
});

test('a phase that has not started has no weeks, and a missing phase has no grid', async () => {
  const { buildPhaseGrid } = await import('../supabase/functions/_shared/historyGrid.mjs');
  const state = { ...phaseState(), currentWeek: 1 };
  assert.deepEqual(buildPhaseGrid(state, 'p2').weeks, []);
  assert.equal(buildPhaseGrid(state, 'nope'), null);
});
