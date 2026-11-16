// Child lock for a wall tablet within reach of small children. It belongs to
// the device, not to the shared configuration: the tablet can be locked while
// a phone is not. It guards against accidental touches; it is not a security
// boundary, because it runs in the browser.
//
// Everything here is pure, so it runs in tests without a browser.

export const LOCK_SCOPES = ['all', 'nolights', 'settings'];
export const LOCK_METHODS = ['hold', 'pin'];
export const LOCK_IDLE_MINUTES = [1, 2, 5, 10];
export const HOLD_MS = 3000;
export const PIN_LENGTH = 4;
export const PIN_TRIES = 5;
export const PIN_WAIT_MS = 30000;

// What kind of thing each action or input does. Anything not listed counts as
// "settings", which is blocked whenever the device is locked: a new action is
// locked until someone decides otherwise.
const KINDS = {
  // Looking around never changes anything.
  view: ['room', 'close-sheet', 'floor', 'net-tab', 'net-view', 'site', 'device', 'ev-period', 'more', 'details', 'bell', 'flow'],
  light: ['light', 'lights-all', 'power-on'],
  control: ['climate', 'ac-mode', 'ac-fan', 'ac-preset', 'switch', 'zone', 'music', 'scene', 'climate-target', 'volume'],
  // The way out of the lock.
  unlock: ['unlock', 'pin-digit', 'pin-back', 'pin-cancel'],
};

export function kindOf(name) {
  const kind = Object.keys(KINDS).find((key) => KINDS[key].includes(name));
  return kind || 'settings';
}

/** Whether a locked device refuses this action or input. */
export function isBlocked(lock, locked, name) {
  if (!locked) return false;
  const kind = kindOf(name);
  if (kind === 'view' || kind === 'unlock') return false;
  if (kind === 'settings') return true;
  if (lock.scope === 'settings') return false;
  if (lock.scope === 'nolights') return kind !== 'light';
  return true;
}

export const defaultLock = () => ({ enabled: false, scope: 'all', method: 'hold', pin: '', idle: 2 });

/** Turn whatever was stored on the device into valid lock settings. */
export function normalizeLock(raw) {
  const base = defaultLock();
  if (!raw || typeof raw !== 'object') return base;
  return {
    enabled: raw.enabled === true,
    scope: LOCK_SCOPES.includes(raw.scope) ? raw.scope : base.scope,
    method: LOCK_METHODS.includes(raw.method) ? raw.method : base.method,
    pin: typeof raw.pin === 'string' && /^[0-9a-f]{8}$/.test(raw.pin) ? raw.pin : '',
    idle: LOCK_IDLE_MINUTES.includes(raw.idle) ? raw.idle : base.idle,
  };
}

export const isPin = (value) => new RegExp(`^\\d{${PIN_LENGTH}}$`).test(String(value));

/**
 * A short fingerprint of the PIN (FNV-1a), so the digits are not readable in
 * the device's storage. This is not cryptography and does not need to be: the
 * lock keeps small hands off, it does not keep anyone out.
 */
export function hashPin(pin) {
  let hash = 0x811c9dc5;
  const text = `hhd:${pin}`;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export const checkPin = (lock, pin) => Boolean(lock.pin) && isPin(pin) && hashPin(pin) === lock.pin;

/** A PIN method without a PIN falls back to hold, so the device can always be unlocked. */
export const unlockMethod = (lock) => (lock.method === 'pin' && lock.pin ? 'pin' : 'hold');
