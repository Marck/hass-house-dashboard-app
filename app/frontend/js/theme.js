export const MODES = ['manual', 'auto', 'off'];
export const SUN_STATES = ['above', 'below', 'unavailable'];

/**
 * Resolve the active theme.
 * - manual: the user's own light or dark choice, never overridden by the sun.
 * - auto: dark only while the sun is known to be down. Any other sun state
 *   (unavailable, unknown) falls back to light, the documented safe default.
 * - off: always light.
 */
export function resolveTheme(pref, sun) {
  if (pref.mode === 'manual') return pref.manual === 'dark' ? 'dark' : 'light';
  if (pref.mode === 'auto') return sun === 'below' ? 'dark' : 'light';
  return 'light';
}
