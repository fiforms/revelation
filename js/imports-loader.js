// js/imports-loader.js
// Purpose: resolve a deck's `imports:` front-matter key (a YAML file of shared `macros:` and `media:`)
//   and merge it into the deck. One implementation for the slideshow bootstrap and the handout.
// Callers: presentation-bootstrap.js, handout.js.
// Behaviour: the imports path is validated by resolveExternalFilePath (relative to the deck's folder,
//   no traversal); a failed fetch or parse is logged and skipped, never thrown. Imported macros are
//   written into `macros` and imported media into `metadata.media`, overriding same-named entries.
import { parseYamlOrEmpty } from './yaml-parse.js';
import { resolveExternalFilePath } from './compiler/compiler-utils.js';

const isPlainObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

export async function mergeImportedData({ metadata, markdownFile, macros }) {
  if (!metadata.imports || typeof metadata.imports !== 'string') return;
  try {
    const presentationDir = markdownFile.includes('/')
      ? markdownFile.substring(0, markdownFile.lastIndexOf('/'))
      : '';
    const externalPath = resolveExternalFilePath(metadata.imports, presentationDir);
    if (!externalPath) return;

    const res = await fetch(externalPath);
    if (!res.ok) {
      console.warn(`Failed to fetch imports file (${externalPath}): ${res.status}`);
      return;
    }
    const importsData = parseYamlOrEmpty(await res.text());
    if (!isPlainObject(importsData)) return;
    if (isPlainObject(importsData.macros)) Object.assign(macros, importsData.macros);
    if (isPlainObject(importsData.media)) {
      if (!metadata.media) metadata.media = {};
      Object.assign(metadata.media, importsData.media);
    }
  } catch (err) {
    console.warn(`Error loading imports:`, err);
  }
}
