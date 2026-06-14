/**
 * Compiler sanitization helpers
 *
 * These helpers sanitize markdown-embedded HTML and rendered HTML fragments
 * using the same safety rules for slideshow and handout output.
 */
const URL_ATTR_NAMES = new Set(['href', 'src', 'xlink:href', 'formaction', 'action', 'poster']);
const BLOCKED_TAGS = new Set(['script', 'object', 'embed', 'applet', 'base', 'meta']);

// Remove blocked tags (paired and self-closing/open forms) from a raw HTML
// string, repeating until the result stops changing. The repeat closes the
// "incomplete multi-character sanitization" gap where removing an inner match
// rejoins surrounding text into a fresh blocked tag, e.g.
// `<scri<script>pt>` -> `<script>`.
//
// SECURITY NOTE (human + automated reviewers): static analyzers flag the
// individual .replace() calls below as "incomplete multi-character
// sanitization" because one pass can leave a residual match. That is precisely
// why they run inside this do/while fixpoint loop: iteration continues until a
// full pass produces no change, so no residual blocked tag can survive. The
// codeql[...] markers acknowledge the per-line query; the loop is the
// mitigation. This regex layer is also only defense-in-depth — the
// authoritative guards are the page CSP (script-src 'self') and the DOM-based
// sanitizeElementTree() pass applied to rendered output.
function stripBlockedTags(input) {
  let source = String(input || '');
  let previous;
  do {
    previous = source;
    // codeql[js/incomplete-multi-character-sanitization] — bounded by the fixpoint loop (see SECURITY NOTE).
    source = source.replace(/<\s*(script|object|embed|applet|base|meta|style)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
    // codeql[js/incomplete-multi-character-sanitization] — bounded by the fixpoint loop (see SECURITY NOTE).
    source = source.replace(/<\s*(script|object|embed|applet|base|meta)\b[^>]*\/?\s*>/gi, '');
  } while (source !== previous);
  return source;
}

// Detect URL payloads that should never survive into generated markup.
export function isDangerousURL(value) {
  const normalized = String(value || '')
    .replace(/[\u0000-\u001F\u007F\s]+/g, '')
    .toLowerCase();
  return (
    normalized.startsWith('javascript:') ||
    normalized.startsWith('vbscript:') ||
    // Block all data: URLs (no legitimate use in presentations, all can be vectors)
    normalized.startsWith('data:')
  );
}

// Strip dangerous attributes (event handlers, srcdoc/srcset, and dangerous URL
// or style values) from a raw HTML string, repeating until the result stops
// changing. A single pass is not enough: removing one attribute can splice the
// surrounding text into a brand-new dangerous attribute, e.g.
// `onmouse onx="1"over=alert(1)` -> `onmouseover=alert(1)`.
// `sep` is a regex fragment matching one attribute-separator boundary (e.g.
// whitespace and `/`, optionally plus entity-encoded whitespace).
//
// SECURITY NOTE (human + automated reviewers): like stripBlockedTags above, the
// per-replace "incomplete multi-character sanitization" findings are mitigated
// by the surrounding do/while fixpoint loop — each .replace() is reapplied until
// a full pass yields no change, so the residual-reassembly bypass shown in the
// example cannot survive. The codeql[...] markers acknowledge the per-line
// query. This layer remains defense-in-depth behind the CSP and the DOM-based
// sanitizeElementTree() pass.
function stripDangerousAttributes(input, sep) {
  let source = String(input || '');
  const onRe = new RegExp(`${sep}on[a-z0-9_-]+\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+)`, 'gi');
  const srcdocRe = new RegExp(`${sep}srcdoc\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+)`, 'gi');
  const srcsetRe = new RegExp(`${sep}srcset\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+)`, 'gi');
  const urlRe = new RegExp(`${sep}(href|src|xlink:href|formaction|action|poster)\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'gi');
  const styleRe = new RegExp(`${sep}style\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'gi');

  let previous;
  do {
    previous = source;
    // codeql[js/incomplete-multi-character-sanitization] — bounded by the fixpoint loop (see SECURITY NOTE).
    source = source.replace(onRe, '');
    // codeql[js/incomplete-multi-character-sanitization] — bounded by the fixpoint loop (see SECURITY NOTE).
    source = source.replace(srcdocRe, '');
    // codeql[js/incomplete-multi-character-sanitization] — bounded by the fixpoint loop (see SECURITY NOTE).
    source = source.replace(srcsetRe, '');
    // codeql[js/incomplete-multi-character-sanitization] — bounded by the fixpoint loop (see SECURITY NOTE).
    source = source.replace(urlRe, (fullMatch, attrName, fullValue, dqValue, sqValue, bareValue) => {
      const rawValue = dqValue ?? sqValue ?? bareValue ?? '';
      return isDangerousURL(rawValue) ? '' : ` ${attrName}=${fullValue}`;
    });
    // codeql[js/incomplete-multi-character-sanitization] — bounded by the fixpoint loop (see SECURITY NOTE).
    source = source.replace(styleRe, (fullMatch, fullValue, dqValue, sqValue, bareValue) => {
      const rawValue = dqValue ?? sqValue ?? bareValue ?? '';
      return /expression\s*\(|url\s*\(\s*['"]?\s*javascript:|@import/i.test(rawValue) ? '' : ` style=${fullValue}`;
    });
  } while (source !== previous);
  return source;
}

// Regex-based fallback for non-DOM environments such as the Node test harness.
// This path exists to keep tests and other non-browser tooling functional, not
// to provide security-equivalent sanitization. Do not rely on it as a robust
// HTML sanitizer; the DOM-based path below is the primary implementation.
function sanitizeHTMLFragmentFallback(html) {
  let source = String(html || '');

  // Remove entirely blocked tags and their contents. Run repeatedly until the
  // output stabilizes so a removed inner tag cannot re-form an outer one (e.g.
  // `<scr<script>ipt>` collapsing back into `<script>`).
  source = stripBlockedTags(source);

  // Strip dangerous attributes (loops until stable). HTML accepts whitespace OR
  // `/` between attributes, so both count as a separator boundary; otherwise
  // `<svg/onload=...>` slips past these strippers.
  source = stripDangerousAttributes(source, '[\\s/]');

  // Force `rel` hardening on links that open a new browsing context.
  source = source.replace(
    /<a\b([^>]*)>/gi,
    (fullMatch, attrs) => {
      const targetMatch = attrs.match(/\btarget\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const relMatch = attrs.match(/\brel\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const target = (targetMatch?.[2] ?? targetMatch?.[3] ?? targetMatch?.[4] ?? '').toLowerCase();

      if (target !== '_blank') {
        return `<a${attrs}>`;
      }

      const relParts = new Set(
        String(relMatch?.[2] ?? relMatch?.[3] ?? relMatch?.[4] ?? '')
          .split(/\s+/)
          .filter(Boolean)
          .map((part) => part.toLowerCase())
      );
      relParts.add('noopener');
      relParts.add('noreferrer');
      const relValue = Array.from(relParts).join(' ');

      if (relMatch) {
        return `<a${attrs.replace(relMatch[0], `rel="${relValue}"`)}>`;
      }

      return `<a${attrs} rel="${relValue}">`;
    }
  );

  return source;
}

// Sanitize a single parsed/live element in place: drop blocked tags entirely,
// strip event handlers and dangerous URL/style attributes, and harden links.
function sanitizeElement(el) {
  const tagName = el.tagName.toLowerCase();
  if (BLOCKED_TAGS.has(tagName)) {
    el.remove();
    console.log(`Removed blocked <${tagName}> element from HTML fragment.`);
    return;
  }

  // Walk every attribute on every parsed element and drop dangerous payloads.
  const attrs = Array.from(el.attributes || []);
  for (const attr of attrs) {
    const name = attr.name.toLowerCase();
    const value = attr.value;

    if (name.startsWith('on') || name === 'srcdoc') {
      el.removeAttribute(attr.name);
      console.log(`Removed blocked ${name} attribute from <${tagName}> element.`);
      continue;
    }

    if (URL_ATTR_NAMES.has(name) && isDangerousURL(value)) {
      el.removeAttribute(attr.name);
      console.log(`Removed dangerous URL in ${name} attribute from <${tagName}> element.`);
      continue;
    }

    if (
      name === 'style' &&
      /expression\s*\(|url\s*\(\s*['"]?\s*javascript:|@import/i.test(String(value || ''))
    ) {
      el.removeAttribute(attr.name);
      console.log(`Removed dangerous style content from <${tagName}> element.`);
    }
  }

  if (tagName === 'a' && String(el.getAttribute('target') || '').toLowerCase() === '_blank') {
    // Opening a new tab/window requires `rel` hardening to avoid tabnabbing.
    const currentRel = String(el.getAttribute('rel') || '');
    const relSet = new Set(currentRel.split(/\s+/).filter(Boolean).map((part) => part.toLowerCase()));
    relSet.add('noopener');
    relSet.add('noreferrer');
    el.setAttribute('rel', Array.from(relSet).join(' '));
  }
}

// Sanitize every descendant element of a parsed fragment or live DOM subtree in
// place. Exported so callers can re-sanitize markup that a third party rendered
// straight into the document (e.g. Reveal's markdown plugin), where regex
// pre-sanitization is not the last line of defense.
export function sanitizeElementTree(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return root;
  for (const el of root.querySelectorAll('*')) {
    sanitizeElement(el);
  }
  return root;
}

// Primary sanitizer used when browser APIs are available. This relies on the
// browser's HTML parser so sanitization runs against parsed elements and
// normalized attributes instead of raw text.
function sanitizeHTMLFragment(html) {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return sanitizeHTMLFragmentFallback(html);
  }

  // Parse as inert template content so we can inspect normalized nodes without
  // executing the markup.
  const template = document.createElement('template');
  template.innerHTML = String(html || '');
  sanitizeElementTree(template.content);

  return template.innerHTML;
}

// Sanitize raw HTML embedded in markdown before markdown rendering occurs.
// This uses regex-based sanitization on raw HTML text to remove dangerous elements
// and attributes before the markdown engine renders it. It handles HTML entity
// bypasses by matching entity representations of whitespace.
export function sanitizeMarkdownEmbeddedHTML(markdown) {
  let source = String(markdown || '');

  // Remove entirely blocked tags and their contents (repeats until stable).
  source = stripBlockedTags(source);

  // Match an attribute-separator boundary: whitespace, `/` (a valid HTML
  // attribute separator, so `<svg/onload=...>` must be caught), OR HTML entity
  // representations of whitespace (catches entity-space bypasses like
  // `<img&#32;onerror>`).
  const wsPattern = '(?:\\s|/|&#(?:32|x20);|&nbsp;|&tab;|&#(?:9|xa|xd);)';

  // Strip event handlers, srcdoc/srcset, and dangerous URL/style attributes,
  // repeating until stable so a removed attribute cannot splice surrounding
  // text into a new one.
  source = stripDangerousAttributes(source, wsPattern);

  if(source !== markdown) {
    console.log('Sanitized potentially dangerous markdown to remove dangerous content.');
  }

  return source;
}

// Sanitize final rendered HTML fragments before they are inserted into output.
export function sanitizeRenderedHTML(html) {
  return sanitizeHTMLFragment(html);
}
