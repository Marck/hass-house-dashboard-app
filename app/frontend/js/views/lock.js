// Child lock: the button that replaces the top bar actions while locked, and the PIN pad.
import { icon } from '../icons.js';
import { PIN_LENGTH, unlockMethod } from '../lock.js';
import { act } from './parts.js';

/** Shown instead of the edit, language, theme and settings buttons while the device is locked. */
export function lockButton({ s, t }) {
  const hold = unlockMethod(s.lock) === 'hold';
  return `<button type="button" class="btn lock-btn" aria-label="${t(hold ? 'lock.unlockHold' : 'lock.unlockPin')}"${hold ? ' data-hold="unlock"' : ''} ${act('unlock')}>
    ${icon('lock')}<span>${t('lock.locked')}</span><i class="hold-fill" aria-hidden="true"></i></button>`;
}

/**
 * The child lock control, shown on every screen while the lock is on: the way
 * to unlock while locked, "lock now" while unlocked. It floats above sheets so
 * it is never covered, and sits below the error bar when there is one.
 */
export function lockFloat(c) {
  const { s, t } = c;
  if (!s.lock.enabled) return '';
  const body = s.locked ? lockButton(c)
    : `<button type="button" class="icon-btn lock-now" aria-label="${t('lock.now')}" ${act('lock-now')}>${icon('lock')}</button>`;
  return `<div class="lock-float">${body}</div>`;
}

export function pinPad({ s, t }) {
  const dots = Array.from({ length: PIN_LENGTH }, (_, i) => `<i class="${i < s.pinEntry.length ? 'is-on' : ''}"></i>`).join('');
  const key = (digit) => `<button type="button" class="pin-key" ${act('pin-digit', String(digit))}>${digit}</button>`;
  return `<div class="sheet-backdrop" data-action="pin-cancel"></div>
    <div class="sheet pinpad" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <button type="button" class="icon-btn sheet-close" aria-label="${t('common.close')}" ${act('pin-cancel')}>${icon('close')}</button>
      <h2 id="sheet-title">${t('lock.enterPin')}</h2>
      <p class="pin-dots" role="status" aria-label="${t('lock.pinProgress', { n: s.pinEntry.length, total: PIN_LENGTH })}">${dots}</p>
      <div class="pin-keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(key).join('')}
        <span></span>${key(0)}<button type="button" class="pin-key is-plain" aria-label="${t('lock.pinBack')}" ${act('pin-back')}>${icon('back')}</button></div>
    </div>`;
}
