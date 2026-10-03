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

const { muscleRegions } = loadTS('src/data/muscleRegions.ts');
const { MOVEMENT_LIBRARY } = loadTS('src/data/movementLibrary.ts');
const main = name => muscleRegions(name)[0];

test('the three heads of the shoulder are told apart, also in Turkish names', () => {
  assert.equal(main('Lateral Raise'), 'Yan omuz');
  assert.equal(main('Lateral Ön'), 'Ön omuz');
  assert.equal(main('Lateral Arka'), 'Arka omuz');
  assert.equal(main('Face Pull'), 'Arka omuz');
  assert.equal(main('Front Raise'), 'Ön omuz');
  assert.equal(main('Shoulder Press'), 'Ön omuz');
});

test('specific words win over the general ones they contain', () => {
  assert.equal(main('Leg Curl'), 'Arka bacak');
  assert.equal(main('Incline Dumbbell Curl'), 'Biceps');
  assert.equal(main('Incline Dumbbell Press'), 'Üst göğüs');
  assert.equal(main('Leg Press'), 'Ön bacak');
  assert.equal(main('Leg Extension'), 'Ön bacak');
  assert.equal(main('Cable Crunch'), 'Karın');
  assert.equal(main('Close Grip Bench Press'), 'Triceps');
  assert.equal(main('Romanian Deadlift'), 'Arka bacak');
  assert.equal(main('Lat Pulldown'), 'Kanat');
  assert.equal(main('T Bar Row'), 'Orta sırt');
  assert.equal(main('Hammer Curl'), 'Biceps');
});

test('a name that says nothing has no region, unless one was chosen', () => {
  assert.deepEqual(muscleRegions('Smith Machine'), []);
  assert.deepEqual(muscleRegions('Smith Machine', 'Göğüs'), ['Göğüs']);
  assert.deepEqual(muscleRegions('Smith Machine', 'nonsense'), []);
});

test('every movement in the library has a region', () => {
  const missing = MOVEMENT_LIBRARY.filter(name => muscleRegions(name).length === 0);
  assert.deepEqual(missing, []);
});
