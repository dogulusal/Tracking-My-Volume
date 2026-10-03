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

const { searchMovements, MOVEMENT_LIBRARY } = loadTS('src/data/movementLibrary.ts');

test('own movements come first and are not repeated from the library', () => {
  const result = searchMovements('press', ['Bench Press', 'Lateral Ön']);
  assert.deepEqual(result.own, ['Bench Press']);
  assert.ok(!result.library.includes('Bench Press'));
  assert.ok(result.library.includes('Leg Press'));
});

test('every word of the query has to appear, in any case and either i', () => {
  const result = searchMovements('İNCLİNE db', [], 20);
  assert.deepEqual(result.library, []);
  const words = searchMovements('incline press', [], 20).library;
  assert.deepEqual(words, ['Incline Bench Press', 'Incline Dumbbell Press']);
});

test('an empty query lists own movements, then the library up to the limit', () => {
  const result = searchMovements('', ['Smith Machine', 'smith machine'], 5);
  assert.deepEqual(result.own, ['Smith Machine']);
  assert.equal(result.library.length, 4);
  assert.equal(result.library[0], MOVEMENT_LIBRARY[0]);
});
