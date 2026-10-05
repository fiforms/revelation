/**
 * Slide transition registry.
 *
 * reveal.js transitions are plain CSS keyed by name: `config.transition` becomes a
 * class on `.reveal`, and a slide's `data-transition="name"` is matched by
 * attribute selectors. This module is the one list of transitions for REVELation:
 *
 * - `builtin: true` entries are implemented by reveal.js's own stylesheet. They are
 *   listed here so the editor dropdowns and the preview demo share one source.
 * - every other entry is generated into CSS by `installTransitionStyles()`, using the
 *   same selector patterns reveal.js uses (including `name-in` / `name-out`).
 *
 * An entry describes the START state of a slide that is about to enter (`future`) or
 * has just left (`past`), as camelCase style properties. `futureVertical` /
 * `pastVertical` override these for vertical stacks (default: same as horizontal).
 *
 * Optional entry fields:
 * - `origin`: one `transform-origin` for the past, present and future states, so the
 *   pivot does not animate (e.g. a hinge at the left edge). `originVertical` is the
 *   same for slides inside a vertical stack (default: `origin`).
 * - `outgoingOnTop`: raise the leaving slide above the arriving one (page turn).
 * - `rest`: override the resting value of a property (e.g. a `circle()` clip-path).
 * - `css`: raw support rules emitted once, with `{root}` for `.reveal.<name>` and `{name}`
 *   for the name. Use it for rules that are not per-state (perspective, pseudo-elements).
 *   These only apply when the transition is set globally (config.transition), because
 *   `{root}` is the class reveal.js adds to `.reveal`.
 * - `futureOrigin` / `pastOrigin` (+ `...Vertical`): a `transform-origin` for just that
 *   state, when the arriving and leaving slides pivot on different points (a cube).
 * - `present`: extra declarations for the resting (present) state, e.g. backfaceVisibility.
 * - `backward`: declarations for the arriving slide only while navigating BACKWARD
 *   (it returns from the past). CSS cannot tell the two apart, so
 *   `installTransitionDirection()` sets `data-navigation-direction` on `.reveal`.
 *   `{d}` in a value stands for this entry's transition duration.
 * - `easing`: a CSS timing function for this entry, replacing reveal's default curve.
 * - `durationScale`: multiply reveal's transition duration (e.g. 1.5 for a slower effect);
 *   the Transition Speed setting still applies on top of it.
 * - `sequential`: the leaving slide finishes (first half of the duration) before the
 *   arriving one starts (second half), so the background shows in between.
 * - `overlap`: with `sequential`, the fraction of the total duration (0-1) during which
 *   both slides are fading at once. Each slide's phase then lasts (1 + overlap) / 2 of the
 *   duration, and the arriving one starts (1 - overlap) / 2 of the way in.
 *
 * Plugins can add transitions with `registerTransition()` before the deck initializes.
 * Transition names stay stable once released: presentations store them.
 */

const REVEAL_CLASS_NAMES = new Set([
  'reveal', 'center', 'rtl', 'overview', 'paused', 'focused', 'scroll',
  'print-pdf', 'has-vertical-slides', 'has-horizontal-slides',
  'has-dark-background', 'has-light-background', 'loading',
  // reveal.js's stylesheet still ships legacy rules for these two transition names
  'cube', 'page'
]);

// Resting (present-slide) value for each style property an entry may animate.
export const RESTING_STYLE = {
  opacity: 1,
  transform: 'none',
  filter: 'none',
  clipPath: 'inset(0% 0% 0% 0%)'
};

// Speeds from reveal.js (data-transition-speed), in ms.
export const TRANSITION_DURATIONS = { default: 800, fast: 400, slow: 1200 };

// Reveal's transition duration for the current speed, exposed as a variable so entries
// can scale it (durationScale) or split it (sequential).
const DURATION_VAR = '--revelation-transition-duration';

// Each section's own `top` offset (px), kept current by installSlideTopVariables(). With
// centered layout reveal.js shrinks a slide's box to its content and offsets it by `top`,
// so a hinge at the screen edge is `calc(var(SLIDE_TOP_VAR) * -1)` from the box's top.
export const SLIDE_TOP_VAR = '--revelation-slide-top';
// Height (px) of the slide area the sections are laid out in, i.e. the screen height at
// slide scale. The bottom screen edge is `calc(var(AREA) - var(TOP))` from the box's top.
export const SLIDE_AREA_VAR = '--revelation-slide-area-height';

// transition-duration for this entry's slide states, or null to keep reveal's own
function stateDuration(def) {
  if (!def.sequential && !(def.durationScale > 0 && def.durationScale !== 1)) return null;
  const phase = def.sequential ? (1 + (def.overlap || 0)) / 2 : 1;
  return `calc(var(${DURATION_VAR}) * ${+((def.durationScale || 1) * phase).toFixed(4)})`;
}

// transition-delay of the arriving slide for a sequential entry
function stateDelay(def) {
  const start = (1 - (def.overlap || 0)) / 2;
  return `calc(var(${DURATION_VAR}) * ${+((def.durationScale || 1) * start).toFixed(4)})`;
}

// Style keys that cannot be animated with the Web Animations API (applied statically).
const NON_ANIMATABLE = ['backfaceVisibility'];

// reveal.js only transitions these on slide sections by default.
const BASE_TRANSITIONED = ['transform-origin', 'transform', 'visibility', 'opacity'];

// Properties whose resting value must be set explicitly, because `none` cannot
// animate to or from a shape function.
const NEEDS_EXPLICIT_REST = ['clipPath'];

// Support rules from reveal.js's legacy page/cube transitions (css/reveal.scss), with the
// class swapped for our own names. The padding and min-height are kept as reveal had them.
const PAGE_SUPPORT_CSS = `
{root} .slides { perspective-origin: 0% 50%; perspective: 3000px; }
{root} .slides section { padding: 30px; min-height: 700px; box-sizing: border-box; transform-style: preserve-3d; }
{root} .slides > section.stack { padding: 0; background: none; }
{root} .slides section:not(.stack):before {
  content: ''; position: absolute; display: block; width: 100%; height: 100%; left: 0; top: 0;
  background: rgba(0, 0, 0, 0.1); transform: translateZ(-20px);
}
{root} .slides section:not(.stack):after {
  content: ''; position: absolute; display: block; width: 90%; height: 30px; left: 5%; bottom: 0;
  background: none; z-index: 1; border-radius: 4px;
  box-shadow: 0px 95px 25px rgba(0, 0, 0, 0.2); transform: translateZ(-90px) rotateX(65deg);
}`;

const CUBE_SUPPORT_CSS = `
{root} .slides { perspective: 1300px; }
{root} .slides section {
  padding: 30px; min-height: 700px; backface-visibility: hidden; box-sizing: border-box;
  transform-style: preserve-3d;
}
.reveal.center.{name} .slides section { min-height: 0; }
{root} .slides > section.stack { padding: 0; background: none; }
{root} .slides section:not(.stack):before {
  content: ''; position: absolute; display: block; width: 100%; height: 100%; left: 0; top: 0;
  background: rgba(0, 0, 0, 0.1); border-radius: 4px; transform: translateZ(-20px);
}
{root} .slides section:not(.stack):after {
  content: ''; position: absolute; display: block; width: 90%; height: 30px; left: 5%; bottom: 0;
  background: none; z-index: 1; border-radius: 4px;
  box-shadow: 0px 95px 25px rgba(0, 0, 0, 0.2); transform: translateZ(-90px) rotateX(65deg);
}`;

const TRANSITIONS = [
  { name: 'none', label: 'None', builtin: true },
  { name: 'fade', label: 'Fade', builtin: true, future: { opacity: 0 }, past: { opacity: 0 } },
  {
    name: 'slide', label: 'Slide', builtin: true,
    future: { opacity: 0, transform: 'translate(150%, 0)' },
    past: { opacity: 0, transform: 'translate(-150%, 0)' }
  },
  {
    name: 'convex', label: 'Convex', builtin: true,
    future: { opacity: 0, transform: 'translate3d(100%, 0, 0) rotateY(90deg) translate3d(100%, 0, 0)' },
    past: { opacity: 0, transform: 'translate3d(-100%, 0, 0) rotateY(-90deg) translate3d(-100%, 0, 0)' }
  },
  {
    name: 'concave', label: 'Concave', builtin: true,
    future: { opacity: 0, transform: 'translate3d(100%, 0, 0) rotateY(-90deg) translate3d(100%, 0, 0)' },
    past: { opacity: 0, transform: 'translate3d(-100%, 0, 0) rotateY(90deg) translate3d(-100%, 0, 0)' }
  },
  {
    name: 'zoom', label: 'Zoom', builtin: true,
    future: { opacity: 0, transform: 'scale(0.2)' },
    past: { opacity: 0, transform: 'scale(16)' }
  },

  // ---- Prototype transitions (generated CSS) ----
  {
    name: 'flip', label: 'Flip', preserve3d: true,
    future: { opacity: 0, transform: 'rotateY(-180deg)' },
    past: { opacity: 0, transform: 'rotateY(180deg)' },
    futureVertical: { opacity: 0, transform: 'rotateX(180deg)' },
    pastVertical: { opacity: 0, transform: 'rotateX(-180deg)' }
  },
  {
    name: 'blur', label: 'Blur Fade',
    future: { opacity: 0, filter: 'blur(24px)', transform: 'scale(1.08)' },
    past: { opacity: 0, filter: 'blur(24px)', transform: 'scale(0.92)' }
  },
  {
    // The new slide is uncovered left to right (top to bottom in a stack)
    // while the old one fades out beneath it.
    name: 'wipe', label: 'Wipe',
    future: { opacity: 1, clipPath: 'inset(0% 100% 0% 0%)' },
    past: { opacity: 0 },
    futureVertical: { opacity: 1, clipPath: 'inset(0% 0% 100% 0%)' }
  },
  {
    // The old slide tips over from its bottom edge while the new one drops in from above.
    // Hinged at the bottom of the screen, not the bottom of the (possibly short) content;
    // 100% is the fallback before the variables are set.
    name: 'fall', label: 'Fall',
    origin: `50% calc(var(${SLIDE_AREA_VAR}, 100%) - var(${SLIDE_TOP_VAR}, 0px))`,
    future: { opacity: 0, transform: 'translateY(-120%) rotateX(-20deg)' },
    past: { opacity: 0, transform: 'rotateX(80deg)' }
  },
  {
    // The new slide opens from the centre like a camera iris.
    name: 'iris', label: 'Iris',
    future: { opacity: 1, clipPath: 'circle(0% at 50% 50%)' },
    past: { opacity: 0 },
    rest: { clipPath: 'circle(150% at 50% 50%)' }
  },
  {
    // The old slide swings toward the viewer on a hinge at its left edge, darkening as it
    // turns. The translateZ lift enlarges it under perspective, a depth cue that keeps the
    // direction from reading as turning away. The page is only visible for the first 90
    // degrees (its back is hidden after that), so it turns 110 degrees: past edge-on by
    // the time it settles. ease-out slows the turn toward the end, and the longer duration
    // keeps the visible part (about 64% of the time with this curve) from feeling rushed.
    // The page also fades with the turn (opacity follows the same curve, about 18% left at
    // the 90 degree point) so it thins out instead of vanishing.
    name: 'page-turn', label: 'Page Turn', origin: '0% 50%', outgoingOnTop: true,
    // Copied from reveal.js's deprecated `.reveal.page` rules, so this no longer depends on
    // reveal shipping them. Perspective is viewed from the left edge, near the hinge.
    css: PAGE_SUPPORT_CSS,
    easing: 'ease-out', durationScale: 1.75,
    // Keep the back of the page hidden while it returns, too; otherwise its mirrored back
    // shows until it passes 90 degrees and then flips to the front with a pop.
    present: { backfaceVisibility: 'hidden' },
    // Slides in a vertical stack hinge from the top edge of the screen and tip toward the viewer
    // Measured from the screen top, not the top of the (possibly short) slide content
    originVertical: `50% calc(var(${SLIDE_TOP_VAR}, 0px) * -1)`,
    futureVertical: { opacity: 0 },
    pastVertical: { opacity: 0, transform: 'translateZ(150px) rotateX(110deg)', filter: 'brightness(0.5)', backfaceVisibility: 'hidden' },
    // Coming back, the page is only seen after passing 90 degrees (early in the return), so
    // let its opacity rise on an ease-in-out curve to materialize gently instead of popping.
    backward: {
      transition: 'transform-origin {d} ease-out, transform {d} ease-out, visibility {d} ease-out, ' +
        'filter {d} ease-out, opacity {d} ease-in-out'
    },
    future: { opacity: 0 },
    past: { opacity: 0, transform: 'translateZ(150px) rotateY(-110deg)', filter: 'brightness(0.5)', backfaceVisibility: 'hidden' }
  },
  {
    // Faces of a cube: the leaving slide turns away on its right edge while the arriving one
    // swings in from its left edge. Taken from reveal.js's deprecated cube transition.
    name: 'cube-3d', label: 'Cube 3D', preserve3d: true, css: CUBE_SUPPORT_CSS,
    future: { opacity: 0, transform: 'translate3d(100%, 0, 0) rotateY(90deg)' },
    past: { opacity: 0, transform: 'translate3d(-100%, 0, 0) rotateY(-90deg)' },
    futureOrigin: '0% 0%',
    pastOrigin: '100% 0%',
    // Vertical stacks are measured against the screen, not the slide's box: with centered
    // layout a short slide's box is only as tall as its content. 100% is the fallback
    // (reveal's own values) before the variables are set.
    futureVertical: { opacity: 0, transform: `translate3d(0, var(${SLIDE_AREA_VAR}, 100%), 0) rotateX(-90deg)` },
    pastVertical: { opacity: 0, transform: `translate3d(0, calc(var(${SLIDE_AREA_VAR}, 100%) * -1), 0) rotateX(90deg)` },
    futureOriginVertical: `0% calc(var(${SLIDE_TOP_VAR}, 0px) * -1)`,
    pastOriginVertical: `0% calc(var(${SLIDE_AREA_VAR}, 100%) - var(${SLIDE_TOP_VAR}, 0px))`
  },
  {
    // The cube seen from inside: the arriving slide swings in toward the viewer instead of away.
    // Faces meet at the shared edge (50% + 50%). Vertical offsets are measured against the
    // screen, not the slide's box, so short slides travel the same distance as tall ones.
    name: 'cube-3d-inverted', label: 'Cube 3D (Inverted)', preserve3d: true,
    future: { opacity: 0, transform: 'translate3d(50%, 0, 0) rotateY(-90deg) translate3d(50%, 0, 0)' },
    past: { opacity: 0, transform: 'translate3d(-50%, 0, 0) rotateY(90deg) translate3d(-50%, 0, 0)' },
    futureVertical: {
      opacity: 0,
      transform: `translate3d(0, calc(var(${SLIDE_AREA_VAR}, 100%) * 0.5), 0) rotateX(90deg) translate3d(0, calc(var(${SLIDE_AREA_VAR}, 100%) * 0.5), 0)`
    },
    pastVertical: {
      opacity: 0,
      transform: `translate3d(0, calc(var(${SLIDE_AREA_VAR}, 100%) * -0.5), 0) rotateX(-90deg) translate3d(0, calc(var(${SLIDE_AREA_VAR}, 100%) * -0.5), 0)`
    }
  },
  {
    // Slides line up in depth like a gallery; neighbours sit back and turned inward.
    name: 'carousel', label: 'Carousel',
    future: { opacity: 0, transform: 'translate3d(100%, 0, -500px) rotateY(-45deg)' },
    past: { opacity: 0, transform: 'translate3d(-100%, 0, -500px) rotateY(45deg)' },
    // Vertical stacks: same layout on the Y axis. The rotation sign mirrors reveal's
    // concave transition, whose vertical rotateX is the opposite of its rotateY.
    futureVertical: { opacity: 0, transform: 'translate3d(0, 100%, -500px) rotateX(45deg)' },
    pastVertical: { opacity: 0, transform: 'translate3d(0, -100%, -500px) rotateX(-45deg)' }
  },
  {
    name: 'spin', label: 'Spin',
    future: { opacity: 0, transform: 'rotate(360deg) scale(0)' },
    past: { opacity: 0, transform: 'rotate(-360deg) scale(0)' }
  },
  {
    // Not a cross-fade: the old slide fades out completely, then the new one fades in.
    // What shows in between is reveal.js's background layer.
    name: 'fade-out-in', label: 'Fade Out, Then In', sequential: true,
    future: { opacity: 0 },
    past: { opacity: 0 }
  },
  {
    // Blur Fade, but staged: the old slide blurs away while the new one starts to sharpen
    // near the end of it (20% overlap), with reveal.js's background showing between them.
    name: 'blur-out-in', label: 'Blur Out, Then In', sequential: true, overlap: 0.2, durationScale: 1.5,
    future: { opacity: 0, filter: 'blur(24px)', transform: 'scale(1.08)' },
    past: { opacity: 0, filter: 'blur(24px)', transform: 'scale(0.92)' }
  }
];

export const getTransitions = () => TRANSITIONS.slice();
export const getTransition = (name) => TRANSITIONS.find(t => t.name === name) || null;
export const transitionNames = () => TRANSITIONS.map(t => t.name);
export const customTransitionNames = () => TRANSITIONS.filter(t => !t.builtin).map(t => t.name);

/** Dropdown label for a transition name; unknown names are title-cased. */
export function transitionLabel(name) {
  const entry = getTransition(name);
  if (entry) return entry.label;
  const text = String(name);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Add a transition (e.g. from a plugin). Must run before installTransitionStyles(). */
export function registerTransition(def) {
  if (!def || !/^[a-z][a-z0-9-]*$/.test(def.name || '')) {
    throw new Error(`Invalid transition name: ${def && def.name}`);
  }
  if (getTransition(def.name) || REVEAL_CLASS_NAMES.has(def.name)) {
    throw new Error(`Transition name already in use: ${def.name}`);
  }
  if (!def.future || !def.past) {
    throw new Error(`Transition "${def.name}" needs future and past styles`);
  }
  TRANSITIONS.push({ label: transitionLabel(def.name), ...def });
}

/** Style object for a slide at rest during this transition (end state of the animation). */
export function restingStyle(def) {
  const resting = { opacity: RESTING_STYLE.opacity, transform: RESTING_STYLE.transform };
  [def.future, def.past, def.futureVertical, def.pastVertical].forEach(styles => {
    Object.keys(styles || {}).forEach(key => {
      if (key in RESTING_STYLE) resting[key] = RESTING_STYLE[key];
    });
  });
  Object.assign(resting, def.rest);
  if (def.origin) resting.transformOrigin = def.origin;
  else if (def.futureOrigin || def.pastOrigin) resting.transformOrigin = '50% 50%';
  return resting;
}

const animatableStyle = (styles) =>
  Object.fromEntries(Object.entries(styles || {}).filter(([key]) => !NON_ANIMATABLE.includes(key)));

/**
 * Web Animations keyframes for previewing a transition in the editor:
 * `incoming` runs on the arriving slide, `outgoing` on the leaving one.
 * Non-animatable properties are returned separately in `staticOutgoing`.
 */
export function demoKeyframes(def) {
  const resting = restingStyle(def);
  const origin = def.origin ? { transformOrigin: def.origin } : {};
  return {
    incoming: [{
      transform: 'none',
      ...(def.futureOrigin ? { transformOrigin: def.futureOrigin } : origin),
      ...animatableStyle(def.future)
    }, resting],
    outgoing: [resting, {
      transform: 'none',
      ...(def.pastOrigin ? { transformOrigin: def.pastOrigin } : origin),
      ...animatableStyle(def.past)
    }],
    staticOutgoing: Object.fromEntries(
      Object.entries(def.past || {}).filter(([key]) => NON_ANIMATABLE.includes(key))
    )
  };
}

const toCssProperty = (key) => key.replace(/[A-Z]/g, ch => `-${ch.toLowerCase()}`);
const toDeclarations = (styles) =>
  Object.entries(styles).map(([key, value]) => `${toCssProperty(key)}: ${value};`).join(' ');

// Same selector patterns as reveal.js's transition-* mixins in reveal.scss.
function stateSelectors(level, name, state, suffix) {
  const slide = level === 'vertical' ? '.reveal .slides > section > section' : '.reveal .slides > section';
  return [
    `${slide}[data-transition='${name}'].${state}`,
    `${slide}[data-transition~='${name}-${suffix}'].${state}`,
    `.reveal.${name} ${slide.replace('.reveal ', '')}:not([data-transition]).${state}`
  ].join(',\n');
}

/** CSS for every non-builtin transition. */
export function generateTransitionCSS(entries = TRANSITIONS) {
  const custom = entries.filter(t => !t.builtin && t.future && t.past);
  if (!custom.length) return '';

  const rules = [];
  const extraProperties = new Set();

  custom.forEach(def => {
    const levels = [
      ['horizontal', def.future, def.past],
      ['vertical', def.futureVertical || def.future, def.pastVertical || def.past]
    ];
    const originFor = (level) => {
      const value = level === 'vertical' ? (def.originVertical || def.origin) : def.origin;
      return value ? { transformOrigin: value } : {};
    };
    levels.forEach(([level, future, past]) => {
      const slideLevel = level === 'vertical' ? 'vertical' : 'horizontal';
      const origin = originFor(slideLevel);
      const stateOrigin = (state) => {
        const key = `${state}Origin${level === 'vertical' ? 'Vertical' : ''}`;
        return def[key] ? { transformOrigin: def[key] } : origin;
      };
      const duration = stateDuration(def);
      const half = {
        ...(duration ? { transitionDuration: duration } : {}),
        ...(def.easing ? { transitionTimingFunction: def.easing } : {})
      };
      const pastStyle = { ...past, ...stateOrigin('past'), ...half, ...(def.outgoingOnTop ? { zIndex: 20 } : {}) };
      rules.push(`${stateSelectors(slideLevel, def.name, 'past', 'out')} { ${toDeclarations(pastStyle)} }`);
      rules.push(`${stateSelectors(slideLevel, def.name, 'future', 'in')} { ${toDeclarations({ ...future, ...stateOrigin('future'), ...half })} }`);
    });

    const animated = new Set();
    [def.future, def.past, def.futureVertical, def.pastVertical].forEach(styles => {
      Object.keys(styles || {}).forEach(key => animated.add(key));
    });
    animated.forEach(key => {
      const property = toCssProperty(key);
      if (!BASE_TRANSITIONED.includes(property) && !NON_ANIMATABLE.includes(key)) extraProperties.add(property);
    });

    const restValues = { ...RESTING_STYLE, ...def.rest };
    const restProps = [...animated].filter(key => NEEDS_EXPLICIT_REST.includes(key));
    const rest = { ...Object.fromEntries(restProps.map(key => [key, restValues[key]])), ...def.present };
    const duration = stateDuration(def);
    if (duration) rest.transitionDuration = duration;
    if (def.easing) rest.transitionTimingFunction = def.easing;
    // Sequential: the arriving slide waits for the leaving one (minus any overlap), then fades in
    if (def.sequential) rest.transitionDelay = stateDelay(def);
    const presentSelectors = (slide) => [
      `.reveal .slides ${slide}[data-transition='${def.name}'].present`,
      `.reveal.${def.name} .slides ${slide}:not([data-transition]).present`
    ].join(',\n');
    if (def.originVertical && def.originVertical !== def.origin) {
      // Different hinge per level: one present rule for each
      rules.push(`${presentSelectors('> section')} { ${toDeclarations({ ...rest, ...originFor('horizontal') })} }`);
      rules.push(`${presentSelectors('> section > section')} { ${toDeclarations({ ...rest, ...originFor('vertical') })} }`);
    } else {
      const all = { ...rest, ...originFor('horizontal') };
      if (Object.keys(all).length) {
        rules.push(`${presentSelectors('section')} { ${toDeclarations(all)} }`);
      }
    }

    if (def.backward) {
      const d = stateDuration(def) || `var(${DURATION_VAR})`;
      const declarations = Object.fromEntries(
        Object.entries(def.backward).map(([key, value]) => [key, String(value).replaceAll('{d}', d)])
      );
      rules.push([
        `.reveal[data-navigation-direction='backward'] .slides section[data-transition='${def.name}'].present`,
        `.reveal[data-navigation-direction='backward'].${def.name} .slides section:not([data-transition]).present`
      ].join(',\n') + ` { ${toDeclarations(declarations)} }`);
    }

    if (def.css) {
      rules.push(def.css.replaceAll('{root}', `.reveal.${def.name}`).replaceAll('{name}', def.name).trim());
    }

    if (def.preserve3d) {
      rules.push([
        `.reveal .slides section[data-transition='${def.name}'].stack`,
        `.reveal.${def.name} .slides section.stack`
      ].join(',\n') + ' { transform-style: preserve-3d; }');
    }
  });

  if (custom.some(def => stateDuration(def) || def.backward)) {
    // Reveal's transition speeds as a variable that slide-level speeds can override
    const full = (ms) => `{ ${DURATION_VAR}: ${ms}ms; }`;
    rules.unshift(
      `.reveal ${full(TRANSITION_DURATIONS.default)}`,
      `.reveal[data-transition-speed='fast'] ${full(TRANSITION_DURATIONS.fast)}`,
      `.reveal[data-transition-speed='slow'] ${full(TRANSITION_DURATIONS.slow)}`,
      `.reveal .slides section[data-transition-speed='fast'] ${full(TRANSITION_DURATIONS.fast)}`,
      `.reveal .slides section[data-transition-speed='slow'] ${full(TRANSITION_DURATIONS.slow)}`
    );
  }

  if (extraProperties.size) {
    // Durations/easing in reveal's shorthand repeat to cover the added properties.
    rules.unshift(
      '.reveal .slides > section,\n.reveal .slides > section > section ' +
      `{ transition-property: ${[...BASE_TRANSITIONED, ...extraProperties].join(', ')}; }`
    );
  }
  return rules.join('\n');
}

/** Inject the generated stylesheet. Call before Reveal initializes; safe to call twice. */
export function installTransitionStyles(doc = document) {
  const css = generateTransitionCSS();
  if (!css) return null;
  let style = doc.getElementById('revelation-custom-transitions');
  if (!style) {
    style = doc.createElement('style');
    style.id = 'revelation-custom-transitions';
    doc.head.appendChild(style);
  }
  style.textContent = css;
  return style;
}

/**
 * Record the direction of the latest slide change on `.reveal`
 * (`data-navigation-direction="forward|backward"`) for entries that use `backward`.
 * Set synchronously in the event, so it applies to the transition that just started.
 */
export function installTransitionDirection(deck) {
  if (!TRANSITIONS.some(t => t.backward) || !deck || typeof deck.on !== 'function') return;

  deck.on('slidechanged', (event) => {
    if (!event || !event.previousSlide) return;
    const before = deck.getIndices(event.previousSlide);
    const after = { h: event.indexh, v: event.indexv };
    const backward = after.h < before.h || (after.h === before.h && after.v < before.v);
    deck.getRevealElement().setAttribute('data-navigation-direction', backward ? 'backward' : 'forward');
  });
}

/**
 * Mirror each section's inline `top` (SLIDE_TOP_VAR) and the slide area height
 * (SLIDE_AREA_VAR) into CSS variables so an origin can be anchored to a screen edge.
 * reveal.js rewrites `top` on layout; a MutationObserver keeps the variables in step, and
 * runs before the browser computes the next transition.
 */
export function installSlideTopVariables(deck) {
  const usesVariables = TRANSITIONS.some(t => JSON.stringify(t).includes('--revelation-slide-'));
  if (!usesVariables || !deck || typeof deck.on !== 'function') return;

  deck.on('ready', () => {
    const root = deck.getRevealElement().querySelector('.slides');
    if (!root) return;

    const sync = (section) => {
      const values = {
        [SLIDE_TOP_VAR]: `${parseFloat(section.style.top) || 0}px`,
        [SLIDE_AREA_VAR]: `${root.offsetHeight}px`
      };
      Object.entries(values).forEach(([name, value]) => {
        if (section.style.getPropertyValue(name) !== value) section.style.setProperty(name, value);
      });
    };
    const syncAll = () => root.querySelectorAll('section').forEach(sync);

    syncAll();
    new MutationObserver(records => {
      // A resize rewrites the area's own size as well as each section's top
      if (records.some(record => record.target === root)) syncAll();
      else records.forEach(record => record.target.tagName === 'SECTION' && sync(record.target));
    }).observe(root, { attributes: true, attributeFilter: ['style'], subtree: true });
  });
}
