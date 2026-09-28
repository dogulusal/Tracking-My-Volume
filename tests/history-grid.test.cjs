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
      log(3, [{ exerciseId: 'press', exerciseName: 'Press', sets: [set(60, 8), set(60, 7)] }, { exerciseId: 'curl', exerciseName: 'Curl', sets: [set(15, 10)], note: ' haftaya 17.5 gir ' }]),
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
  assert.equal(press.cells[1].sets.length, 2, 'Charts reads the sets from the same cell');
  assert.equal(press.cells[2].text, 'TATİL');
  assert.equal(press.cells[2].sets, undefined);
  // H3 skipped over the holiday: compared with H1 (week 3), RIR up on the first set.
  assert.equal(press.cells[3].status, 'improved');
  const curl = grid.programs[0].rows.find(row => row.exerciseId === 'curl');
  // First record of an exercise that joined after H0 is its reference, not "no colour".
  assert.deepEqual(curl.cells.map(cell => cell.status), [null, 'new', 'holiday', null]);
  // A movement's note joins the week's notes row under its name.
  assert.deepEqual(grid.programs[0].notes, ['iyi gün', 'Curl: haftaya 17.5 gir', '', '']);
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

test('a hard day keeps its own colour but the next week is measured against the last normal one', async () => {
  const { buildPhaseGrid } = await import('../supabase/functions/_shared/historyGrid.mjs');
  const press = sets => [{ exerciseId: 'press', exerciseName: 'Press', sets }];
  const state = {
    currentWeek: 3,
    phases: [{ id: 'p', name: 'Faz', startWeek: 0, endWeek: null }],
    programVersions: [{ phaseId: 'p', fromWeek: 0, programs: [{ id: 'upper', name: 'Upper', order: 0, exercises: [exercise('press', 'Press')] }] }],
    weekLogs: [
      log(0, press([set(60, 8)])),
      log(1, press([set(60, 5)]), { offDay: true, notes: 'uykusuz' }),
      log(2, press([set(60, 7)])),
      log(3, press([set(60, 6)])),
    ],
  };
  const cells = buildPhaseGrid(state, 'p').programs[0].rows[0].cells;
  // Week 2 would be green against the hard day's 5 reps; against week 0's 8 it is a drop.
  assert.deepEqual(cells.map(cell => [cell.status, cell.compareWeek]), [['new', undefined], ['decreased', 0], ['decreased', 0], ['decreased', 2]]);
  assert.deepEqual(buildPhaseGrid(state, 'p').programs[0].notes, ['', 'Zor gün\nuykusuz', '', '']);
  // With nothing but hard days before it, the nearest record still counts.
  const onlyHard = { ...state, weekLogs: [log(0, press([set(60, 8)]), { offDay: true }), log(1, press([set(60, 9)]))] };
  assert.deepEqual(buildPhaseGrid(onlyHard, 'p').programs[0].rows[0].cells.slice(0, 2).map(cell => cell.status), ['new', 'improved']);
});

test('a movement taken out of the program keeps its row and records the week it left', async () => {
  const { buildPhaseGrid } = await import('../supabase/functions/_shared/historyGrid.mjs');
  const { projectSheets } = await import('../supabase/functions/_shared/sheetProjection.mjs');
  const upper = (...exercises) => [{ id: 'upper', name: 'Upper', order: 0, exercises }];
  const state = {
    currentWeek: 13,
    phases: [{ id: 'p', name: 'Faz 3', startWeek: 10, endWeek: null }],
    // Cable left the program at H2; the H2 workout was already saved with it.
    programVersions: [
      { phaseId: 'p', fromWeek: 0, programs: upper(exercise('press', 'Press'), exercise('cable', 'Cable Row')) },
      { phaseId: 'p', fromWeek: 2, programs: upper(exercise('press', 'Press')) },
    ],
    weekLogs: [10, 11, 12, 13].map(week => log(week, [
      { exerciseId: 'press', exerciseName: 'Press', sets: [set(60, 8)] },
      ...(week < 13 ? [{ exerciseId: 'cable', exerciseName: 'Cable Row', sets: [set(43, 8)] }] : []),
    ])),
  };
  const rows = buildPhaseGrid(state, 'p').programs[0].rows;
  assert.deepEqual(rows.map(row => [row.name, row.removedAt]), [['Press', null], ['Cable Row', 12]]);
  assert.deepEqual(rows[1].cells.map(cell => cell.text), ['43 x 8 F', '43 x 8 F', '43 x 8 F', '']);

  // The Sheet marks it by default and leaves it out when History hides it.
  const [marked] = projectSheets(state);
  assert.ok(marked.rows.some(row => row[0] === 'Cable Row (çıkarıldı H2)'));
  assert.deepEqual(marked.removedRows.map(index => marked.rows[index][0]), ['Cable Row (çıkarıldı H2)']);
  const [hidden] = projectSheets({ ...state, hideRemovedExercises: true });
  assert.ok(!hidden.rows.some(row => String(row[0]).startsWith('Cable Row')));
  assert.deepEqual(hidden.removedRows, []);
  assert.equal(hidden.rows.length, marked.rows.length - 1);
});
