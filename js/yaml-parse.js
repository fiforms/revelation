// js/yaml-parse.js
// Purpose: single tolerant YAML parser for browser-side code (compiler, presentation list,
//   bootstrap, handout). js-yaml 5 `load()` throws on empty or comment-only input, so this
//   uses `loadAll()` (which yields [] there) and returns {} for "no document".
// Callers: markdown-compiler.js, presentationlist.js, presentation-bootstrap.js, handout.js.
// Gotcha: genuinely malformed YAML still throws; callers decide how to recover.
import * as yaml from 'js-yaml';

export function parseYamlOrEmpty(text) {
  const [data] = yaml.loadAll(String(text ?? ''));
  return data ?? {};
}
