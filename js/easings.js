/**
 * Named easing presets for auto-animate (`config.autoAnimateEasing` and the
 * per-slide `data-auto-animate-easing`).
 *
 * Presentations store the preset NAME (e.g. `bouncy`); `resolveEasing()` swaps it
 * for the CSS easing function before Reveal.js sees it. Anything that is not a
 * preset name (ease-out, cubic-bezier(...), linear(...), steps(...)) passes
 * through unchanged. The admin Setup screen builds its dropdown from this list,
 * so names must stay stable once released.
 *
 * `linear()` needs Chromium 113+, Firefox 112+ or Safari 17.2+.
 */
export const AUTO_ANIMATE_EASINGS = [
  { name: 'ease', label: 'Ease (default)', css: 'ease' },
  { name: 'linear', label: 'Linear', css: 'linear' },
  { name: 'ease-in', label: 'Ease In', css: 'ease-in' },
  { name: 'ease-out', label: 'Ease Out', css: 'ease-out' },
  { name: 'ease-in-out', label: 'Ease In-Out', css: 'ease-in-out' },
  { name: 'smooth', label: 'Smooth', css: 'cubic-bezier(0.65, 0, 0.35, 1)' },
  { name: 'snappy', label: 'Snappy', css: 'cubic-bezier(0.16, 1, 0.3, 1)' },
  { name: 'overshoot', label: 'Overshoot', css: 'cubic-bezier(0.3, 2.4, 0.6, 1)' },
  // Ease-out bounce: three bounces off the target, each smaller than the last
  { name: 'bouncy', label: 'Bouncy', css: 'linear(0, 0.005 2.5%, 0.019 5%, 0.043 7.5%, 0.076 10%, 0.118 12.5%, 0.17 15%, 0.232 17.5%, 0.303 20%, 0.383 22.5%, 0.473 25%, 0.572 27.5%, 0.681 30%, 0.799 32.5%, 0.926 35%, 1 36.4%, 0.97 37.5%, 0.91 40%, 0.86 42.5%, 0.819 45%, 0.788 47.5%, 0.766 50%, 0.753 52.5%, 0.75 55%, 0.757 57.5%, 0.772 60%, 0.798 62.5%, 0.833 65%, 0.877 67.5%, 0.931 70%, 0.994 72.5%, 1 72.7%, 0.973 75%, 0.952 77.5%, 0.94 80%, 0.938 82.5%, 0.945 85%, 0.962 87.5%, 0.988 90%, 1 90.9%, 0.991 92.5%, 0.985 95%, 0.988 97.5%, 1)' },
  { name: 'anticipate', label: 'Anticipate', css: 'cubic-bezier(0.68, -0.55, 0.27, 1.55)' }
];

const CSS_BY_NAME = new Map(AUTO_ANIMATE_EASINGS.map(e => [e.name, e.css]));

/** Preset name -> CSS easing function; any other value is returned as given. */
export function resolveEasing(value) {
  if (typeof value !== 'string') return value;
  const key = value.trim().toLowerCase();
  return CSS_BY_NAME.get(key) ?? value;
}

/** Preset whose CSS equals `value` (for files saved with the raw CSS), or null. */
export function findEasingByCss(value) {
  const css = typeof value === 'string' ? value.trim() : '';
  return AUTO_ANIMATE_EASINGS.find(e => e.css === css) || null;
}

/** Resolve preset names in per-slide `data-auto-animate-easing` attributes. */
export function resolveSlideEasings(root = document) {
  root.querySelectorAll('[data-auto-animate-easing]').forEach(el => {
    const value = el.getAttribute('data-auto-animate-easing');
    const resolved = resolveEasing(value);
    if (resolved !== value) el.setAttribute('data-auto-animate-easing', resolved);
  });
}
