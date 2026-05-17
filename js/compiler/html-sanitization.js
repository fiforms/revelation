/**
 * Compiler sanitization helpers
 *
 * These helpers sanitize markdown-embedded HTML and rendered HTML fragments
 * using the same safety rules for slideshow and handout output.
 */
const URL_ATTR_NAMES = new Set(['href', 'src', 'xlink:href', 'formaction', 'action', 'poster']);
const BLOCKED_TAGS = new Set(['script', 'object', 'embed', 'applet', 'base', 'meta']);

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

// Regex-based fallback for non-DOM environments such as the Node test harness.
// This path exists to keep tests and other non-browser tooling functional, not
// to provide security-equivalent sanitization. Do not rely on it as a robust
// HTML sanitizer; the DOM-based path below is the primary implementation.
function sanitizeHTMLFragmentFallback(html) {
  let source = String(html || '');

  // Remove entirely blocked tags and their contents
  source = source.replace(/<\s*(script|object|embed|applet|base|meta|style)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  source = source.replace(/<\s*(script|object|embed|applet|base|meta)\b[^>]*\/?\s*>/gi, '');

  // Strip event handlers
  source = source.replace(/\son[a-z0-9_-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  source = source.replace(/\ssrcdoc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  source = source.replace(/\ssrcset\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // Strip dangerous URL attributes
  source = source.replace(
    /\s(href|src|xlink:href|formaction|action|poster)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (fullMatch, attrName, fullValue, dqValue, sqValue, bareValue) => {
      const rawValue = dqValue ?? sqValue ?? bareValue ?? '';
      return isDangerousURL(rawValue) ? '' : ` ${attrName}=${fullValue}`;
    }
  );

  // Strip dangerous styles
  source = source.replace(
    /\sstyle\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (fullMatch, fullValue, dqValue, sqValue, bareValue) => {
      const rawValue = dqValue ?? sqValue ?? bareValue ?? '';
      return /expression\s*\(|url\s*\(\s*['"]?\s*javascript:|@import/i.test(rawValue) ? '' : ` style=${fullValue}`;
    }
  );

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
  const elements = template.content.querySelectorAll('*');

  for (const el of elements) {
    const tagName = el.tagName.toLowerCase();
    if (BLOCKED_TAGS.has(tagName)) {
      el.remove();
      console.log(`Removed blocked <${tagName}> element from HTML fragment.`);
      continue;
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

  return template.innerHTML;
}

// Sanitize raw HTML embedded in markdown before markdown rendering occurs.
// This uses regex-based sanitization on raw HTML text to remove dangerous elements
// and attributes before the markdown engine renders it. It handles HTML entity
// bypasses by matching entity representations of whitespace.
export function sanitizeMarkdownEmbeddedHTML(markdown) {
  let source = String(markdown || '');

  // Remove entirely blocked tags and their contents
  source = source.replace(/<\s*(script|object|embed|applet|base|meta|style)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  source = source.replace(/<\s*(script|object|embed|applet|base|meta)\b[^>]*\/?\s*>/gi, '');

  // Helper to create a regex that matches whitespace OR HTML entity representations of whitespace
  // This catches entity-space bypasses like <img&#32;onerror>
  const wsPattern = '(?:\\s|&#(?:32|x20);|&nbsp;|&tab;|&#(?:9|xa|xd);)';

  // Strip event handlers preceded by whitespace (normal or entity-encoded)
  source = source.replace(new RegExp(`${wsPattern}on[a-z0-9_-]+\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+)`, 'gi'), '');

  // Strip srcdoc attributes
  source = source.replace(new RegExp(`${wsPattern}srcdoc\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+)`, 'gi'), '');

  // Strip srcset attributes
  source = source.replace(new RegExp(`${wsPattern}srcset\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+)`, 'gi'), '');

  // Strip URL attributes with dangerous protocols
  source = source.replace(
    new RegExp(`${wsPattern}(href|src|xlink:href|formaction|action|poster)\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'gi'),
    (fullMatch, attrName, fullValue, dqValue, sqValue, bareValue) => {
      const rawValue = dqValue ?? sqValue ?? bareValue ?? '';
      return isDangerousURL(rawValue) ? '' : ` ${attrName}=${fullValue}`;
    }
  );

  // Strip style attributes with dangerous content
  source = source.replace(
    new RegExp(`${wsPattern}style\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'gi'),
    (fullMatch, fullValue, dqValue, sqValue, bareValue) => {
      const rawValue = dqValue ?? sqValue ?? bareValue ?? '';
      return /expression\s*\(|url\s*\(\s*['"]?\s*javascript:|@import/i.test(rawValue) ? '' : ` style=${fullValue}`;
    }
  );

  if(source !== markdown) {
    console.log('Sanitized potentially dangerous markdown to remove dangerous content.');
  }

  return source;
}

// Sanitize final rendered HTML fragments before they are inserted into output.
export function sanitizeRenderedHTML(html) {
  return sanitizeHTMLFragment(html);
}
