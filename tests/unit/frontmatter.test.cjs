// Unit: js/frontmatter.js (shared browser front-matter split/parse) and js/imports-loader.js.
const test = require('node:test');
const assert = require('node:assert');

const load = () => import('../../js/frontmatter.js');
const loadYaml = async () => (await import('../../js/yaml-parse.js')).parseYamlOrEmpty;

test('splitFrontMatter: block + body reassemble the text, LF and CRLF', async () => {
  const { splitFrontMatter } = await load();
  for (const nl of ['\n', '\r\n']) {
    const text = `---${nl}title: Hi${nl}---${nl}# Slide${nl}`;
    const out = splitFrontMatter(text);
    assert.ok(out.hasFrontMatter);
    assert.strictEqual(out.yamlText, 'title: Hi');
    assert.strictEqual(out.block + out.body, text);
  }
  const none = splitFrontMatter('# Slide\n---\nx: 1\n---\n');
  assert.strictEqual(none.hasFrontMatter, false);
  assert.strictEqual(splitFrontMatter(null).body, '');
});

test('parseFrontMatter: data is always an object; malformed is flagged; "---" in a value is fine', async () => {
  const { parseFrontMatter } = await load();
  const parseYaml = await loadYaml();
  assert.deepStrictEqual(parseFrontMatter('---\ntitle: Hi\n---\nbody', parseYaml).data, { title: 'Hi' });
  assert.deepStrictEqual(parseFrontMatter('---\n# comment\n---\nbody', parseYaml).data, {});
  assert.deepStrictEqual(parseFrontMatter('---\n- a\n---\nbody', parseYaml).data, {});
  assert.strictEqual(parseFrontMatter('---\ntitle: a --- b\n---\nx', parseYaml).data.title, 'a --- b');
  const bad = parseFrontMatter('---\na: [unclosed\n---\nbody', parseYaml);
  assert.strictEqual(bad.malformed, true);
  assert.strictEqual(bad.body, 'body');
  assert.throws(() => parseFrontMatter('x'), TypeError);
});

test('extractFrontMatter keeps its malformed-YAML placeholder', async () => {
  const { extractFrontMatter } = await import('../../js/compiler/markdown-compiler.js');
  const err = console.error; console.error = () => {};
  try {
    const out = extractFrontMatter('---\na: [unclosed\n---\nbody');
    assert.strictEqual(out.metadata._malformed, true);
    assert.strictEqual(out.metadata.title, '{malformed YAML}');
    assert.strictEqual(out.content, 'body');
  } finally { console.error = err; }
});

test('mergeImportedData: merges imported macros and media; skips bad paths and failed fetches', async () => {
  const { mergeImportedData } = await import('../../js/imports-loader.js');
  const realFetch = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (url) => {
    asked.push(url);
    return { ok: true, status: 200, text: async () => 'macros:\n  m: one\nmedia:\n  pic:\n    filename: p.png\n' };
  };
  const warn = console.warn; console.warn = () => {};
  try {
    const metadata = { imports: 'shared.yaml', media: { own: { filename: 'o.png' } } };
    const macros = {};
    await mergeImportedData({ metadata, markdownFile: 'deck/presentation.md', macros });
    assert.deepStrictEqual(asked, ['deck/shared.yaml']);
    assert.deepStrictEqual(macros, { m: 'one' });
    assert.deepStrictEqual(Object.keys(metadata.media).sort(), ['own', 'pic']);

    asked.length = 0;
    await mergeImportedData({ metadata: { imports: '../escape.yaml' }, markdownFile: 'deck/p.md', macros: {} });
    assert.deepStrictEqual(asked, []);

    globalThis.fetch = async () => ({ ok: false, status: 404 });
    const m2 = {};
    await mergeImportedData({ metadata: { imports: 'x.yaml' }, markdownFile: 'p.md', macros: m2 });
    assert.deepStrictEqual(m2, {});
  } finally { globalThis.fetch = realFetch; console.warn = warn; }
});
