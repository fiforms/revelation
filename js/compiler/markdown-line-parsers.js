/**
 * Markdown line parsers
 *
 * Recognizes non-media REVELation line syntax and emits compiler operations
 * instead of mutating slide state directly.
 */
export function createMarkdownLineParsers(context) {
  const {
    macros,
    forHandout,
    showHiddenSlidesInPreview,
    slideLocalSuppressions,
    parseHideTarget,
    shouldHideCurrentSlide,
    buildCountdownMarkup,
    resolveMediaAlias,
    convertStackDirectiveLine,
    extractSlideTransitionValue,
    applyOperations,
    ops
  } = context;

  const {
    appendLineOp,
    rememberSuppressionsOp,
    addStickyMacroOp,
    resetStickyMacrosOp,
    requestAiSymbolOp,
    addAttributionOp,
    setPendingTransitionOp,
    enterHiddenSlideOp,
    markHiddenPreviewOp
  } = ops;

  // Expand macro templates by resolving `$1`, `$2`, ... with media-aware parameters.
  const expandMacroTemplateLines = (template, params) => template
    .replace(/\$(\d+)/g, (_, n) => resolveMediaAlias(params[+n - 1] ?? ''))
    .split('\n');

  // Apply expanded inline macros that affect only the current slide.
  const applyExpandedInlineMacro = (expandedLines) => {
    for (const mline of expandedLines) {
      const normalizedLine = convertStackDirectiveLine(mline);
      const lineOps = [rememberSuppressionsOp(normalizedLine)];
      const attribMatch = normalizedLine.match(/^\{\{attrib:(.*)}}\s*$/i);
      if (attribMatch) {
        lineOps.push(addAttributionOp(attribMatch[1]));
        applyOperations(lineOps);
        continue;
      }
      const transitionValue = extractSlideTransitionValue(normalizedLine);
      if (transitionValue) {
        lineOps.push(setPendingTransitionOp(transitionValue));
      }
      lineOps.push(appendLineOp(normalizedLine));
      applyOperations(lineOps);
    }
  };

  // Apply expanded sticky macros that persist into future slides until reset.
  const applyExpandedStickyMacro = (expandedLines) => {
    for (const mline of expandedLines) {
      const normalizedLine = convertStackDirectiveLine(mline);
      const lineOps = [addStickyMacroOp(normalizedLine), rememberSuppressionsOp(normalizedLine)];
      const attribMatch = normalizedLine.match(/^\{\{attrib:(.*)}}\s*$/i);
      if (attribMatch) {
        lineOps.push(addAttributionOp(attribMatch[1]));
        applyOperations(lineOps);
        continue;
      }
      const transitionValue = extractSlideTransitionValue(normalizedLine);
      if (transitionValue) {
        lineOps.push(setPendingTransitionOp(transitionValue));
      }
      lineOps.push(appendLineOp(normalizedLine));
      applyOperations(lineOps);
    }
  };

  // Parse `:macro:` style directives such as hide, countdown, animate, or audio.
  const tryHandleInlineMacroLine = (line) => {
    const inlineMacroMatch = line.match(/^:([A-Za-z0-9_]+)(?::(.*))?:\s*$/);
    if (!inlineMacroMatch) return false;

    const key = inlineMacroMatch[1].trim().toLowerCase();
    const paramString = inlineMacroMatch[2];
    const params = key === 'bgtint' ? [paramString ?? ''] : (paramString ? paramString.split(':') : []);

    if (key === 'attrib' || key === 'ai' || key.startsWith('column')) {
      return false;
    }
    if (key === 'hide') {
      const hideTarget = parseHideTarget(paramString);
      const shouldHideSlide = shouldHideCurrentSlide(hideTarget, forHandout);
      const shouldPreviewHiddenSlide = !forHandout && showHiddenSlidesInPreview && shouldHideCurrentSlide(hideTarget, false);
      if (shouldHideSlide && !shouldPreviewHiddenSlide) {
        applyOperations([enterHiddenSlideOp()]);
        return true;
      }
      if (shouldPreviewHiddenSlide) {
        applyOperations([markHiddenPreviewOp()]);
        return true;
      }
      if (hideTarget) {
        return true;
      }
      console.log('Markdown Hide Inline Macro Not Found or Invalid: ' + paramString);
      return false;
    }
    if (key === 'shiftnone') {
      slideLocalSuppressions.add('shift');
      return true;
    }
    if (key === 'nobg') {
      slideLocalSuppressions.add('bgmode');
      return true;
    }
    if (key === 'clearbg') {
      slideLocalSuppressions.add('background');
      return true;
    }
    if (key === 'nothird') {
      slideLocalSuppressions.add('third');
      return true;
    }
    if (key === 'countdown') {
      const countdownMarkup = buildCountdownMarkup(params);
      if (countdownMarkup) {
        applyOperations([appendLineOp(countdownMarkup)]);
        return true;
      }
      console.log('Markdown Countdown Inline Macro Not Found or Invalid: ' + paramString);
      return false;
    }
    if (key === 'animate') {
      const mode = params[0]?.trim().toLowerCase() || '';
      if (!mode) {
        applyOperations([appendLineOp('<!-- .slide: data-auto-animate -->')]);
        return true;
      }
      if (mode === 'restart') {
        applyOperations([appendLineOp('<!-- .slide: data-auto-animate-restart -->')]);
        return true;
      }
      console.log('Markdown Animate Inline Macro Not Found: ' + paramString);
      return false;
    }
    if (key === 'audio') {
      const command = params[0]?.toLowerCase() || '';
      const rawSrc = params[1] || '';
      const src = resolveMediaAlias(rawSrc);
      let audioLine = '';
      if (command === 'stop') {
        audioLine = `<!-- .slide: data-background-audio-stop -->`;
      } else if (command === 'play' && src) {
        audioLine = `<!-- .slide: data-background-audio-start="${src}" -->`;
      } else if ((command === 'playloop' || command === 'loop') && src) {
        audioLine = `<!-- .slide: data-background-audio-loop="${src}" -->`;
      } else {
        console.log('Markdown Audio Inline Macro Not Found or Missing File: ' + paramString);
      }
      if (audioLine) {
        applyOperations([appendLineOp(audioLine)]);
        return true;
      }
      return false;
    }

    const template = macros[key];
    if (!template) {
      console.log('Markdown Inline Macro Not Found: ' + key);
      return false;
    }
    applyExpandedInlineMacro(expandMacroTemplateLines(template, params));
    return true;
  };

  // Parse `{{macro}}` style invocations for sticky or reusable macro content.
  const tryHandleMacroUseLine = (line) => {
    const macroUseMatch = line.match(/^\{\{([A-Za-z0-9_]+)(?::([^}]+))?\}\}$/);
    if (!macroUseMatch) return false;

    const key = macroUseMatch[1].trim();
    const paramString = macroUseMatch[2];
    const normalizedKey = key.toLowerCase();
    const params = normalizedKey === 'bgtint' ? [paramString ?? ''] : (paramString ? paramString.split(':') : []);

    if (normalizedKey === 'transition') {
      const transitionValue = params[0]?.trim() || '';
      if (transitionValue) {
        const transitionLine = `<!-- .slide: data-transition="${transitionValue}" -->`;
        applyOperations([
          addStickyMacroOp(transitionLine),
          appendLineOp(transitionLine),
          setPendingTransitionOp(transitionValue),
          resetStickyMacrosOp()
        ]);
        return true;
      }
      console.log('Markdown Transition Macro Not Found: ' + paramString);
      return false;
    }
    if (normalizedKey === 'animate') {
      const mode = params[0]?.trim().toLowerCase() || '';
      const animateLine = !mode ? '<!-- .slide: data-auto-animate -->' : (mode === 'restart' ? '<!-- .slide: data-auto-animate-restart -->' : '');
      if (animateLine) {
        applyOperations([
          addStickyMacroOp(animateLine),
          appendLineOp(animateLine),
          resetStickyMacrosOp()
        ]);
        return true;
      }
      console.log('Markdown Animate Macro Not Found: ' + paramString);
      return false;
    }
    if (normalizedKey === 'audio') {
      const command = params[0]?.toLowerCase() || '';
      const rawSrc = params[1] || '';
      const src = resolveMediaAlias(rawSrc);
      let audioLine = '';
      if (command === 'stop') {
        audioLine = `<!-- .slide: data-background-audio-stop -->`;
      } else if (command === 'play' && src) {
        audioLine = `<!-- .slide: data-background-audio-start="${src}" -->`;
      } else if ((command === 'playloop' || command === 'loop') && src) {
        audioLine = `<!-- .slide: data-background-audio-loop="${src}" -->`;
      } else {
        console.log('Markdown Audio Macro Not Found or Missing File: ' + paramString);
      }
      if (audioLine) {
        if (command === 'stop') {
          applyOperations([appendLineOp(audioLine)]);
        } else {
          applyOperations([
            addStickyMacroOp(audioLine),
            appendLineOp(audioLine),
            resetStickyMacrosOp()
          ]);
        }
        return true;
      }
      return false;
    }

    const template = macros[key];
    if (!template) {
      console.log('Markdown Macro Not Found: ' + key);
      return false;
    }
    applyExpandedStickyMacro(expandMacroTemplateLines(template, params));
    applyOperations([resetStickyMacrosOp()]);
    return true;
  };

  // Parse sticky attribution / AI markers and plain attribution metadata lines.
  const tryHandleStickyMetaLine = (line) => {
    const stickyAttribMatch = line.match(/^\{{attrib:(.*)}}\s*$/i);
    if (stickyAttribMatch) {
      const attribText = stickyAttribMatch[1].replace("(c)","©");
      applyOperations([addStickyMacroOp(`{{attrib:${attribText}}}`), addAttributionOp(attribText)]);
      return true;
    }
    const stickyAiMatch = line.match(/^{{ai}}\s*$/i);
    if (stickyAiMatch) {
      if (!forHandout) {
        applyOperations([requestAiSymbolOp(), addStickyMacroOp('{{ai}}')]);
      }
      return true;
    }
    const attribMatch = line.match(/^\:ATTRIB\:(.*)$/i);
    if (attribMatch) {
      applyOperations([addAttributionOp(attribMatch[1].replace("*(c)","©"))]);
      return true;
    }
    const aiSymbolMatch = line.match(/^:AI:\s*$/i);
    if (aiSymbolMatch) {
      if (!forHandout) {
        applyOperations([requestAiSymbolOp()]);
      }
      return true;
    }
    return false;
  };

  return {
    tryHandleInlineMacroLine,
    tryHandleMacroUseLine,
    tryHandleStickyMetaLine
  };
}
