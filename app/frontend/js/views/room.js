// Screen A: room detail sheet.
import { icon } from '../icons.js';
import { roomSummary, lightState, acPhase } from '../model.js';
import { thermoScale } from '../charts.js';
import { act, toggle, seg, eyebrow, roomName, floorName, showId, canEditConfig } from './parts.js';

const MODE_ICONS = { auto: 'auto', cool: 'snow', dry: 'drop', heat: 'flame', fan: 'fan' };
const FANS = ['auto', 'low', 'medium', 'high'];
const PRESETS = ['night', 'quiet', 'turbo', 'swing'];
const TONES = { heating: 'orange', cooling: 'blue', reached: 'teal', off: 'off', on: 'orange', auto: 'teal', dry: 'teal', fan: 'teal' };

/** Entity ids start with their kind, as Home Assistant entity ids start with their domain. */
const kindOf = (entityId) => entityId.split(/[._]/)[0];

/** Shown in place of a configured entity that Home Assistant does not have. */
const missingTile = ({ t }, entityId, cls) => `<div class="tile ${cls} is-missing"><span class="ic-box">${icon('alert')}</span>
  <b>${t('entity.notFound')}</b><small class="mono">${showId(entityId)}</small></div>`;

/** Text under a climate title, for example "Heating, 5.0° to go". */
export function climateStatus({ t, f }, unit) {
  const phase = acPhase(unit);
  if (phase === 'heating' || phase === 'cooling') return t(`ac.status.${phase}`, { delta: f.temp(Math.abs(unit.target - unit.current)) });
  return t(`ac.status.${phase}`);
}

/** The parts of a climate card that change while the target slider is dragged. */
export function climateVisual(c, id) {
  const { d, t, f } = c;
  const unit = d.climate[id];
  const air = unit.on ? '<path class="ac-air a1" d="M38,74h184l8,14H30z"/><path class="ac-air a2" d="M30,92h200l8,14H22z"/><path class="ac-air a3" d="M22,110h216l8,14H14z"/>' : '';
  const art = unit.kind === 'ac' ? `<svg class="ac-unit" viewBox="0 0 260 128" aria-hidden="true" focusable="false">
      <rect class="ac-body" x="10" y="6" width="240" height="62" rx="14"/><path class="ac-vent" d="M30,56h200"/>
      <text class="ac-display" x="130" y="40" text-anchor="middle">${unit.on ? f.temp(unit.target, 0) : ''}</text>
      <circle class="ac-led" cx="226" cy="22" r="3"/>${air}</svg>` : '';
  return `${art}<div class="climate-read"><p class="big">${f.num(unit.current, 1)}<sup>°</sup></p>
      <p class="target"><small>${t('climate.target')}</small><b>${unit.on ? f.temp(unit.target) : t('common.off')}</b></p></div>
    ${thermoScale(unit, f, t('climate.now', { temp: f.temp(unit.current) }), id)}`;
}

/** Target temperature control, the same for air conditioning and heating. */
function targetControl(c, id) {
  const { d, t, tx, f } = c;
  const unit = d.climate[id];
  return `<div class="ac-live">
      <div data-bind="climate-visual:${id}">${climateVisual(c, id)}</div>
      <input type="range" class="range thermo-input" min="${unit.min}" max="${unit.max}" step="${unit.step}" value="${unit.target}"
        aria-label="${t('climate.targetFor', { name: tx(unit.nameKey) })}" aria-valuetext="${f.temp(unit.target)}" data-input="climate-target" data-arg="${id}" data-fid="climate-target:${id}">
    </div>`;
}

function heatingCard(c, id) {
  const { d, t, f } = c;
  const unit = d.climate[id];
  const phase = acPhase(unit);
  const tone = TONES[phase];
  const name = t(unit.nameKey);
  const head = `<header class="climate-head"><span class="ic-box">${icon(phase === 'heating' || phase === 'on' ? 'flame' : 'radiator')}</span>
      <div><h4>${name}</h4><p data-bind="climate-status:${id}">${climateStatus(c, unit)}</p></div>
      ${toggle({ on: unit.on, label: name, action: 'climate', arg: id, tone: 'orange' })}</header>`;
  // No settable target in Home Assistant: on and off only, and say why.
  const body = unit.settable === false
    ? `<div class="climate-read"><p class="big">${f.num(unit.current, 1)}<sup>°</sup></p></div><p class="muted">${t('climate.noTarget')}</p>`
    : targetControl(c, id);
  return `<article class="tile climate tone-${tone}">${head}${body}</article>`;
}

function acCard(c, id) {
  const { d, t } = c;
  const ac = d.climate[id];
  const tone = TONES[acPhase(ac)];
  const name = t(ac.nameKey);
  return `<article class="tile climate ac tone-${tone}">
    <header class="climate-head"><span class="ic-box">${icon(ac.on ? MODE_ICONS[ac.mode] : 'ac')}</span>
      <div><h4>${name}</h4><p data-bind="climate-status:${id}">${climateStatus(c, ac)}</p></div>
      ${toggle({ on: ac.on, label: name, action: 'climate', arg: id, tone: tone === 'off' ? 'teal' : tone })}</header>
    ${targetControl(c, id)}
    ${seg(t('ac.mode'), Object.keys(MODE_ICONS).map((m) => ({ label: t(`ac.mode.${m}`), icon: MODE_ICONS[m], on: ac.on && ac.mode === m, attrs: act('ac-mode', id, m) })), 'seg-full seg-stack')}
    ${seg(t('ac.fan'), FANS.map((v) => ({ label: t(`ac.fan.${v}`), on: ac.fan === v, attrs: act('ac-fan', id, v) })), 'seg-full')}
    <div class="presets" role="group" aria-label="${t('ac.presets')}">${PRESETS.map((p) => `<button type="button" class="btn${ac.presets[p] ? ' is-on' : ''}" aria-pressed="${ac.presets[p]}" ${act('ac-preset', id, p)}><span>${t(`ac.preset.${p}`)}</span></button>`).join('')}</div>
  </article>`;
}

function climateSection(c, id, missing) {
  const { d, t } = c;
  const units = d.rooms[id].climate;
  if (!units.length && !missing.length) return '';
  const acOn = units.map((cid) => d.climate[cid]).find((unit) => unit.kind === 'ac' && unit.on);
  const cards = units.map((cid) => (d.climate[cid].kind === 'ac' ? acCard(c, cid) : heatingCard(c, cid))).join('');
  return `<section>${eyebrow(t('room.climate'), acOn ? t(`room.climateNote.${acPhase(acOn)}`) : '')}
    <div class="climate-grid">${cards}${missing.map((eid) => missingTile(c, eid, 'climate')).join('')}</div></section>`;
}

function lightsSection(c, id, sum, missing) {
  const { d, t, tx, f } = c;
  const room = d.rooms[id];
  if (!room.lights.length && !missing.length) return '';
  const cards = room.lights.map((lid) => {
    const state = lightState(d, lid);
    return `<li><button type="button" class="tile light is-${state}" aria-pressed="${state === 'on'}"${state === 'unavailable' ? ' aria-disabled="true"' : ''} ${act('light', lid)}>
      <span class="ic-box">${icon('bulb')}</span><b>${t(d.lights[lid].nameKey)}</b><small>${t(`light.state.${state}`)}</small></button></li>`;
  }).join('');
  const feeds = [...new Set(room.lights.map((lid) => d.lights[lid].feed).filter((sw) => sw && !d.switches[sw].on))];
  const banner = feeds.map((sw) => `<div class="banner is-warn" role="status"><p>${t('room.switchOff', { name: tx(d.switches[sw].nameKey) })}</p>
    <button type="button" class="btn btn-gold" ${act('power-on', sw)}><span>${t('room.powerOn')}</span></button></div>`).join('');
  const master = room.lights.length ? `<span class="eyebrow-ctl">${t('room.lightsCount', { on: f.num(sum.on), total: f.num(sum.available) })}
    ${toggle({ on: sum.on > 0, label: t('room.allLights'), action: 'lights-all', arg: id, disabled: sum.available === 0, tone: 'amber' })}</span>` : '';
  return `${banner}<section>${eyebrow(t('room.lights'), master)}<ul class="light-grid">${cards}${missing.map((eid) => `<li>${missingTile(c, eid, 'light')}</li>`).join('')}</ul></section>`;
}

function motionSection({ d, t }, id) {
  const room = d.rooms[id];
  if (!room.history) return '';
  const slots = room.history.map((v) => `<i class="${v ? 'is-on' : ''}"></i>`).join('');
  const active = room.history.filter(Boolean).length;
  return `<section>${eyebrow(t('room.motion'), t('room.last3h'))}
    <div class="tile timeline"><header><b>${t('room.presence')}</b><span class="is-purple">${t(`room.motion.${room.motion || 'none'}`)}</span></header>
      <div class="slots" role="img" aria-label="${t('room.timelineLabel', { n: active })}">${slots}</div>
      <footer><span>${t('room.ago3h')}</span><span>${t('room.ago90m')}</span><span>${t('common.now')}</span></footer></div></section>`;
}

function powerSection(c, id, missing) {
  const { d, t } = c;
  const room = d.rooms[id];
  if (!room.switches.length && !missing.length) return '';
  const cards = room.switches.map((sw) => {
    const item = d.switches[sw];
    return `<li><button type="button" class="tile light${item.on ? ' is-on' : ' is-off'}" role="switch" aria-checked="${item.on}" ${act('switch', sw)}>
      <span class="ic-box">${icon('power')}</span><b>${t(item.nameKey)}</b><small>${t(item.on ? 'common.on' : 'common.off')} · ${t(item.noteKey)}</small></button></li>`;
  }).join('');
  return `<section>${eyebrow(t('room.power'), t('room.powerSub'))}<ul class="light-grid">${cards}${missing.map((eid) => `<li>${missingTile(c, eid, 'light')}</li>`).join('')}</ul></section>`;
}

/** Problems with the room's configuration that have no section of their own. */
function configBanners(c, id, others) {
  const { d, t } = c;
  const open = canEditConfig(c.s) ? `<button type="button" class="btn" ${act('room-config', id)}>${icon('gear')}<span>${t('roomcfg.open')}</span></button>` : '';
  const areas = d.rooms[id].missingAreas.map((areaId) => `<div class="banner is-warn" role="status"><span class="ic-box">${icon('alert')}</span>
    <p><b>${t('area.missing')}</b><small class="mono">${showId(areaId)}</small></p>${open}</div>`);
  const entities = others.map((eid) => `<div class="banner is-warn" role="status"><span class="ic-box">${icon('alert')}</span>
    <p><b>${t('entity.notFound')}</b><small class="mono">${showId(eid)}</small></p>${open}</div>`);
  return areas.concat(entities).join('');
}

export function roomSheet(c, id) {
  const { d, t, tn, f } = c;
  const room = d.rooms[id];
  const sum = roomSummary(d, id);
  const floor = d.floors.find((fl) => fl.id === room.floor);
  const sub = [floorName(c, floor)];
  if (room.temp !== undefined) sub.push(f.unit(room.temp, '°C'));
  if (room.motion) sub.push(t(`room.motion.${room.motion}`));

  const chips = [];
  if (room.motion === 'now') chips.push(`<span class="chip is-purple">${icon('walk')}${t('common.now')}</span>`);
  if (sum.unavailable) chips.push(`<span class="chip is-amber">${icon('alert')}${tn('room.offline', sum.unavailable)}</span>`);
  if (room.door) chips.push(`<span class="chip">${icon('door')}${t(room.door.nameKey)} <b class="${room.door.open ? 'is-blue' : 'is-teal'}">${t(room.door.open ? 'door.open' : 'door.closed')}</b><span class="chip-sep">${icon('battery')}${f.pct(room.door.battery)}</span></span>`);

  const missing = (kind) => room.missingEntities.filter((eid) => kindOf(eid) === kind);
  const others = room.missingEntities.filter((eid) => !['light', 'switch', 'climate'].includes(kindOf(eid)));
  const body = climateSection(c, id, missing('climate')) + lightsSection(c, id, sum, missing('light')) + motionSection(c, id) + powerSection(c, id, missing('switch'));

  return `<div class="sheet-backdrop" data-action="close-sheet"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" data-scroll="sheet">
      <span class="sheet-handle" aria-hidden="true"></span>
      <button type="button" class="icon-btn sheet-close" aria-label="${t('common.close')}" ${act('close-sheet')}>${icon('close')}</button>
      <header class="sheet-head">
        <div><h2 id="sheet-title">${roomName(c, id)}</h2><p class="lead">${sub.join(', ')}</p></div>
        <svg class="sheet-tile" viewBox="0 0 200 120" aria-hidden="true" focusable="false">
          <path class="tile-side" d="M10,58l90,46 90-46v12l-90,46-90-46z"/><path class="tile-top" d="M100,12l90,46-90,46-90-46z"/>
          ${room.motion ? '<ellipse class="tile-ring" cx="100" cy="58" rx="44" ry="22"/><ellipse class="tile-ring is-inner" cx="100" cy="58" rx="26" ry="13"/>' : ''}</svg>
      </header>
      ${chips.length ? `<div class="chips">${chips.join('')}</div>` : ''}
      ${configBanners(c, id, others)}
      ${body || `<p class="plan-empty">${t('room.empty')}</p>`}
      <footer class="sheet-foot"><span class="muted">${t('common.live', { time: f.time(d.now.h, d.now.m) })}</span>
        <span class="btn-row">${canEditConfig(c.s) ? `<button type="button" class="btn" ${act('room-config', id)}>${icon('gear')}<span>${t('roomcfg.open')}</span></button>` : ''}
        <button type="button" class="btn" ${act('more')}>${icon('external')}<span>${t('room.more')}</span></button></span></footer>
    </div>`;
}
