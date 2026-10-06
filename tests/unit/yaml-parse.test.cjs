// Unit: js/yaml-parse.js tolerant parser (R1) — empty/comment-only YAML is {}, bad YAML still throws.
const test = require('node:test');
const assert = require('node:assert');

test('parseYamlOrEmpty: empty and comment-only input give {}; real data parses; bad YAML throws', async () => {
  const { parseYamlOrEmpty } = await import('../../js/yaml-parse.js');
  assert.deepStrictEqual(parseYamlOrEmpty(''), {});
  assert.deepStrictEqual(parseYamlOrEmpty('# just a comment'), {});
  assert.deepStrictEqual(parseYamlOrEmpty(undefined), {});
  assert.deepStrictEqual(parseYamlOrEmpty('title: Hi'), { title: 'Hi' });
  assert.throws(() => parseYamlOrEmpty('a: [unclosed'));
});

test('extractFrontMatter: empty front matter is not treated as malformed', async () => {
  const { extractFrontMatter } = await import('../../js/compiler/markdown-compiler.js');
  const { metadata, content } = extractFrontMatter('---\n# c\n---\nbody');
  assert.strictEqual(metadata._malformed, undefined);
  assert.strictEqual(content, 'body');
});
