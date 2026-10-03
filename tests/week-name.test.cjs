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

const { onlyFirstPhase, weekName, weekLabel } = loadTS('src/utils/phases.ts');
const { initialState } = loadTS('src/context/appReducer.ts');

const two = [
  { id: 'a', name: 'Faz 1', startWeek: 0, endWeek: 14 },
  { id: 'b', name: 'Faz 2', startWeek: 15, endWeek: null },
];

test('weeks are simply counted while only the first phase has begun', () => {
  assert.equal(onlyFirstPhase(two, 14), true);
  assert.equal(weekName(two, 0, 14), '1. hafta');
  assert.equal(weekName(two, 6, 14), '7. hafta');
});

test('once a second phase begins, weeks are named by phase as before', () => {
  assert.equal(onlyFirstPhase(two, 15), false);
  assert.equal(weekName(two, 15, 15), 'Faz 2 · H0');
  assert.equal(weekName(two, 3, 15), 'Faz 1 · H3');
});

test('the grid keeps its own label', () => {
  assert.equal(weekLabel(two, 16), 'Faz 2 H1');
});

test('a new person starts with one open-ended phase', () => {
  assert.equal(initialState.phases.length, 1);
  assert.equal(initialState.phases[0].endWeek, null);
  assert.equal(weekName(initialState.phases, 40, 40), '41. hafta');
});
