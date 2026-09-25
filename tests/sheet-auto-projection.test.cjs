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
