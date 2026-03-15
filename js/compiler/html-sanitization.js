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
    normalized.startsWith('data:text/html') ||
    normalized.startsWith('data:application/javascript')
  );
}

// Fallback sanitizer for non-DOM environments such as tests.
function sanitizeHTMLFragmentFallback(html) {
  let source = sanitizeMarkdownEmbeddedHTML(String(html || ''));

  source = source.replace(/<\s*(script|object|embed|applet|base|meta)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  source = source.replace(/<\s*(script|object|embed|applet|base|meta)\b[^>]*\/?\s*>/gi, '');

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

// DOM-based sanitizer used when browser APIs are available.
function sanitizeHTMLFragment(html) {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return sanitizeHTMLFragmentFallback(html);
  }

  const template = document.createElement('template');
  template.innerHTML = String(html || '');
  const elements = template.content.querySelectorAll('*');

  for (const el of elements) {
    const tagName = el.tagName.toLowerCase();
    if (BLOCKED_TAGS.has(tagName)) {
      el.remove();
      continue;
    }

    const attrs = Array.from(el.attributes || []);
    for (const attr of attrs) {
      const name = attr.name.toLowerCase();
      const value = attr.value;

      if (name.startsWith('on') || name === 'srcdoc') {
        el.removeAttribute(attr.name);
        continue;
      }

      if (URL_ATTR_NAMES.has(name) && isDangerousURL(value)) {
        el.removeAttribute(attr.name);
        continue;
      }

      if (
        name === 'style' &&
        /expression\s*\(|url\s*\(\s*['"]?\s*javascript:|@import/i.test(String(value || ''))
      ) {
        el.removeAttribute(attr.name);
      }
    }

    if (tagName === 'a' && String(el.getAttribute('target') || '').toLowerCase() === '_blank') {
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
export function sanitizeMarkdownEmbeddedHTML(markdown) {
  let source = String(markdown || '');

  source = source.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');
  source = source.replace(/\son[a-z0-9_-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  source = source.replace(/\ssrcdoc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  source = source.replace(
    /\s(href|src|xlink:href|formaction|action|poster)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (fullMatch, attrName, fullValue, dqValue, sqValue, bareValue) => {
      const rawValue = dqValue ?? sqValue ?? bareValue ?? '';
      if (isDangerousURL(rawValue)) {
        return '';
      }
      return ` ${attrName}=${fullValue}`;
    }
  );

  source = source.replace(
    /\sstyle\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (fullMatch, fullValue, dqValue, sqValue, bareValue) => {
      const rawValue = dqValue ?? sqValue ?? bareValue ?? '';
      if (/expression\s*\(|url\s*\(\s*['"]?\s*javascript:|@import/i.test(rawValue)) {
        return '';
      }
      return ` style=${fullValue}`;
    }
  );

  return source;
}

// Sanitize final rendered HTML fragments before they are inserted into output.
export function sanitizeRenderedHTML(html) {
  return sanitizeHTMLFragment(html);
}
