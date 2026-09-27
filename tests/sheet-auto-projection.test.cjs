const test = require('node:test');
const assert = require('node:assert/strict');

test('starting a new phase keeps the finished phase tab in the file, also when the sync is retried', async () => {
  const { resolveAutoSelection, dropStaleManagedTabs } = await import('../supabase/functions/_shared/autoSelection.mjs');
  const following = { phaseId: 'faz3', programId: null, weekMode: 'latest', weekNumber: 36, followCurrentPhase: true };
  const first = resolveAutoSelection(following, { id: 'faz4' }, 57, { faz3: 11 });
  assert.equal(first.selection.phaseId, 'faz4');
  assert.deepEqual(first.finished, { selection: following, sheetId: 11 });
  assert.deepEqual(first.managedTabs, {});
  // The worker creates the Faz 4 tab (22), then fails. The retry starts from
  // what was saved with the selection and must not delete tab 11.
  const retry = resolveAutoSelection(first.selection, { id: 'faz4' }, 57, { ...first.managedTabs, faz4: 22 });
  assert.equal(retry.finished, null);
  assert.deepEqual(dropStaleManagedTabs(retry.managedTabs, new Set(['faz4'])), { managedTabs: { faz4: 22 }, remove: [] });
});

test('a scope the user chose is kept, and changing it still replaces the old automatic tab', async () => {
  const { resolveAutoSelection, dropStaleManagedTabs } = await import('../supabase/functions/_shared/autoSelection.mjs');
  const chosen = { phaseId: 'faz2', programId: 'upper', weekMode: 'all', weekNumber: 15, followCurrentPhase: false };
  assert.deepEqual(resolveAutoSelection(chosen, { id: 'faz3' }, 40, { faz2: 22 }), { selection: chosen, managedTabs: { faz2: 22 }, finished: null });
  assert.equal(resolveAutoSelection(null, { id: 'faz3' }, 40, {}).selection.phaseId, 'faz3');
  assert.deepEqual(dropStaleManagedTabs({ faz3: 11, faz2: 22 }, new Set(['faz2'])), { managedTabs: { faz2: 22 }, remove: [11] });
});

test('"all weeks" of the current phase moves on to the next phase and leaves the old tab complete', async () => {
  const { followsCurrentPhase, resolveAutoSelection } = await import('../supabase/functions/_shared/autoSelection.mjs');
  assert.equal(followsCurrentPhase('faz3', 'faz3', 'all', null), true);
  assert.equal(followsCurrentPhase('faz3', 'faz3', 'latest', null), true);
  assert.equal(followsCurrentPhase('faz3', 'faz3', 'one', null), false);
  assert.equal(followsCurrentPhase('faz3', 'faz3', 'all', 'upper1'), false);
  assert.equal(followsCurrentPhase('faz2', 'faz3', 'all', null), false);
  const whole = { phaseId: 'faz3', programId: null, weekMode: 'all', weekNumber: 36, followCurrentPhase: true };
  const next = resolveAutoSelection(whole, { id: 'faz4' }, 50, { faz3: 11 });
  assert.equal(next.selection.phaseId, 'faz4');
  assert.deepEqual(next.finished, { selection: whole, sheetId: 11 });
});

test('automatic tabs write every set on its own line and make the row tall enough for it', async () => {
  const { projectSheets } = await import('../supabase/functions/_shared/sheetProjection.mjs');
  const { buildAutoSheetStyleRequests } = await import('../supabase/functions/_shared/sheetStyle.mjs');
  const set = { weight: 70, reps: 7, intensity: 'failure' };
  const state = { currentWeek: 0, phases: [{ id: 'p', name: 'Faz 1', startWeek: 0, endWeek: null }],
    programVersions: [{ phaseId: 'p', fromWeek: 0, programs: [{ id: 'upper', name: 'Upper', order: 0,
      exercises: [{ id: 'row', name: 'Row', isActive: true, defaultSets: 3 }] }] }],
    weekLogs: [{ programId: 'upper', weekNumber: 0, exercises: [{ exerciseId: 'row', sets: [set, set, { ...set, reps: 6 }] }] }] };
  const [sheet] = projectSheets(state);
  assert.equal(sheet.rows[2][2], '70 x 7 F\n70 x 7 F\n70 x 6 F');
  const height = buildAutoSheetStyleRequests(1, sheet).find(request =>
    request.updateDimensionProperties?.range.dimension === 'ROWS' && request.updateDimensionProperties.range.startIndex === 2);
  assert.equal(height.updateDimensionProperties.properties.pixelSize, 3 * 18 + 12);
});

test('a new account keeps a writable phase tab before its first program', async () => {
  const { projectSheets } = await import('../supabase/functions/_shared/sheetProjection.mjs');
  const state = { currentWeek: 0, phases: [{ id: 'phase-1', name: 'Faz 1', startWeek: 0, endWeek: null }],
    programs: [], programVersions: [], weekLogs: [] };
  const [sheet] = projectSheets(state, { phaseId: 'phase-1', programId: null, weekMode: 'latest', weekNumber: 0 });
  assert.equal(sheet.phaseId, 'phase-1');
  assert.equal(sheet.blocks.length, 0);
  assert.match(sheet.rows[1][0], /Henüz antrenman programı yok/);
  state.programs = [{ id: 'upper', name: 'Upper 1', order: 0, exercises: [] }];
  assert.equal(projectSheets(state)[0].rows[0][0], 'Upper 1');
});

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
  const baseline = buildAutoSheetStyleRequests(42, one).find(request =>
    request.repeatCell?.range.startRowIndex === 2 && request.repeatCell.range.startColumnIndex === 2
      && request.repeatCell.range.endColumnIndex === 3);
  const baseRgb = baseline.repeatCell.cell.userEnteredFormat.backgroundColorStyle.rgbColor;
  assert.deepEqual([baseRgb.red, baseRgb.green, baseRgb.blue].map(value => Math.round(value * 255)), [207, 226, 243]);
  assert.match(one.rows[0][2], /Mavi: referans/);
});
