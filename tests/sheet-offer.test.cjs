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

const { sheetOffer } = loadTS('src/utils/sheetOffer.ts');

const base = { known: true, status: null, skipped: false, savedWorkouts: 1, inWorkout: false };

test('offered once there is a saved workout and no Sheet', () => {
  assert.equal(sheetOffer(base), 'offer');
});

test('a new person is never asked before their first workout', () => {
  assert.equal(sheetOffer({ ...base, savedWorkouts: 0 }), 'none');
});

test('never in the middle of a workout or the first-run guide', () => {
  assert.equal(sheetOffer({ ...base, inWorkout: true }), 'none');
});

test('not while the connection is unknown, connected, or after "not now"', () => {
  assert.equal(sheetOffer({ ...base, known: false }), 'none');
  assert.equal(sheetOffer({ ...base, status: 'active' }), 'none');
  assert.equal(sheetOffer({ ...base, skipped: true }), 'none');
});

test('a lapsed grant still gets the renewal notice, even mid-workout', () => {
  assert.equal(sheetOffer({ ...base, status: 'reauthorize', inWorkout: true, savedWorkouts: 0 }), 'renew');
});
