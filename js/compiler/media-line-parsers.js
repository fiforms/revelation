/**
 * Media line parsers
 *
 * Recognizes media aliases, magic-image syntax, and plain markdown video
 * shorthands, then emits compiler operations for the slide compiler.
 */
export function createMediaLineParsers(context) {
  const {
    forHandout,
    media,
    prefersHigh,
    isHighVariantAvailable,
    applyOperations,
    magicImageHandlers,
    isVideoSource,
    ops
  } = context;

  const { appendLineOp, addAttributionOp } = ops;

  // Resolve inline `media:alias` references and emit attribution when the alias provides one.
  const resolveMediaAliasInLine = (line) => {
    const mediaAliasMatch = line.match(/[\(\"]media:([a-zA-Z0-9_-]+)[\)\"]/);
    let nextLine = line;
    let lastAttribution = null;

    if (mediaAliasMatch && forHandout) {
      return { line: nextLine, lastAttribution, skipLine: true };
    }

    if (mediaAliasMatch && media) {
      const alias = mediaAliasMatch[1];
      const item = media[alias];
      if (item?.filename) {
        let resolvedFile = item.filename;

        if (prefersHigh && isHighVariantAvailable(item)) {
          resolvedFile = item.large_variant.filename;
        }

        let basePath = '../_media/';
        if (typeof window !== 'undefined' && window.mediaPath) {
          basePath = window.mediaPath.endsWith('/') ? window.mediaPath : `${window.mediaPath}/`;
        }

        const resolvedSrc = `${basePath}${resolvedFile}`;
        nextLine = nextLine.replace(/\((media:[a-zA-Z0-9_-]+)\)/, `(${resolvedSrc})`);
        nextLine = nextLine.replace(/\"(media:[a-zA-Z0-9_-]+)\"/, `"${resolvedSrc}"`);
        if (item.attribution) {
          lastAttribution = `© ${item.attribution} (${item.license})`;
          applyOperations([addAttributionOp(lastAttribution)]);
        }
      }
    }

    return { line: nextLine, lastAttribution, skipLine: false };
  };

  // Parse REVELation magic-image syntax such as `![background](...)` or `![web:scrollx=120](...)`.
  const tryHandleMagicImageLine = (line, lastAttribution = null) => {
    const magicImageMatch = line.match(/^!\[([a-zA-Z0-9_-]+)(?::([^\]]+))?\]\((.+?)\)$/);
    if (!magicImageMatch) {
      return false;
    }

    const keyword = magicImageMatch[1].toLowerCase();
    const modifier = magicImageMatch[2]?.trim() || '';
    const src = magicImageMatch[3];
    if (forHandout && isVideoSource(src)) {
      return true;
    }
    if (forHandout && keyword === 'background') {
      return true;
    }

    const handler = magicImageHandlers[keyword];
    if (!handler) {
      return false;
    }

    applyOperations([appendLineOp(handler(src, modifier, lastAttribution))]);
    return true;
  };

  // Promote plain markdown video embeds into the compiler's canonical video output form.
  const tryHandlePlainMediaLine = (line) => {
    const plainMediaMatch = line.match(/^!\[(.*?)\]\((.+?)\)$/);
    if (!plainMediaMatch) {
      return false;
    }

    const altText = plainMediaMatch[1].trim();
    const src = plainMediaMatch[2].trim();
    if (forHandout && isVideoSource(src)) {
      return true;
    }
    if (!altText && /\.(webm|mp4|mov|m4v)(\?.*)?$/i.test(src)) {
      applyOperations([appendLineOp(`<video src="${src}" controls playsinline data-imagefit data-imagefit-autovideo></video>`)]);
      return true;
    }

    return false;
  };

  return {
    resolveMediaAliasInLine,
    tryHandleMagicImageLine,
    tryHandlePlainMediaLine
  };
}
