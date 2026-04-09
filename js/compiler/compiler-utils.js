/**
 * Shared compiler utilities
 *
 * Small helpers used by both compiler and runtime layers when the logic is not
 * itself responsible for parsing, rendering, or DOM mutation.
 */
const NOTE_SEPARATOR_LEGACY = 'Note:';
const NOTE_SEPARATOR_CURRENT = ':note:';
const NOTE_VERSION_BREAKPOINT = [0, 2, 6];

// Each entry says: presentations saved before `breakpoint` should load themes
// from `folder` rather than from the current build.  Entries must be ordered
// from oldest breakpoint to newest; the first entry whose breakpoint exceeds the
// presentation version wins.  Add a new row here whenever a reveal.js upgrade
// changes compiled CSS defaults in a way that would alter existing presentations.
const CSS_VERSION_SNAPSHOTS = [
  { folder: '1.0.6', breakpoint: [1, 0, 7] },
  // { folder: '1.1.0', breakpoint: [1, 1, 1] },
];

// Parse a simple `major.minor.patch` semver string into a numeric tuple.
function parseSemverTuple(version) {
  const raw = String(version || '').trim();
  const match = raw.match(/^v?(\d+)\.(\d+)\.(\d+)/i);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

// Compare semver tuples so note-separator cutoffs can be expressed declaratively.
function compareVersionTuples(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return 0;
  for (let i = 0; i < 3; i += 1) {
    const av = Number(a[i] || 0);
    const bv = Number(b[i] || 0);
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

// Read storage defensively so browser privacy/sandbox failures do not break rendering.
export function getStorageItemSafe(key) {
  try {
    return window.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

// Return the name of the frozen CSS snapshot folder to use for this deck, or
// null if the current build's CSS should be used.  Presentations with no version
// field are treated as older than every snapshot breakpoint.
export function resolveLegacyCssFolder(metadata = {}) {
  const tuple = parseSemverTuple(metadata?.version);
  for (const { folder, breakpoint } of CSS_VERSION_SNAPSHOTS) {
    if (!tuple || compareVersionTuples(tuple, breakpoint) < 0) return folder;
  }
  return null;
}

// Determine whether deck metadata should opt into the modern `:note:` separator.
export function usesNewNoteSeparator(metadata = {}) {
  const tuple = parseSemverTuple(metadata?.version);
  if (!tuple) return false;
  return compareVersionTuples(tuple, NOTE_VERSION_BREAKPOINT) > 0;
}

// Resolve the note separator that Reveal should treat as speaker-note content.
export function getNoteSeparator(metadata = {}) {
  return usesNewNoteSeparator(metadata) ? NOTE_SEPARATOR_CURRENT : NOTE_SEPARATOR_LEGACY;
}

// Accept only safe relative markdown filenames when decks reference other decks by path.
export function sanitizeMarkdownFilename(filename) {
  const raw = String(filename || '').trim();
  if (!raw) return null;

  const pathOnly = raw.split('?')[0].split('#')[0].replace(/\\/g, '/');
  const normalized = pathOnly.startsWith('./') ? pathOnly.slice(2) : pathOnly;
  if (!normalized || normalized.startsWith('/')) {
    console.warn(`Blocked invalid markdown filename: ${filename}`);
    return null;
  }

  const segments = normalized.split('/');
  const validSegment = /^[a-zA-Z0-9_.-]+$/;
  if (
    segments.some((segment) => !segment || segment === '.' || segment === '..' || !validSegment.test(segment))
  ) {
    console.warn(`Blocked invalid markdown filename: ${filename}`);
    return null;
  }

  const leaf = segments[segments.length - 1] || '';
  if (!/\.md$/i.test(leaf)) {
    console.warn(`Blocked invalid markdown filename: ${filename}`);
    return null;
  }

  return segments.join('/');
}

export {
  NOTE_SEPARATOR_CURRENT,
  NOTE_SEPARATOR_LEGACY
};
