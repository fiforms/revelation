// Unit: js/compiler/compiler-utils.js isSafeMarkdownPath / sanitizeMarkdownFilename — the one rule
// for relative markdown paths (replaces the SAFE_MD_LINK_RE copies in presentations.js and handout.js).
const test = require('node:test');
const assert = require('node:assert');

test('isSafeMarkdownPath accepts plain relative .md paths and rejects traversal', async () => {
  const { isSafeMarkdownPath } = await import('../../js/compiler/compiler-utils.js');
  for (const ok of ['a.md', './a.md', 'sub/a-b_c.md', 'a/b/c.MD', 'my.deck.md']) assert.ok(isSafeMarkdownPath(ok), ok);
  const bad = ['', '.md/', '../a.md', 'a/../b.md', 'a/./b.md', '/a.md', './../a.md', 'a//b.md', 'a\\b.md', 'a.md?x=1',
    'a.md#h', 'a.txt', 'a b.md', null, undefined, 5];
  for (const value of bad) assert.ok(!isSafeMarkdownPath(value), String(value));
});

test('sanitizeMarkdownFilename strips query/hash and "./", and blocks everything isSafeMarkdownPath blocks', async () => {
  const { sanitizeMarkdownFilename } = await import('../../js/compiler/compiler-utils.js');
  const warn = console.warn; console.warn = () => {};
  try {
    assert.strictEqual(sanitizeMarkdownFilename('./a.md?x=1#h'), 'a.md');
    assert.strictEqual(sanitizeMarkdownFilename('sub\\a.md'), 'sub/a.md');
    assert.strictEqual(sanitizeMarkdownFilename('../a.md'), null);
    assert.strictEqual(sanitizeMarkdownFilename('a/./b.md'), null);
    assert.strictEqual(sanitizeMarkdownFilename('a.txt'), null);
    assert.strictEqual(sanitizeMarkdownFilename(''), null);
  } finally { console.warn = warn; }
});
