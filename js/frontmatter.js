// js/frontmatter.js
// Purpose: the one browser-side place that splits a markdown file into YAML front matter and body.
//   Pure ESM with no imports, so pages that bundle js-yaml (compiler, presentation list), admin
//   pages that use the global `jsyaml`, and Node tests can all use it; the caller passes its own
//   YAML parser.
// API:
//   splitFrontMatter(text) -> { hasFrontMatter, yamlText, block, body }
//       `block` is the exact text consumed (opening fence through closing fence and one newline),
//       so text === block + body. No front matter: block '', body === text.
//   parseFrontMatter(text, parseYaml) -> { data, body, hasFrontMatter, malformed, error }
//       `parseYaml(yamlText)` must return the parsed document ({} for an empty one) and may throw.
//       `data` is always a plain object; malformed YAML sets `malformed`/`error` instead of throwing.
// Rules: CRLF or LF; the opening fence must be the first line; the closing fence is the first later
//   line that starts with `---`.
// Twins: lib/frontMatter.js (wrapper main process) and server/presentation-index.js
//   readFrontMatterData() (Node) are CommonJS and can't import this file. They must keep the same
//   regex; tests/frontMatter.test.js in the wrapper cross-checks lib/frontMatter.js against this file.
const FRONT_MATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function splitFrontMatter(text) {
  const raw = String(text ?? '');
  const match = raw.match(FRONT_MATTER_RE);
  if (!match) return { hasFrontMatter: false, yamlText: '', block: '', body: raw };
  return { hasFrontMatter: true, yamlText: match[1], block: match[0], body: raw.slice(match[0].length) };
}

export function parseFrontMatter(text, parseYaml) {
  if (typeof parseYaml !== 'function') throw new TypeError('parseFrontMatter needs a YAML parse function');
  const { hasFrontMatter, yamlText, body } = splitFrontMatter(text);
  const result = { data: {}, body, hasFrontMatter, malformed: false, error: null };
  if (!hasFrontMatter) return result;
  try {
    const parsed = parseYaml(yamlText);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) result.data = parsed;
  } catch (err) {
    result.malformed = true;
    result.error = err;
  }
  return result;
}
