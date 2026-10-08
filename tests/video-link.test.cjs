const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const Module = require('node:module');

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

const { videoLink } = loadTS('src/utils/videoLink.ts');

test('a typed web address is kept, one without its scheme gets https', () => {
  assert.equal(videoLink('https://www.youtube.com/watch?v=abc'), 'https://www.youtube.com/watch?v=abc');
  assert.equal(videoLink('  youtu.be/abc  '), 'https://youtu.be/abc');
  assert.equal(videoLink('http://example.com/bench'), 'http://example.com/bench');
});

test('an empty field clears the link', () => {
  assert.equal(videoLink('   '), '');
});

test('only web links are accepted', () => {
  assert.equal(videoLink('javascript:alert(1)'), null);
  assert.equal(videoLink('data:text/html,hi'), null);
  assert.equal(videoLink('bench press'), null);
  assert.equal(videoLink('ftp://example.com/x'), null);
});
