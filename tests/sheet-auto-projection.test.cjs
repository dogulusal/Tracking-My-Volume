const test = require('node:test');
const assert = require('node:assert/strict');

test('automatic phase tabs use their own definitions and logs, including deletions', async () => {
  const { projectSheets } = await import('../supabase/functions/_shared/sheetProjection.mjs');
  const exercise = (id, name) => ({ id, name, isActive: true, defaultSets: 2 });
  const program = (exercises) => ({ id: 'upper', name: 'Upper 1', order: 0, exercises });
  const state = {
    currentWeek: 3,
    phases: [
      { id: 'p1', name: 'Faz 1', startWeek: 0, endWeek: 1 },
      { id: 'p3', name: 'Faz 3', startWeek: 2, endWeek: null },
    ],
    programVersions: [
      { phaseId: 'p1', fromWeek: 0, programs: [program([exercise('a', 'Old press')])] },
      { phaseId: 'p3', fromWeek: 0, programs: [program([exercise('b', 'New press')])] },
    ],
    weekLogs: [
      { weekNumber: 0, programId: 'upper', exercises: [{ exerciseId: 'a', exerciseName: 'Old press', sets: [{ weight: 40, reps: 8 }] }], notes: 'Eski not' },
      { weekNumber: 2, programId: 'upper', exercises: [{ exerciseId: 'b', exerciseName: 'New press', sets: [{ weight: 50, reps: 6 }] }], notes: 'Yeni not' },
    ],
  };
  const [first, third] = projectSheets(state);
  assert.match(first.title, /Faz 1/);
  assert.match(third.title, /Faz 3/);
  assert.ok(first.rows.some(row => row[0] === 'Old press'));
  assert.ok(!first.rows.some(row => row[0] === 'New press'));
  assert.ok(third.rows.some(row => row[0] === 'New press'));
  assert.ok(!third.rows.some(row => row[0] === 'Old press'));
  assert.equal(first.rows.find(row => row[0] === 'HAFTALIK NOTLAR')[2], 'Eski not');
  assert.equal(third.rows.find(row => row[0] === 'HAFTALIK NOTLAR')[2], 'Yeni not');
  state.weekLogs[1].exercises = [];
  state.programVersions[1].programs[0].exercises = [];
  assert.ok(!projectSheets(state)[1].rows.some(row => row[0] === 'New press'));
});

test('automatic selection limits phase, workout and week while retaining the visual blocks', async () => {
  const { projectSheets } = await import('../supabase/functions/_shared/sheetProjection.mjs');
  const { buildAutoSheetStyleRequests } = await import('../supabase/functions/_shared/sheetStyle.mjs');
  const exercise = { id: 'press', name: 'Press', isActive: true, defaultSets: 1 };
  const programs = ['upper', 'lower'].map((id, order) => ({ id, name: id, order, exercises: [exercise] }));
  const state = { currentWeek: 3, phases: [
    { id: 'old', name: 'Old', startWeek: 0, endWeek: 1 },
    { id: 'current', name: 'Current', startWeek: 2, endWeek: null },
  ], programVersions: [{ phaseId: 'current', fromWeek: 0, programs }], weekLogs: [
    { programId: 'upper', weekNumber: 2, exercises: [{ exerciseId: 'press', sets: [{ weight: 50, reps: 8 }] }], notes: 'earlier' },
    { programId: 'upper', weekNumber: 3, exercises: [{ exerciseId: 'press', sets: [{ weight: 55, reps: 8 }] }], notes: 'latest' },
  ] };
  const [sheet] = projectSheets(state, { phaseId: 'current', programId: 'upper', weekMode: 'latest', weekNumber: 3 });
  assert.equal(sheet.phaseId, 'current');
  assert.equal(sheet.blocks.length, 1);
  assert.equal(sheet.rows[0][0], 'upper');
  assert.match(sheet.rows[0][2], /Yeşil/);
  assert.deepEqual(sheet.rows[1].slice(2), ['H0', 'H1']);
  assert.equal(sheet.rows[2][2], '');
  assert.match(sheet.rows[2][3], /55 x 8/);
  assert.equal(sheet.rows[3][3], 'latest');
  const style = buildAutoSheetStyleRequests(42, sheet);
  assert.ok(style.some(request => request.repeatCell?.cell.userEnteredFormat.backgroundColorStyle?.rgbColor?.red < 0.2));
  assert.ok(style.some(request => request.mergeCells?.range.startRowIndex === 0));
  assert.ok(!buildAutoSheetStyleRequests(42, sheet, [{ startRowIndex: 0, endRowIndex: 1, startColumnIndex: 2, endColumnIndex: 8 }])
    .some(request => request.mergeCells?.range.startRowIndex === 0));
  const [one] = projectSheets(state, { phaseId: 'current', programId: null, weekMode: 'one', weekNumber: 2 });
  assert.equal(one.blocks.length, 2);
  assert.equal(one.rows[2][2], '50 x 8');
  assert.equal(one.rows[2][3], '');
});
