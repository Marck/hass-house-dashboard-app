import { esc } from '../util.js';
import { icon } from '../icons.js';
import { LABEL_MAX } from '../config.js';

/**
 * Attributes for an interactive element. data-fid is a stable id used to put
 * keyboard focus back on the same control after a re-render.
 */
/** A paired tablet shows the household's configuration but does not change it; that is done on a phone. */
export const canEditConfig = (s) => !(s.me && s.me.kind === 'device');

export function act(action, arg = '', val = '') {
  const a = esc(arg);
  const v = esc(val);
  return `data-action="${action}"${a ? ` data-arg="${a}"` : ''}${v ? ` data-val="${v}"` : ''} data-fid="${action}:${a}:${v}"`;
}

export function toggle({ on, label, action, arg = '', val = '', disabled = false, tone = 'teal' }) {
  return `<button type="button" class="toggle tone-${tone}" role="switch" aria-checked="${on ? 'true' : 'false'}" aria-label="${label}"${disabled ? ' disabled' : ''} ${act(action, arg, val)}><span class="toggle-knob"></span></button>`;
}

/** Segmented control. items: [{ label, icon, on, attrs }]. */
export function seg(label, items, cls = '') {
  const body = items.map((item) => `<button type="button" class="seg-item${item.on ? ' is-on' : ''}" aria-pressed="${item.on ? 'true' : 'false'}" ${item.attrs}>${item.icon ? icon(item.icon) : ''}<span>${item.label}</span>${item.badge || ''}</button>`).join('');
  return `<div class="seg${cls ? ` ${cls}` : ''}" role="group" aria-label="${label}">${body}</div>`;
}

/** Native select. options: [{ value, label, selected }] with labels already escaped. */
export function select({ label, input, arg = '', options }) {
  const body = options.map((o) => `<option value="${esc(o.value)}"${o.selected ? ' selected' : ''}>${o.label}</option>`).join('');
  return `<select class="select" aria-label="${label}" data-input="${input}"${arg ? ` data-arg="${esc(arg)}"` : ''} data-fid="${input}:${esc(arg)}">${body}</select>`;
}

/** A committed text field of the editors. */
export const textInput = (label, input, arg, value) => `<input type="text" class="input" maxlength="${LABEL_MAX}" value="${esc(value)}" aria-label="${label}" data-input="${input}" data-arg="${esc(arg)}" data-fid="${input}:${esc(arg)}" autocomplete="off" autocapitalize="sentences" spellcheck="false">`;

/** A sheet over the page: the room, a settings screen or a picker. */
export const sheet = (c, head, body) => `<div class="sheet-backdrop" data-action="close-sheet"></div>
  <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" data-scroll="sheet">
    <span class="sheet-handle" aria-hidden="true"></span>
    <button type="button" class="icon-btn sheet-close" aria-label="${c.t('common.close')}" ${act('close-sheet')}>${icon('close')}</button>
    <header class="sheet-head">${head}</header>${body}</div>`;

export const eyebrow = (left, right = '', ic = '') => `<div class="eyebrow"><h3>${ic ? icon(ic) : ''}${left}</h3>${right ? `<span>${right}</span>` : ''}</div>`;

/** In live mode, the parts that still show demo data say so. */
export const demoNote = (c) => (c.d.live ? `<p class="menu-note is-warn">${c.t('live.demoNote')}</p>` : '');

export const live = (c) => `<span class="chip"><i class="dot is-ok"></i>${c.t('common.live', { time: c.f.time(c.d.now.h, c.d.now.m) })}</span>`;

// Names: a label the user typed wins over the built-in translated name.
// The Raw variants are unescaped, for use as a parameter of t().
export const roomNameRaw = (c, id) => {
  const room = c.d.rooms[id];
  return room.label || (room.nameKey ? c.tx(room.nameKey) : id);
};
export const roomName = (c, id) => esc(roomNameRaw(c, id));
export const floorNameRaw = (c, floor, key = 'nameKey') => floor.label || (floor[key] ? c.tx(floor[key]) : floor.id);
export const floorName = (c, floor, key) => esc(floorNameRaw(c, floor, key));

/** Ids are shown with a hyphen, so they read as labels rather than as code. */
export const showId = (id) => esc(String(id).replace(/_/g, '-'));

/**
 * The cards of one screen, in the user's order. In layout edit mode each card
 * gets move and remove buttons; every move works without dragging.
 */
export function cardGrid(c, view, renderers, cls) {
  const { s, cfg, t, tx } = c;
  const list = cfg.cards[view].filter((id) => renderers[id]);
  const slots = list.map((id, i) => {
    const body = renderers[id](c);
    if (!body) return '';
    if (!s.edit) return `<div class="card-slot">${body}</div>`;
    const name = tx(`card.${id}`);
    const btn = (action, val, ic, key, disabled) => `<button type="button" class="icon-btn is-small" aria-label="${t(key, { name })}"${disabled ? ' disabled' : ''} ${act(action, id, val)}>${icon(ic)}</button>`;
    return `<div class="card-slot is-editing"><div class="card-tools" role="group" aria-label="${esc(name)}"><b>${esc(name)}</b>
      ${btn('card-move', 'up', 'up', 'layout.earlier', i === 0)}${btn('card-move', 'down', 'down', 'layout.later', i === list.length - 1)}${btn('card-hide', '', 'close', 'layout.remove', false)}</div>${body}</div>`;
  }).join('');
  return `<div class="grid ${cls}">${slots}</div>`;
}
