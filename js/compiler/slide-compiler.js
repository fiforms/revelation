/**
 * Slide compiler architecture
 *
 * This module owns stateful slide assembly. The line parsers do not mutate the
 * final output directly; they emit operations that are applied here.
 *
 * Responsibilities
 * - buffer lines for the current slide
 * - track sticky macros and local suppressions across slide boundaries
 * - handle hidden-slide transitions and preview markers
 * - inject attribution / AI footer markup
 * - finalize slides and emit the markdown separators Reveal expects
 *
 * In short:
 * - `markdown-line-parsers.js` and `media-line-parsers.js` recognize syntax
 * - this module applies the resulting operations and manages slide state
 * - `markdown-compiler.js` orchestrates the overall pass
 */
export function createSlideCompiler(options = {}) {
  const {
    forHandout = false,
    newSlideOnHeading = true,
    getSuppressionGroupsForLine,
    toStackAttrsMarker,
    extractSlideTransitionValue
  } = options;

  const processedLines = [];
  const currentSlideLines = [];
  const attributions = [];
  const lastmacros = [];
  const thismacros = [];
  const slideLocalSuppressions = new Set();

  let aiSymbolRequested = false;
  let slideHidden = false;
  let slideHiddenPreviewMarked = false;
  let currentSlideBreakIndex = -1;
  let previousSeparatorType = null;
  let pendingAutoStackTransition = null;
  let blankslide = true;

  /** Tracks per-slide suppression groups derived from emitted slide metadata. */
  function rememberLocalSuppressions(value) {
    for (const group of getSuppressionGroupsForLine(value)) {
      slideLocalSuppressions.add(group);
    }
  }

  function markContentLine(line) {
    if (line.trim() !== '' && !line.trim().match(/^<!--.*?-->$/)) {
      blankslide = false;
    }
  }

  function detectAutoSlide(line) {
    return Boolean(newSlideOnHeading && line.match(/^#{1,3} (?!#)/) && !blankslide);
  }

  function getBreakType(line, autoSlide) {
    if (autoSlide) {
      return /^###\s*/.test(line) ? 'vertical' : 'horizontal';
    }
    if (line === '---') return 'vertical';
    if (line === '***') return 'horizontal';
    return null;
  }

  function getBreakLine(line, autoSlide) {
    if (autoSlide) {
      return /^###\s*/.test(line) ? '---' : '***';
    }
    return line === '---' || line === '***' ? line : null;
  }

  // Decide whether the current line should end the slide, either explicitly or via auto-slide behavior.
  function shouldFinalize(line, index, totalLines, autoSlide) {
    return autoSlide || line === '---' || line === '***' || line.match(/^[Nn][Oo][Tt][Ee]\:/) || index >= totalLines - 1;
  }

  // Discard the buffered current slide when a hide directive removes it from output.
  function enterHiddenSlide() {
    currentSlideLines.length = 0;
    slideHidden = true;
  }

  // Mark a hidden slide in preview mode without letting it render as a normal visible slide.
  function markHiddenPreview() {
    if (slideHiddenPreviewMarked) {
      return false;
    }
    currentSlideLines.push('<!-- .slide: data-hidden-preview -->');
    slideHiddenPreviewMarked = true;
    return true;
  }

  // Consume lines while inside a hidden slide until the parser reaches the next boundary.
  function handleHiddenSlide(line, index, totalLines, autoSlide) {
    if (!slideHidden) {
      return { skipLine: false, exitedHiddenSlide: false };
    }

    if (!shouldFinalize(line, index, totalLines, autoSlide)) {
      return { skipLine: true, exitedHiddenSlide: false };
    }

    const breakLine = getBreakLine(line, autoSlide);
    if (breakLine && currentSlideBreakIndex >= 0) {
      processedLines[currentSlideBreakIndex] = breakLine;
    }

    slideHidden = false;
    slideHiddenPreviewMarked = false;
    blankslide = !autoSlide;
    thismacros.length = 0;
    slideLocalSuppressions.clear();
    attributions.length = 0;
    aiSymbolRequested = false;

    if (!autoSlide && (line === '---' || line === '***')) {
      return { skipLine: true, exitedHiddenSlide: true };
    }

    return { skipLine: false, exitedHiddenSlide: true };
  }

  // Append one compiled line to the current slide buffer.
  function appendLine(line) {
    currentSlideLines.push(line);
  }

  // Sticky macros persist into future slides until they are reset or suppressed.
  function addStickyMacro(value) {
    thismacros.push(value);
  }

  // Clear inherited sticky macro state without affecting the current slide buffer.
  function resetStickyMacros() {
    lastmacros.length = 0;
  }

  // Defer AI footer emission until slide finalization so it appears only once per slide.
  function requestAiSymbol() {
    if (!forHandout) {
      aiSymbolRequested = true;
    }
  }

  // Collect attributions during parsing and emit them together at slide finalization time.
  function addAttribution(value) {
    attributions.push(value);
  }

  // Track the last transition that may need to be promoted to stack-level metadata.
  function setPendingAutoStackTransition(value) {
    pendingAutoStackTransition = value;
  }

  // Flush the current slide buffer into the final output stream before boundary decorations.
  function flushCurrentSlideLines() {
    if (currentSlideLines.length === 0) {
      return;
    }
    processedLines.push(...currentSlideLines);
    currentSlideLines.length = 0;
  }

  // Finalize a slide by applying sticky state, footer markup, and break markers.
  function finalizeSlide(line, autoSlide, columnPipeState) {
    const breakType = getBreakType(line, autoSlide);
    let nextColumnPipeState = columnPipeState;

    if (nextColumnPipeState !== 0) {
      console.warn('Unclosed column section before slide break.');
      nextColumnPipeState = 0;
    }

    flushCurrentSlideLines();

    if (thismacros.length > 0) {
      lastmacros.length = 0;
      lastmacros.push(...thismacros);
    } else {
      let skipNextStickyAttrib = false;
      for (const val of lastmacros) {
        const suppressedGroups = getSuppressionGroupsForLine(val);
        if (suppressedGroups.some((group) => slideLocalSuppressions.has(group))) {
          if (suppressedGroups.includes('background')) {
            skipNextStickyAttrib = true;
          }
          continue;
        }
        const attribMatch = val.match(/^\{\{attrib:(.*)}}\s*$/i);
        if (attribMatch) {
          if (skipNextStickyAttrib) {
            skipNextStickyAttrib = false;
            continue;
          }
          attributions.push(attribMatch[1]);
          continue;
        }
        skipNextStickyAttrib = false;
        const aiStickyMatch = val.match(/^{{ai}}\s*$/i);
        if (aiStickyMatch) {
          requestAiSymbol();
          continue;
        }
        const transitionValue = extractSlideTransitionValue(val);
        if (transitionValue) {
          pendingAutoStackTransition = transitionValue;
        }
        processedLines.push(val);
      }
      processedLines.push('');
    }

    thismacros.length = 0;
    slideLocalSuppressions.clear();
    slideHiddenPreviewMarked = false;

    if (attributions.length > 0) {
      processedLines.push('<div class="slide-attribution">');
      for (const attrib of attributions) {
        processedLines.push(`<div class="attribution">${attrib}</div>`);
      }
      processedLines.push('</div>');
      processedLines.push('');
      attributions.length = 0;
    }

    if (aiSymbolRequested) {
      processedLines.push('<div class="slide-ai-symbol">');
      processedLines.push('</div>');
      processedLines.push('');
      aiSymbolRequested = false;
    }

    if (
      breakType === 'vertical' &&
      previousSeparatorType !== 'vertical' &&
      pendingAutoStackTransition
    ) {
      processedLines.push(toStackAttrsMarker(`data-transition="${pendingAutoStackTransition}"`));
      processedLines.push('');
    }

    if (autoSlide) {
      processedLines.push(getBreakLine(line, true));
      processedLines.push('');
      currentSlideLines.push(line);
      currentSlideBreakIndex = processedLines.length - 2;
    } else if (line === '---' || line === '***') {
      processedLines.push(line);
      currentSlideBreakIndex = processedLines.length - 1;
    } else {
      processedLines.push(line);
      currentSlideBreakIndex = processedLines.length - 1;
    }
    if (breakType) {
      previousSeparatorType = breakType;
    }
    pendingAutoStackTransition = null;
    blankslide = !autoSlide;

    return { nextColumnPipeState };
  }

  // Apply a single operation emitted by a parser module.
  function applyOperation(operation) {
    if (!operation || typeof operation !== 'object') {
      return undefined;
    }

    switch (operation.type) {
      case 'append_line':
        appendLine(operation.value);
        return undefined;
      case 'remember_local_suppressions':
        rememberLocalSuppressions(operation.value);
        return undefined;
      case 'add_sticky_macro':
        addStickyMacro(operation.value);
        return undefined;
      case 'reset_sticky_macros':
        resetStickyMacros();
        return undefined;
      case 'request_ai_symbol':
        requestAiSymbol();
        return undefined;
      case 'add_attribution':
        addAttribution(operation.value);
        return undefined;
      case 'set_pending_transition':
        setPendingAutoStackTransition(operation.value);
        return undefined;
      case 'enter_hidden_slide':
        enterHiddenSlide();
        return undefined;
      case 'mark_hidden_preview':
        return markHiddenPreview();
      default:
        throw new Error(`Unknown slide compiler operation: ${operation.type}`);
    }
  }

  // Apply a batch of operations in order, preserving parser intent.
  function applyOperations(operations = []) {
    const results = [];
    for (const operation of operations) {
      results.push(applyOperation(operation));
    }
    return results;
  }

  return {
    state: {
      processedLines,
      currentSlideLines,
      attributions,
      lastmacros,
      thismacros,
      slideLocalSuppressions
    },
    rememberLocalSuppressions,
    markContentLine,
    detectAutoSlide,
    shouldFinalize,
    handleHiddenSlide,
    enterHiddenSlide,
    markHiddenPreview,
    appendLine,
    addStickyMacro,
    resetStickyMacros,
    requestAiSymbol,
    addAttribution,
    setPendingAutoStackTransition,
    applyOperation,
    applyOperations,
    finalizeSlide
  };
}
