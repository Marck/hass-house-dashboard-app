// First-run setup, one step at a time. Every step can be skipped and every
// choice is also in the settings afterwards.
import { esc } from '../util.js';
import { textInput } from './parts.js';
import { icon } from '../icons.js';
import { LANGS } from '../i18n/index.js';
import { MODES } from '../theme.js';
import { ONBOARD_STEPS, SIGNIN_MODES, PAIR_DEMO_CODE, isLastStep } from '../onboard.js';
import { act, toggle, seg, eyebrow, roomNameRaw, floorName } from './parts.js';

const row = (ic, title, help, control, cls = '') => `<div class="tile ed-row${cls}"><span class="ic-box">${icon(ic)}</span>
  <span class="ed-name"><b>${title}</b><small>${help}</small></span>${control}</div>`;

const demo = (t) => `<p class="menu-note is-warn">${t('onboard.demoNote')}</p>`;

/** Language and theme of this device. */
export function deviceChoices({ s, t }) {
  return `<p class="field-label">${t('lang.button')}</p>
    ${seg(t('lang.button'), LANGS.map((lang) => ({ label: t(`lang.name.${lang}`), on: s.lang === lang, attrs: act('lang', lang) })), 'seg-full')}
    <p class="field-label">${t('onboard.theme')}</p>
    ${seg(t('onboard.theme'), MODES.map((mode) => ({ label: t(`theme.mode.${mode}`), on: s.theme.mode === mode, attrs: act('theme-mode', mode) })), 'seg-full')}`;
}

/** The real connection of a live backend. It is set up on the server, so there is nothing to press. */
function liveConnection({ s, t, f }) {
  const h = s.ha;
  const ok = h.state === 'connected';
  const text = ok && h.loaded ? t('onboard.connection.live', { areas: f.num(h.areas), entities: f.num(h.entities) })
    : t(`onboard.connection.${{ connected: 'connecting', auth_failed: 'authFailed' }[h.state] || h.state}`);
  const dot = ok ? 'is-ok' : h.state === 'connecting' ? 'is-warn' : 'is-off';
  return `${row('home', t('onboard.connection.name'), `<i class="dot ${dot}"></i> ${text}`, '')}
    <p class="muted ed-gap">${t('onboard.connection.liveHelp')}</p>`;
}

function connection({ s, d, t, f }) {
  if (s.ha) return liveConnection({ s, t, f });
  const o = s.access;
  const found = t('onboard.connection.found', { areas: f.num(Object.keys(d.ha.areas).length), entities: f.num(Object.keys(d.ha.entities).length) });
  return `${row('home', t('onboard.connection.name'), o.connected ? `<i class="dot is-ok"></i> ${found}` : t('onboard.connection.none'),
    `<button type="button" class="btn${o.connected ? '' : ' btn-solid'}" ${act('access-connect')}><span>${t(o.connected ? 'onboard.connection.again' : 'onboard.connection.connect')}</span></button>`)}
    <p class="muted ed-gap">${t('onboard.connection.help')}</p>${demo(t)}`;
}

/** Who is signed in, from the backend; nothing when no backend sign-in is on. */
function signedIn({ s, t }) {
  if (!s.me || !s.me.signedIn) return '';
  return row('lock', t('access.signedIn'), esc(s.me.name || t('access.someone')),
    `<button type="button" class="btn" ${act('sign-out')}><span>${t('access.signOut')}</span></button>`, ' ed-wrap');
}

/**
 * Pairing for real, with the backend: a signed-in person types the code a
 * tablet shows and names it; paired devices are listed and can be removed.
 * A paired device itself only sees that it is paired.
 */
function devicesLive(c) {
  const { s, t } = c;
  if (s.me.kind === 'device') {
    return `${eyebrow(t('devices.heading'))}${row('link', t('devices.thisOne'), esc(s.me.name), '', '')}`;
  }
  const f = s.pairForm || { code: '', name: '' };
  const form = row('link', t('onboard.pair.title'), t('devices.help'),
    `<span class="pair-fields">${textInput(t('devices.code'), 'pair-code', '', f.code).replace('autocapitalize="sentences"', 'autocapitalize="characters" placeholder="ABCD EFGH"')}
      ${textInput(t('devices.name'), 'pair-name', '', f.name).replace('autocomplete="off"', `autocomplete="off" placeholder="${t('devices.namePlaceholder')}"`)}</span>
      <button type="button" class="btn" ${act('device-approve')}><span>${t('devices.approve')}</span></button>`, ' ed-wrap');
  const list = (s.devices || []).map((d) => row('link', esc(d.name),
    t('devices.lastUsed', { date: new Date(d.lastSeen).toLocaleDateString() }),
    `<button type="button" class="btn" ${act('device-revoke', d.id)}><span>${t('devices.remove')}</span></button>`, ''));
  const none = s.devices && !s.devices.length ? `<p class="muted ed-gap">${t('devices.none')}</p>` : '';
  return `${eyebrow(t('devices.heading'))}${form}${list.join('')}${none}`;
}

function signin(c) {
  const { s, t } = c;
  const o = s.access;
  const modes = SIGNIN_MODES.map((mode) => `<button type="button" class="tile ed-row opt${o.signin === mode ? ' is-on' : ''}" aria-pressed="${o.signin === mode}" ${act('access-signin', mode)}>
      <span class="ic-box">${icon(mode === 'hass' ? 'home' : 'lock')}</span>
      <span class="ed-name"><b>${t(`onboard.signin.${mode}`)}</b><small>${t(`onboard.signin.${mode}Help`)}</small></span>${o.signin === mode ? icon('check') : ''}</button>`).join('');
  const pair = row('link', t('onboard.pair.title'), o.paired ? `<i class="dot is-ok"></i> ${t('onboard.pair.done')}` : t('onboard.pair.help'),
    o.paired ? '' : `<span class="pair-code" aria-label="${t('onboard.pair.code')}">${esc(PAIR_DEMO_CODE)}</span>
      <button type="button" class="btn" ${act('access-pair')}><span>${t('onboard.pair.approve')}</span></button>`, ' ed-wrap');
  const live = s.me && s.me.signedIn;
  return `${signedIn(c)}<div class="ed-list" role="group" aria-label="${t('onboard.step.signin')}">${modes}</div>
    ${live ? devicesLive(c) : `${eyebrow(t('onboard.pair.heading'))}${pair}${demo(t)}`}`;
}

function rooms(c) {
  const { s, d, t, tn } = c;
  const skip = s.onboard.skipRooms;
  const floors = d.floors.map((fl) => {
    const items = fl.rooms.map((id) => {
      const name = roomNameRaw(c, id);
      return `<li>${row(d.rooms[id].icon, esc(name), tn('roomcfg.linkedCount', c.cfg.rooms[id].areas.length),
        toggle({ on: !skip.includes(id), label: t('onboard.rooms.keep', { name }), action: 'onboard-room', arg: id }), skip.includes(id) ? ' is-dim' : '')}</li>`;
    }).join('');
    return items ? `<section>${eyebrow(floorName(c, fl))}<ul class="ed-list">${items}</ul></section>` : '';
  }).join('');
  return `<p class="muted">${t('onboard.rooms.help')}</p>${floors}`;
}

function features({ cfg, t }) {
  const item = (ic, key, on, action, arg) => row(ic, t(`onboard.features.${key}`), t(`onboard.features.${key}Help`),
    toggle({ on, label: t(`onboard.features.${key}`), action, arg }));
  return `<div class="ed-list">${item('speakers', 'speakers', cfg.music.multi, 'speakers-flag', 'multi')}
    ${item('car', 'ev', cfg.cards.energy.includes('ev'), 'card-toggle', 'ev')}
    ${item('router', 'unifi', cfg.net.unifi, 'net-source', 'unifi')}
    ${item('chip', 'zigbee', cfg.net.zigbee, 'net-source', 'zigbee')}</div>
    <p class="muted ed-gap">${t('onboard.features.help')}</p>`;
}

function lock({ s, t }) {
  return `${row('lock', t('lock.enable'), t('lock.enableHelp'), toggle({ on: s.lock.enabled, label: t('lock.enable'), action: 'lock-toggle' }))}
    <p class="muted ed-gap">${t('onboard.lock.help')}</p>`;
}

const STEP_VIEWS = { welcome: deviceChoices, connection, signin, rooms, features, lock };

/** The same connection and sign-in choices, as a part of the settings. */
export const accessSettings = (c) => `<section>${eyebrow(c.t('onboard.step.connection'))}${connection(c)}</section>
  <section>${eyebrow(c.t('onboard.step.signin'))}${signin(c)}</section>`;

export function onboardSheet(c) {
  const { s, t, f } = c;
  const o = s.onboard;
  const step = ONBOARD_STEPS[o.step];
  const last = isLastStep(o);
  const dots = ONBOARD_STEPS.map((id, i) => `<i class="${i === o.step ? 'is-on' : ''}${i < o.step ? ' is-done' : ''}"></i>`).join('');
  return `<div class="sheet-backdrop"></div>
  <div class="sheet onboard" role="dialog" aria-modal="true" aria-labelledby="sheet-title" data-scroll="sheet">
    <header class="sheet-head"><div><p class="kicker">${t('onboard.progress', { n: f.num(o.step + 1), total: f.num(ONBOARD_STEPS.length) })}</p>
      <h2 id="sheet-title">${t(`onboard.step.${step}`)}</h2><p class="lead">${t(`onboard.lead.${step}`)}</p></div></header>
    <div class="onboard-dots" aria-hidden="true">${dots}</div>
    <p class="muted onboard-hint">${icon('gear')}<span>${t('onboard.inSettings')}</span></p>
    ${STEP_VIEWS[step](c)}
    <div class="btn-row onboard-nav">
      ${o.step === 0 ? '' : `<button type="button" class="btn" ${act('onboard-back')}>${icon('back')}<span>${t('onboard.back')}</span></button>`}
      <button type="button" class="btn" ${act('onboard-skip')}><span>${t('onboard.skip')}</span></button>
      <button type="button" class="btn btn-solid" ${act('onboard-next')}><span>${t(last ? 'onboard.finish' : 'onboard.next')}</span></button>
    </div></div>`;
}
