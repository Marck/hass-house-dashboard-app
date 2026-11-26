// Configuration screens: floors and rooms, a room's links to Home Assistant
// areas and entities, card layout, and the optional data sources.
import { esc } from '../util.js';
import { icon } from '../icons.js';
import { roomEntities, evStats, netModel, netStats } from '../model.js';
import { EV_SLOTS, EV_ACCEPTS, ENERGY_SLOTS, ENERGY_ACCEPTS, NET_SOURCES, hiddenCards, netSources, entityOption } from '../config.js';
import { LOCK_SCOPES, LOCK_METHODS, LOCK_IDLE_MINUTES, PIN_LENGTH } from '../lock.js';
import { BUILD } from '../build-info.js';
import { act, toggle, seg, select, eyebrow, sheet, textInput, roomNameRaw, floorName, floorNameRaw, showId, canEditConfig } from './parts.js';
import { musicSettings } from './music.js';
import { deviceChoices, accessSettings } from './onboard.js';
import { evValueText, SLOT_ICONS } from './ev.js';

const KIND_ICONS = { speaker: 'speaker', light: 'bulb', switch: 'power', climate: 'radiator', door: 'door', motion: 'walk', temp: 'gauge' };

const iconBtn = (action, arg, val, ic, label, disabled = false) => `<button type="button" class="icon-btn is-small" aria-label="${label}"${disabled ? ' disabled' : ''} ${act(action, arg, val)}>${icon(ic)}</button>`;

const floorOptions = (c, current) => c.d.floors.map((fl) => ({ value: fl.id, label: floorName(c, fl), selected: fl.id === current }));

/** Shown under the top bar while the card layout is being edited. */
export function editBar(c) {
  const { s, cfg, t } = c;
  const hidden = hiddenCards(cfg, s.view);
  const add = hidden.map((id) => `<button type="button" class="btn" ${act('card-show', id)}>${icon('plus')}<span>${t(`card.${id}`)}</span></button>`).join('');
  return `<div class="banner is-edit" role="region" aria-label="${t('layout.title')}"><span class="ic-box">${icon('edit')}</span>
    <p><b>${t('layout.title')}</b><small>${t(hidden.length ? 'layout.hintHidden' : 'layout.hint')}</small></p>
    <div class="btn-row">${add}
      <button type="button" class="btn" ${act('settings')}>${icon('gear')}<span>${t('settings.title')}</span></button>
      <button type="button" class="btn" ${act('layout-reset')}><span>${t('layout.reset')}</span></button>
      <button type="button" class="btn btn-solid" ${act('edit-layout')}><span>${t('common.done')}</span></button></div></div>`;
}

/** Floors and their rooms: add, rename, reorder, move between floors, remove. */
export function planEditor(c) {
  const { d, t } = c;
  const floors = d.floors.map((fl, fi) => {
    const name = floorNameRaw(c, fl);
    const rooms = fl.rooms.map((id, ri) => {
      const rname = roomNameRaw(c, id);
      return `<li class="ed-row"><span class="ic-box">${icon(d.rooms[id].icon)}</span><b class="ed-name">${esc(rname)}</b>
        ${select({ label: t('edit.roomFloor', { name: rname }), input: 'room-floor', arg: id, options: floorOptions(c, fl.id) })}
        ${iconBtn('room-move', id, 'up', 'up', t('edit.moveUp', { name: rname }), ri === 0)}
        ${iconBtn('room-move', id, 'down', 'down', t('edit.moveDown', { name: rname }), ri === fl.rooms.length - 1)}
        ${iconBtn('room-config', id, '', 'gear', t('edit.roomSettings', { name: rname }))}</li>`;
    }).join('');
    return `<section class="tile ed-floor">
      <header class="ed-row">${textInput(t('edit.floorName'), 'floor-label', fl.id, name)}
        ${iconBtn('floor-move', fl.id, 'up', 'up', t('edit.moveUp', { name }), fi === 0)}
        ${iconBtn('floor-move', fl.id, 'down', 'down', t('edit.moveDown', { name }), fi === d.floors.length - 1)}
        ${iconBtn('floor-remove', fl.id, '', 'trash', t('edit.removeFloor', { name }))}</header>
      ${rooms ? `<ul class="ed-list">${rooms}</ul>` : `<p class="muted">${t('edit.noRooms')}</p>`}
      <button type="button" class="btn btn-dashed" ${act('room-add', fl.id)}>${icon('plus')}<span>${t('edit.addRoom')}</span></button>
    </section>`;
  }).join('');
  return `<div class="editor" role="group" aria-label="${t('edit.title')}">
    <p class="muted">${t('edit.hint')}</p>${floors}
    <button type="button" class="btn btn-dashed" ${act('floor-add')}>${icon('plus')}<span>${t('edit.addFloor')}</span></button></div>`;
}

/** A room's own settings: name, floor, linked areas and the entities it shows. */
// Kinds a person could switch once commands exist (step 10); only those can be locked.
const CONTROLLABLE = ['light', 'switch', 'climate', 'speaker'];

/** The per-entity options under an entity row: read-only, and ignore when unavailable. */
function entityOptions(c, e, ename) {
  const { s, t, cfg } = c;
  const opt = (key, label, help, extra = '') => `<span class="ed-opt"><span class="ed-name"><b>${label}</b><small>${help}</small></span>${extra}</span>`;
  const readOnly = entityOption(cfg, e.id, 'readOnly');
  const unlocking = readOnly && s.confirm === `ro:${e.id}`;
  const lock = CONTROLLABLE.includes(e.kind) ? opt('readOnly', t('roomcfg.readOnly'), t(unlocking ? 'roomcfg.readOnlyConfirm' : 'roomcfg.readOnlyHelp'),
    toggle({ on: readOnly, label: t('roomcfg.readOnlyFor', { name: ename }), action: 'entity-readonly', arg: e.id, tone: unlocking ? 'amber' : 'teal' })) : '';
  const quiet = opt('ignoreOffline', t('roomcfg.ignoreOffline'), t('roomcfg.ignoreOfflineHelp'),
    toggle({ on: entityOption(cfg, e.id, 'ignoreOffline'), label: t('roomcfg.ignoreOfflineFor', { name: ename }), action: 'entity-ignore', arg: e.id }));
  return `<div class="ed-opts">${lock}${quiet}</div>`;
}

export function roomConfigSheet(c, id) {
  const { s, d, cfg, t, tn } = c;
  const room = d.rooms[id];
  const roomConfig = cfg.rooms[id];
  const name = roomNameRaw(c, id);
  const found = roomEntities(d, roomConfig);
  const floor = d.floors.find((fl) => fl.id === room.floor);
  const areaName = (areaId) => (d.ha.areas[areaId] ? t(d.ha.areas[areaId].nameKey) : showId(areaId));
  const entityName = (entityId) => {
    const e = d.ha.entities[entityId];
    const own = { light: d.lights, switch: d.switches, climate: d.climate, speaker: d.speakers }[e.kind];
    if (own) return c.tx(own[entityId].nameKey);
    return c.tx(e.kind === 'door' ? e.door.nameKey : `entity.kind.${e.kind}`);
  };
  const unlink = (areaId) => `<button type="button" class="btn" ${act('area-unlink', id, areaId)}><span>${t('roomcfg.unlink')}</span></button>`;

  const areaRows = roomConfig.areas.map((areaId) => {
    if (!d.ha.areas[areaId]) {
      return `<li class="tile ed-row is-missing"><span class="ic-box">${icon('alert')}</span>
        <span class="ed-name"><b>${t('area.missing')}</b><small class="mono">${showId(areaId)}</small><small>${t('area.missingHelp')}</small></span>${unlink(areaId)}</li>`;
    }
    const count = found.list.filter((e) => e.area === areaId && e.via !== 'manual').length;
    return `<li class="tile ed-row"><span class="ic-box">${icon('link')}</span>
      <span class="ed-name"><b>${areaName(areaId)}</b><small><span class="mono">${showId(areaId)}</span> · ${tn('roomcfg.entityCount', count)}</small></span>${unlink(areaId)}</li>`;
  }).join('');
  const freeAreas = Object.keys(d.ha.areas).filter((areaId) => !roomConfig.areas.includes(areaId));
  const areaPick = freeAreas.length ? select({
    label: t('roomcfg.addArea'), input: 'area-pick', arg: id,
    options: [{ value: '', label: t('roomcfg.addArea'), selected: true }].concat(freeAreas.map((areaId) => ({ value: areaId, label: `${areaName(areaId)} (${showId(areaId)})` }))),
  }) : '';

  const entityRows = found.list.map((e) => {
    const ename = entityName(e.id);
    const source = e.via === 'manual' ? t('roomcfg.via.manual') : `${areaName(e.area)} · ${t(`roomcfg.via.${e.via}`)}`;
    const control = e.via === 'manual'
      ? `<button type="button" class="btn" ${act('entity-drop', id, e.id)}><span>${t('roomcfg.remove')}</span></button>`
      : toggle({ on: !e.excluded, label: t('roomcfg.show', { name: ename }), action: 'entity-toggle', arg: id, val: e.id });
    return `<li class="tile ed-row ed-wrap${e.excluded ? ' is-dim' : ''}"><span class="ic-box">${icon(KIND_ICONS[e.kind] || 'chip')}</span>
      <span class="ed-name"><b>${esc(ename)}</b><small>${t(`entity.kind.${e.kind}`)} · <span class="mono">${showId(e.id)}</span></small><small>${source}</small></span>${control}
      ${entityOptions(c, e, ename)}</li>`;
  }).join('');
  const missingRows = found.missingEntities.map((entityId) => `<li class="tile ed-row is-missing"><span class="ic-box">${icon('alert')}</span>
    <span class="ed-name"><b>${t('entity.notFound')}</b><small class="mono">${showId(entityId)}</small><small>${t('entity.notFoundHelp')}</small></span>
    <button type="button" class="btn" ${act('entity-drop', id, entityId)}><span>${t('roomcfg.remove')}</span></button></li>`).join('');
  const candidates = Object.keys(d.ha.entities).filter((entityId) => !d.ha.entities[entityId].category && !found.list.some((e) => e.id === entityId));
  const entityPick = candidates.length ? select({
    label: t('roomcfg.addEntity'), input: 'entity-pick', arg: id,
    options: [{ value: '', label: t('roomcfg.addEntity'), selected: true }].concat(candidates.map((entityId) => ({ value: entityId, label: `${esc(entityName(entityId))} (${showId(entityId)})` }))),
  }) : '';
  const shownCount = found.list.filter((e) => !e.excluded).length;
  const confirming = s.confirm === `room:${id}`;

  const head = `<div><p class="kicker">${t('roomcfg.title')}</p><h2 id="sheet-title">${esc(name)}</h2><p class="lead">${floorName(c, floor)}</p></div>`;
  return sheet(c, head, `<p><button type="button" class="btn" ${act('room-back', id)}>${icon('back')}<span>${t('roomcfg.back')}</span></button></p>
    <section>${eyebrow(t('roomcfg.basics'))}
      <div class="form-grid"><label class="field"><span>${t('roomcfg.name')}</span>${textInput(t('roomcfg.name'), 'room-label', id, name)}</label>
        <label class="field"><span>${t('roomcfg.floor')}</span>${select({ label: t('roomcfg.floor'), input: 'room-floor', arg: id, options: floorOptions(c, room.floor) })}</label></div></section>
    <section>${eyebrow(t('roomcfg.areas'), tn('roomcfg.linkedCount', roomConfig.areas.length))}
      <p class="muted">${t('roomcfg.areasHint')}</p><ul class="ed-list">${areaRows}</ul>${areaPick}</section>
    <section>${eyebrow(t('roomcfg.entities'), tn('roomcfg.shownCount', shownCount))}
      <p class="muted">${t('roomcfg.entitiesHint')}${found.filtered ? ` ${tn('roomcfg.filtered', found.filtered)}` : ''}</p>
      <ul class="ed-list">${missingRows}${entityRows}</ul>${entityPick}</section>
    <section>${eyebrow(t('roomcfg.danger'))}
      <button type="button" class="btn btn-danger${confirming ? ' is-armed' : ''}" ${act('room-remove', id)}>${icon('trash')}<span>${t(confirming ? 'roomcfg.removeConfirm' : 'roomcfg.removeRoom')}</span></button>
      <p class="muted">${t('roomcfg.removeHelp')}</p></section>`);
}

/** Child lock settings. They belong to this device and are not part of the configuration. */
function lockSection({ s, t, f }) {
  const { lock } = s;
  const choice = (key, values, current, action, label) => `<p class="field-label">${t(key)}</p>
    ${seg(t(key), values.map((v) => ({ label: label(v), on: current === v, attrs: act(action, String(v)) })), 'seg-full')}`;
  const pin = lock.method === 'pin' ? `<div class="tile ed-row ed-wrap${lock.pin ? '' : ' is-missing'}"><span class="ic-box">${icon('lock')}</span>
      <span class="ed-name"><b>${t('lock.pin')}</b><small>${t(lock.pin ? 'lock.pinSet' : 'lock.pinMissing')}</small></span>
      <input type="password" class="input" inputmode="numeric" pattern="[0-9]*" maxlength="${PIN_LENGTH}" autocomplete="off" aria-label="${t('lock.pinNew')}" placeholder="${t('lock.pinNew')}" data-input="lock-pin" data-fid="lock-pin:"></div>` : '';
  const options = lock.enabled ? `${choice('lock.scope', LOCK_SCOPES, lock.scope, 'lock-scope', (v) => t(`lock.scope.${v}`))}
    ${choice('lock.method', LOCK_METHODS, lock.method, 'lock-method', (v) => t(`lock.method.${v}`))}${pin}
    ${choice('lock.idle', LOCK_IDLE_MINUTES, lock.idle, 'lock-idle', (v) => t('lock.idleValue', { n: f.num(v) }))}
    <div class="btn-row"><button type="button" class="btn" ${act('lock-now')}>${icon('lock')}<span>${t('lock.now')}</span></button></div>` : '';
  return `<section>${eyebrow(t('lock.title'), t(lock.enabled ? 'common.on' : 'common.off'))}
    <div class="tile ed-row"><span class="ic-box">${icon('lock')}</span><span class="ed-name"><b>${t('lock.enable')}</b><small>${t('lock.enableHelp')}</small></span>
      ${toggle({ on: lock.enabled, label: t('lock.enable'), action: 'lock-toggle' })}</div>
    ${options}<p class="muted ed-gap">${t('lock.note')}</p></section>`;
}

/** What the browser on this device can do, for checking a real tablet without a console. */
function diagnosticsSection({ s, t }) {
  const diag = s.diag;
  if (!diag) return '';
  const rows = [
    [t('diag.browser'), esc(diag.agent)],
    [t('diag.screen'), `${esc(diag.width)} x ${esc(diag.height)}, ${t(`diag.layout.${s.layout}`)}`],
    [t('diag.touch'), t(diag.touch ? 'diag.yes' : 'diag.no')],
  ];
  const failed = diag.checks.filter((check) => !check.ok).length;
  const checks = diag.checks.map((check) => `<li class="${check.ok ? 'is-ok' : 'is-fail'}">${icon(check.ok ? 'check' : 'alert')}<span>${t(`diag.check.${check.id}`)}</span></li>`).join('');
  return `<section>${eyebrow(t('diag.title'), t(failed ? 'diag.someFail' : 'diag.allPass'))}
    <div class="tile"><dl class="kv">${rows.map(([key, value]) => `<dt>${key}</dt><dd>${value}</dd>`).join('')}</dl>
      <ul class="diag-list">${checks}</ul></div></section>`;
}

/** Which build this is: the commit identifies it, the tag says whether it was released. */
function aboutSection({ t }) {
  const channel = ['dev', 'preview', 'stable'].includes(BUILD.channel) ? t(`about.channel.${BUILD.channel}`) : esc(BUILD.channel);
  const commit = BUILD.commit ? `${esc(BUILD.commit)}${BUILD.modified ? `, ${t('about.modified')}` : ''}` : t('about.noCommit');
  return `<section>${eyebrow(t('about.title'))}
    <div class="tile"><p class="about-line"><b>${t('app.title')} ${esc(BUILD.version)}</b> <span class="muted">${channel}</span></p>
      <dl class="kv"><dt>${t('about.commit')}</dt><dd class="mono">${commit}</dd>
        <dt>${t('about.release')}</dt><dd>${BUILD.tag ? t('about.released', { tag: BUILD.tag }) : t('about.unreleased')}</dd>
        <dt>${t('about.built')}</dt><dd>${BUILD.builtOn ? esc(BUILD.builtOn) : t('about.notBuilt')}</dd></dl></div></section>`;
}

/** Application settings: this device, optional features and their data sources. Never a file. */
export function settingsSheet(c) {
  const { s, d, cfg, t, tx, f } = c;
  const all = evStats(d, { ev: { map: cfg.ev.map, hide: [] } });
  const evOn = cfg.cards.energy.includes('ev');

  const slots = EV_SLOTS.map((slot) => {
    const name = tx(`ev.slot.${slot}`);
    const mapped = cfg.ev.map[slot];
    const stat = all[slot];
    const state = stat ? evValueText(c, slot, stat) : t('settings.ev.notSet');
    const fits = Object.keys(d.ev.entities).filter((entityId) => EV_ACCEPTS[slot].includes(d.ev.entities[entityId].cls));
    const options = [{ value: '', label: t('settings.none'), selected: !mapped }].concat(fits.map((entityId) => ({ value: entityId, label: `${t(d.ev.entities[entityId].nameKey)} (${showId(entityId)})`, selected: entityId === mapped })));
    if (mapped && !fits.includes(mapped)) options.push({ value: mapped, label: `${showId(mapped)} (${t('entity.notFound')})`, selected: true });
    return `<li class="tile ed-row ed-wrap${stat && stat.error ? ' is-missing' : ''}"><span class="ic-box">${icon(SLOT_ICONS[slot])}</span>
      <span class="ed-name"><b>${esc(name)}</b><small>${state}</small></span>
      ${select({ label: t('settings.ev.entityFor', { name }), input: 'ev-map', arg: slot, options })}
      ${toggle({ on: Boolean(mapped) && !cfg.ev.hide.includes(slot), label: t('settings.ev.showStat', { name }), action: 'ev-stat', arg: slot, disabled: !mapped })}</li>`;
  }).join('');

  const sources = netSources(cfg);
  // Live power on the energy screen: the Energy settings' sensor (auto), none, or one picked here.
  const sensors = d.energySensors || {};
  const energyRows = ENERGY_SLOTS.map((slot) => {
    const name = tx(`energy.slot.${slot}`);
    const chosen = cfg.energy.map[slot];
    const fits = Object.keys(sensors).filter((id) => ENERGY_ACCEPTS[slot].includes(sensors[id].cls));
    const options = [
      { value: 'auto', label: t('settings.energy.auto'), selected: chosen === 'auto' },
      { value: '', label: t('settings.none'), selected: chosen === null },
    ].concat(fits.map((id) => ({ value: id, label: `${esc(sensors[id].name)} (${showId(id)})`, selected: id === chosen })));
    if (chosen && chosen !== 'auto' && !fits.includes(chosen)) options.push({ value: chosen, label: `${showId(chosen)} (${t('entity.notFound')})`, selected: true });
    const missing = chosen && chosen !== 'auto' && !fits.includes(chosen);
    return `<li class="tile ed-row ed-wrap${missing ? ' is-missing' : ''}"><span class="ic-box">${icon(slot.startsWith('batt') ? 'battery' : (slot === 'solar' ? 'sun' : 'bolt'))}</span>
      <span class="ed-name"><b>${esc(name)}</b><small>${t(chosen === 'auto' ? 'settings.energy.autoHelp' : (chosen === null ? 'settings.energy.off' : 'settings.energy.picked'))}</small></span>
      ${select({ label: t('settings.ev.entityFor', { name }), input: 'energy-map', arg: slot, options })}</li>`;
  }).join('');

  const sourceRows = NET_SOURCES.map((src) => {
    const on = cfg.net[src];
    const stats = on ? netStats(netModel(d, { net: { unifi: src === 'unifi', zigbee: src === 'zigbee' } }, src, s.site)) : null;
    const status = on ? t('settings.net.connected', { n: f.num(stats.online + stats.offline) }) : t('settings.net.off');
    return `<li class="tile ed-row"><span class="ic-box src-${src}">${icon(src === 'unifi' ? 'router' : 'chip')}</span>
      <span class="ed-name"><b>${t(`net.src.${src}`)}</b><small>${on ? '<i class="dot is-ok"></i> ' : ''}${status}</small></span>
      ${toggle({ on, label: t('settings.net.use', { name: tx(`net.src.${src}`) }), action: 'net-source', arg: src })}</li>`;
  }).join('');
  const confirming = s.confirm === 'config';

  const head = `<div><h2 id="sheet-title">${t('settings.title')}</h2><p class="lead">${t('settings.lead')}</p></div>`;
  const device = `<section>${eyebrow(t('settings.device'))}${deviceChoices(c)}</section>`;
  const rooms = `<section>${eyebrow(t('settings.rooms'))}<p class="muted">${t('settings.rooms.hint')}</p>
      <div class="btn-row"><button type="button" class="btn" ${act('rooms-edit')}>${icon('edit')}<span>${t('settings.rooms.open')}</span></button></div></section>`;
  // A paired tablet keeps its own settings; the household's are changed on a phone.
  if (!canEditConfig(s)) {
    return sheet(c, head, `${device}${accessSettings(c)}${lockSection(c)}
      <section>${eyebrow(t('settings.household'))}<p class="menu-note">${t('settings.householdOnPhone')}</p></section>
      ${diagnosticsSection(c)}${aboutSection(c)}`);
  }
  return sheet(c, head, `${device}${accessSettings(c)}${rooms}${lockSection(c)}<section>${eyebrow(t('card.ev'), t(evOn ? 'common.on' : 'common.off'))}
      <div class="tile ed-row"><span class="ic-box">${icon('car')}</span><span class="ed-name"><b>${t('settings.ev.show')}</b><small>${t('settings.ev.showHelp')}</small></span>
        ${toggle({ on: evOn, label: t('settings.ev.show'), action: 'card-toggle', arg: 'ev' })}</div>
      <p class="muted ed-gap">${t('settings.ev.hint')}</p><ul class="ed-list">${slots}</ul></section>
    <section>${eyebrow(t('settings.energy'))}<p class="muted">${t('settings.energy.hint')}</p><ul class="ed-list">${energyRows}</ul></section>
    <section>${eyebrow(t('settings.net'))}<p class="muted">${t('settings.net.hint')}</p><ul class="ed-list">${sourceRows}</ul>
      ${sources.length ? '' : `<p class="menu-note is-warn">${t('settings.net.hidden')}</p>`}</section>
    ${musicSettings(c)}
    <section>${eyebrow(t('settings.backup'))}<p class="muted">${t('settings.backup.hint')}</p>
      <div class="btn-row"><button type="button" class="btn" ${act('config-export')}><span>${t('settings.backup.export')}</span></button>
        <label class="btn file-btn"><input type="file" class="sr-only" accept="application/json,.json" aria-label="${t('settings.backup.import')}" data-input="config-import" data-fid="config-import:"><span>${t('settings.backup.import')}</span></label>
        <button type="button" class="btn btn-danger${confirming ? ' is-armed' : ''}" ${act('config-reset')}><span>${t(confirming ? 'settings.backup.resetConfirm' : 'settings.backup.reset')}</span></button></div></section>
    ${diagnosticsSection(c)}${aboutSection(c)}`);
}
