const test = require('node:test');
const assert = require('node:assert/strict');

test('starting a new phase keeps the finished phase tab managed and complete, also when the sync is retried', async () => {
  const { resolveAutoSelection, phaseSelections, dropStaleManagedTabs } = await import('../supabase/functions/_shared/autoSelection.mjs');
  const following = { phaseId: 'faz3', programId: null, weekMode: 'latest', weekNumber: 36, followCurrentPhase: true };
  const selection = resolveAutoSelection(following, { id: 'faz4', startWeek: 50 });
  // The new phase starts from its H0, not from whichever week the sync ran in.
  assert.deepEqual(selection, { phaseId: 'faz4', programId: null, weekMode: 'all', weekNumber: 50, followCurrentPhase: true });
  const state = { currentWeek: 50, phases: [{ id: 'faz3', startWeek: 36, endWeek: 49 }, { id: 'faz4', startWeek: 50, endWeek: null }] };
  const targets = phaseSelections(state, selection);
  // The finished phase is still written, now as the whole phase.
  assert.deepEqual(targets.map(target => [target.phaseId, target.weekMode]), [['faz3', 'all'], ['faz4', 'all']]);
  // A retry starts from the saved selection; neither tab is dropped.
  assert.equal(resolveAutoSelection(selection, { id: 'faz4', startWeek: 50 }), selection);
  assert.deepEqual(dropStaleManagedTabs({ faz3: 11, faz4: 22 }, new Set(targets.map(target => target.phaseId))),
    { managedTabs: { faz3: 11, faz4: 22 }, remove: [] });
});

test('every started phase gets a tab, a chosen scope keeps its phase, and removed phases lose theirs', async () => {
  const { resolveAutoSelection, phaseSelections, dropStaleManagedTabs } = await import('../supabase/functions/_shared/autoSelection.mjs');
  const chosen = { phaseId: 'faz2', programId: 'upper', weekMode: 'all', weekNumber: 15, followCurrentPhase: false };
  assert.equal(resolveAutoSelection(chosen, { id: 'faz3', startWeek: 36 }), chosen);
  const state = { currentWeek: 36, phases: [
    { id: 'faz3', startWeek: 36, endWeek: 59 }, { id: 'faz1', startWeek: 0, endWeek: 14 },
    { id: 'faz2', startWeek: 15, endWeek: 35 }, { id: 'later', startWeek: 60, endWeek: null },
  ] };
  const targets = phaseSelections(state, chosen);
  // Phase order, and a phase that has not reached its H0 has no tab yet.
  assert.deepEqual(targets.map(target => target.phaseId), ['faz1', 'faz2', 'faz3']);
  assert.equal(targets[1], chosen);
  assert.deepEqual(targets[0], { phaseId: 'faz1', programId: null, weekMode: 'all', weekNumber: 0, followCurrentPhase: false });
  // A Sheet connected mid-phase still shows the phase from H0.
  assert.deepEqual(resolveAutoSelection(null, { id: 'faz3', startWeek: 36 }),
    { phaseId: 'faz3', programId: null, weekMode: 'all', weekNumber: 36, followCurrentPhase: true });
  assert.deepEqual(dropStaleManagedTabs({ faz3: 11, gone: 22 }, new Set(['faz3'])), { managedTabs: { faz3: 11 }, remove: [22] });
});

test('"all weeks" of the current phase moves on to the next phase', async () => {
  const { followsCurrentPhase, resolveAutoSelection } = await import('../supabase/functions/_shared/autoSelection.mjs');
  assert.equal(followsCurrentPhase('faz3', 'faz3', 'all', null), true);
  assert.equal(followsCurrentPhase('faz3', 'faz3', 'latest', null), true);
  assert.equal(followsCurrentPhase('faz3', 'faz3', 'one', null), false);
  assert.equal(followsCurrentPhase('faz3', 'faz3', 'all', 'upper1'), false);
  assert.equal(followsCurrentPhase('faz2', 'faz3', 'all', null), false);
  const whole = { phaseId: 'faz3', programId: null, weekMode: 'all', weekNumber: 36, followCurrentPhase: true };
  assert.equal(resolveAutoSelection(whole, { id: 'faz4', startWeek: 50 }).phaseId, 'faz4');
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
  // The weekly note wraps centred inside its own column instead of spilling over.
  const notesRow = sheet.blocks[0].notesRow;
  const style = buildAutoSheetStyleRequests(1, sheet);
  const noteCells = style.find(request => request.repeatCell?.range.startRowIndex === notesRow
    && request.repeatCell.range.startColumnIndex === 2).repeatCell.cell.userEnteredFormat;
  assert.equal(noteCells.wrapStrategy, 'WRAP');
  assert.equal(noteCells.horizontalAlignment, 'CENTER');
  const noteHeight = rows => buildAutoSheetStyleRequests(1, { ...sheet, rows }).find(request =>
    request.updateDimensionProperties?.range.dimension === 'ROWS' && request.updateDimensionProperties.range.startIndex === notesRow)
    .updateDimensionProperties.properties.pixelSize;
  assert.equal(noteHeight(sheet.rows), 72);
  const longNote = sheet.rows.map((row, index) => index === notesRow ? [row[0], '', 'triceps biceps önce yaptım, sonra omuz ve en son karın bitirdim'] : row);
  assert.equal(noteHeight(longNote), 4 * 15 + 16);
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

test('automatic tabs colour each cell with the app comparison, not the first set alone', async () => {
  const { projectSheets } = await import('../supabase/functions/_shared/sheetProjection.mjs');
  const { buildAutoSheetStyleRequests } = await import('../supabase/functions/_shared/sheetStyle.mjs');
  const set = (weight, reps) => ({ weight, reps, intensity: 'failure' });
  const state = { currentWeek: 2, phases: [{ id: 'p', name: 'Faz 1', startWeek: 0, endWeek: null }],
    programVersions: [{ phaseId: 'p', fromWeek: 0, programs: [{ id: 'upper', name: 'Upper', order: 0,
      exercises: [{ id: 'fly', name: 'Pec Fly', isActive: true, defaultSets: 2 }, { id: 'curl', name: 'Curl', isActive: true, defaultSets: 1 }] }] }],
    weekLogs: [
      { programId: 'upper', weekNumber: 0, exercises: [{ exerciseId: 'fly', sets: [set(81, 8), set(81, 8)] }] },
      { programId: 'upper', weekNumber: 1, exercises: [{ exerciseId: 'fly', sets: [set(81, 8), set(81, 11)] }, { exerciseId: 'curl', sets: [set(15, 10)] }] },
    ] };
  const [sheet] = projectSheets(state);
  const fill = (row, col) => {
    const request = buildAutoSheetStyleRequests(1, sheet).find(item => item.repeatCell?.range.startRowIndex === row
      && item.repeatCell.range.startColumnIndex === col && item.repeatCell.range.endColumnIndex === col + 1);
    const rgb = request?.repeatCell.cell.userEnteredFormat.backgroundColorStyle.rgbColor;
    return rgb && [rgb.red, rgb.green, rgb.blue].map(value => Math.round(value * 255));
  };
  // Same first set, better second set: progress (the old rule painted it grey).
  assert.deepEqual(fill(2, 3), [220, 235, 215]);
  // Curl's first record comes at H1: it is the reference there.
  assert.deepEqual(fill(3, 3), [207, 226, 243]);
  // Nothing recorded: no fill.
  assert.equal(fill(3, 2), undefined);
});
