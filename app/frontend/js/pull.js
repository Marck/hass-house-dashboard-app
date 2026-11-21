// Pulling a sheet down to close it, as its handle suggests (plan 2.15). The
// decision is pure so it can be tested; main.js follows the finger or mouse.

/** Below this distance a movement is a tap, not a pull. */
export const PULL_START_PX = 8;
const FLICK_PX_PER_MS = 0.6;
const FLICK_MIN_PX = 30;

/**
 * Whether a released pull closes the sheet: far enough (a quarter of its
 * height, at most 140 px) or a quick flick. Anything else springs back.
 * dy: pixels pulled down, ms: how long the last part of the pull took,
 * moved: pixels in that last part, height: the sheet's height.
 */
export function pullCloses({ dy, ms, moved, height }) {
  if (!(dy > 0)) return false;
  if (dy >= Math.min(140, height / 4)) return true;
  return dy >= FLICK_MIN_PX && ms > 0 && moved / ms >= FLICK_PX_PER_MS;
}

/** How far the sheet follows: one to one down, not at all up. */
export const pullOffset = (dy) => (dy > 0 ? dy : 0);
