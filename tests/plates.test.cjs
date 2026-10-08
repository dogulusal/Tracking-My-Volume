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

const { platesPerSide } = loadTS('src/utils/plates.ts');
const { appReducer, initialState } = loadTS('src/context/appReducer.ts');

test('each side gets the heaviest plates first', () => {
  assert.deepEqual(platesPerSide(100, 20), { plates: [25, 15], missing: 0 });
  assert.deepEqual(platesPerSide(142.5, 20), { plates: [25, 25, 10, 1.25], missing: 0 });
  assert.deepEqual(platesPerSide(60, 15), { plates: [20, 2.5], missing: 0 });
});

test('a total the plates cannot make says how much is missing', () => {
  assert.deepEqual(platesPerSide(101, 20), { plates: [25, 15], missing: 1 });
});

test('nothing to load at or under the bar', () => {
  assert.equal(platesPerSide(20, 20), null);
  assert.equal(platesPerSide(0, 20), null);
});

test('a gym without some plates', () => {
  assert.deepEqual(platesPerSide(100, 20, [20, 10, 5, 2.5]), { plates: [20, 20], missing: 0 });
});

test('the fewest plates, not simply the heaviest first', () => {
  // Without 15s: 20 + 20 on each side, not 25 + 10 + 5.
  assert.deepEqual(platesPerSide(100, 20, [25, 20, 10, 5, 2.5, 1.25]), { plates: [20, 20], missing: 0 });
  assert.deepEqual(platesPerSide(61, 20, [25, 20, 15, 10, 5, 2.5, 1.25, 0.5]), { plates: [20, 0.5], missing: 0 });
});

test("the gym's plates are kept heaviest first, and the standard set is stored as nothing", () => {
  const set = appReducer({ ...initialState }, { type: 'SET_PLATES', payload: [2.5, 20, 10, 5] });
  assert.deepEqual(set.plates, [20, 10, 5, 2.5]);
  assert.equal('plates' in appReducer(set, { type: 'SET_PLATES', payload: null }), false);
});
