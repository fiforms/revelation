/**
 * Presentation segmentation helpers
 *
 * Fence-aware utilities for splitting compiled markdown into slides, notes, and
 * per-slide content blocks without letting separator markers inside code fences
 * change document structure.
 */
// Normalize line endings so separator logic behaves consistently across platforms.
function normalizeText(value) {
  return String(value ?? '').replace(/\r\n?/g, '\n');
}

// Detect the start/end of fenced code blocks.
function getFenceMatch(line) {
  return line.match(/^\s{0,3}((`{3,}|~{3,}))[ \t]*(.*)$/);
}

// Advance shared fence state while scanning line-oriented presentation syntax.
function updateFenceState(state, line) {
  const fenceMatch = getFenceMatch(line);
  if (!fenceMatch) {
    return false;
  }

  const fence = fenceMatch[1];
  const fenceChar = fence[0];
  const fenceLength = fence.length;

  if (!state.insideCodeBlock) {
    state.insideCodeBlock = true;
    state.currentFence = fence;
  } else if (
    state.currentFence &&
    fenceChar === state.currentFence[0] &&
    fenceLength >= state.currentFence.length
  ) {
    state.insideCodeBlock = false;
    state.currentFence = '';
  }

  return true;
}

// Split presentation markdown into slide-sized chunks while respecting code fences.
export function splitSlides(markdown) {
  const lines = normalizeText(markdown).split('\n');
  const slides = [];
  const fenceState = { insideCodeBlock: false, currentFence: '' };
  let current = [];
  let breakType = 'start';

  for (const line of lines) {
    if (updateFenceState(fenceState, line)) {
      current.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (!fenceState.insideCodeBlock && (trimmed === '---' || trimmed === '***')) {
      slides.push({ content: current.join('\n'), breakType });
      current = [];
      breakType = trimmed === '---' ? 'vertical' : 'horizontal';
      continue;
    }

    current.push(line);
  }

  slides.push({ content: current.join('\n'), breakType });
  return slides;
}

// Split a single slide chunk into visible content and speaker notes.
export function splitSlideContentAndNotes(rawSlide, noteSeparator) {
  const lines = normalizeText(rawSlide).split('\n');
  const fenceState = { insideCodeBlock: false, currentFence: '' };
  let noteIndex = -1;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (updateFenceState(fenceState, line)) {
      continue;
    }

    if (!fenceState.insideCodeBlock && line.trim() === noteSeparator) {
      noteIndex = i;
      break;
    }
  }

  if (noteIndex < 0) {
    return { content: normalizeText(rawSlide), notes: '' };
  }

  return {
    content: lines.slice(0, noteIndex).join('\n'),
    notes: lines.slice(noteIndex + 1).join('\n')
  };
}

// Build a small slide-oriented IR used by handout rendering and related consumers.
export function segmentPresentation(markdown, noteSeparator) {
  return splitSlides(markdown).map((slide, index) => {
    const parts = splitSlideContentAndNotes(slide.content, noteSeparator);
    return {
      index,
      breakBefore: slide.breakType,
      raw: slide.content,
      content: parts.content,
      notes: parts.notes
    };
  });
}

// Remove slide separators from already-segmented slide content.
export function stripSlideSeparatorsOutsideCodeBlocks(markdown) {
  const lines = normalizeText(markdown).split('\n');
  const fenceState = { insideCodeBlock: false, currentFence: '' };
  const kept = [];

  for (const line of lines) {
    if (updateFenceState(fenceState, line)) {
      kept.push(line);
      continue;
    }

    if (!fenceState.insideCodeBlock && /^\s*(\*\*\*|---)\s*$/.test(line)) {
      continue;
    }

    kept.push(line);
  }

  return kept.join('\n');
}
