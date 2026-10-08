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
  module._compile(compiled, filename);
  return module.exports;
}

const { platesPerSide } = loadTS('src/utils/plates.ts');

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
