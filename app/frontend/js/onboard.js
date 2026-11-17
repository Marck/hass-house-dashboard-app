// First-run setup. In Phase 1 it runs on a device that has no configuration
// yet; from Phase 2 the installation is set up once and a new device only gets
// the steps that belong to the device. The connection and sign-in steps are
// designs: nothing here authenticates anyone.
//
// Everything is pure, so it runs in tests without a browser.
import { edit } from './config.js';

export const ONBOARD_STEPS = ['welcome', 'connection', 'signin', 'rooms', 'features', 'lock'];
/** How people will sign in once there is a backend. */
export const SIGNIN_MODES = ['oidc', 'hass'];
/** Shown on the device that asks to be paired. Fixed in the demo; random and short-lived for real. */
export const PAIR_DEMO_CODE = '482 915';

/**
 * A clean device gets the setup: no stored configuration and no finished setup.
 * A setup that was started and interrupted comes back, even though its first
 * choices have already been stored.
 */
export function needsOnboarding(storedConfig, setup) {
  const state = setup && typeof setup === 'object' ? setup : {};
  if (state.done) return false;
  return !storedConfig || state.started === true;
}

export const startOnboarding = () => ({ step: 0, skipRooms: [] });

/**
 * Connection and sign-in choices. Designs in Phase 1, kept per device so the
 * setup and the settings show the same thing; the backend owns them later.
 */
export const defaultAccess = () => ({ connected: false, signin: SIGNIN_MODES[0], paired: false });

export function normalizeAccess(raw) {
  const base = defaultAccess();
  if (!raw || typeof raw !== 'object') return base;
  // 'proxy' was the name for an identity provider before OIDC was chosen.
  const signin = raw.signin === 'proxy' ? 'oidc' : raw.signin;
  return { connected: raw.connected === true, signin: SIGNIN_MODES.includes(signin) ? signin : base.signin, paired: raw.paired === true };
}

export const isLastStep = (o) => o.step >= ONBOARD_STEPS.length - 1;

export function moveStep(o, dir) {
  o.step = Math.min(ONBOARD_STEPS.length - 1, Math.max(0, o.step + (dir === 'back' ? -1 : 1)));
}

export function toggleRoom(o, roomId) {
  const at = o.skipRooms.indexOf(roomId);
  if (at < 0) o.skipRooms.push(roomId);
  else o.skipRooms.splice(at, 1);
}

/** Apply what the setup collected: rooms the user left out are removed. Returns how many. */
export function applyOnboarding(cfg, o) {
  return o.skipRooms.filter((roomId) => edit.removeRoom(cfg, roomId)).length;
}
