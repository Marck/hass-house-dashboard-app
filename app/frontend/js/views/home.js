// Screen D: whole-home overview.
import { icon } from '../icons.js';
import { homeSummary, roomSummary } from '../model.js';
import { floorplan, roomStatusText } from '../art/floorplan.js';
import { sunArc } from '../charts.js';
import { act, seg, live, cardGrid, roomName, roomNameRaw, floorName } from './parts.js';
import { planEditor } from './editor.js';

function roomList(c, floor) {
  const { d, t, f } = c;
  if (!floor.rooms.length) return `<p class="plan-empty">${t('plan.empty')}</p>`;
  const items = floor.rooms.map((id) => {
    const room = d.rooms[id];
    const sum = roomSummary(d, id);
    const status = roomStatusText(c, id);
    return `<li><button type="button" class="room-row${sum.attention ? ' is-attn' : ''}" ${act('room', id)}>
      <span class="ic-box">${icon(room.icon)}</span>
      <span class="room-row-main"><b>${roomName(c, id)}</b><small>${status.length ? status.join(' · ') : t('room.quiet')}</small></span>
      ${room.temp === undefined ? '' : `<span class="room-row-temp">${f.temp(room.temp, 0)}</span>`}${icon('chevron')}</button></li>`;
  }).join('');
  return `<ul class="room-list" aria-label="${t('plan.rooms')}">${items}</ul>`;
}

const legend = ({ t }) => `<ul class="legend" aria-label="${t('legend.title')}">
  <li><i class="swatch"></i>${t('legend.quiet')}</li>
  <li><i class="swatch is-lit"></i>${t('legend.light')}</li>
  <li><i class="swatch is-attn"></i>${t('legend.attention')}</li>
  <li><i class="swatch is-motion"></i>${t('legend.motion')}</li>
  <li><i class="swatch is-door"></i>${t('legend.door')}</li>
</ul>`;

function lightsCard(c) {
  const { t, tn, f } = c;
  const sum = homeSummary(c.d);
  return `<section class="card mini">
    <div class="eyebrow"><h2>${icon('bulb')}${t('home.lights.title')}</h2></div>
    <p class="stat"><b>${f.num(sum.lightsOn)}</b> ${tn('home.lights.count', sum.lightsOn)}</p>
    <p class="muted">${sum.lightsOn ? t('home.lights.some') : t('home.lights.none')}</p>
    <p class="pair-line"><span>${icon('snow')}${t('home.ac')} <b>${t(sum.acOn ? 'common.on' : 'common.off')}</b></span><span>${icon('radiator')}${t('home.heating')} <b>${t(sum.heatingOn ? 'common.on' : 'common.off')}</b></span></p>
    <div class="btn-row">
      <button type="button" class="btn" ${act('scene', 'ac-off')}>${icon('snow')}<span>${t('home.btn.acOff')}</span></button>
      <button type="button" class="btn" ${act('scene', 'heating-off')}>${icon('radiator')}<span>${t('home.btn.heatingOff')}</span></button>
    </div>
    <div class="btn-row">
      <button type="button" class="btn btn-solid" ${act('scene', 'all-off')}>${icon('power')}<span>${t('home.btn.allOff')}</span></button>
      <button type="button" class="btn btn-gold" ${act('scene', 'evening')}>${icon('sun')}<span>${t('home.btn.evening')}</span></button>
    </div>
  </section>`;
}

function musicCard({ d, t, f }) {
  const m = d.music;
  return `<section class="card mini music">
    <div class="eyebrow"><h2>${icon('speaker')}${t('music.title')}</h2><span>${icon('bolt')}${f.pct(m.battery)}</span></div>
    <div class="track"><span class="cover">${icon('music')}</span><div><b>${t(m.titleKey)}</b><small>${t(m.artistKey)}</small></div></div>
    <div class="player">
      <button type="button" class="icon-btn" aria-label="${t('music.prev')}" ${act('music', 'prev')}>${icon('prev')}</button>
      <button type="button" class="icon-btn is-primary" aria-label="${t(m.playing ? 'music.pause' : 'music.play')}" aria-pressed="${m.playing}" ${act('music', 'toggle')}>${icon(m.playing ? 'pause' : 'play')}</button>
      <button type="button" class="icon-btn" aria-label="${t('music.next')}" ${act('music', 'next')}>${icon('next')}</button>
      ${icon('volume')}
      <input type="range" class="range" min="0" max="100" step="1" value="${m.volume}" aria-label="${t('music.volume')}" data-input="volume" data-fid="volume">
      <output class="vol" data-bind="volume">${f.num(m.volume)}</output>
    </div>
    <button type="button" class="btn btn-dashed" ${act('music', 'playlist')}>${icon('play')}<span>${t(m.playlistKey)}</span></button>
    <div class="btn-row">
      <button type="button" class="btn" ${act('music', 'sound')}><span>${t('music.sound')}</span></button>
      <button type="button" class="btn${m.loudness ? ' btn-gold' : ''}" aria-pressed="${m.loudness}" ${act('music', 'loudness')}><span>${t(m.loudness ? 'music.loudnessOn' : 'music.loudnessOff')}</span></button>
    </div>
  </section>`;
}

function irrigationCard({ d, t, tx, f }) {
  const irr = d.irrigation;
  const zones = irr.zones.map((z) => {
    const running = irr.running === z.id;
    const name = t(z.nameKey);
    return `<li class="${running ? 'is-running' : ''}"><span>${name}</span><small>${running ? t('irr.running') : t('irr.minutes', { n: f.num(z.minutes) })}</small>
      <button type="button" class="icon-btn is-small" aria-label="${t(running ? 'irr.stop' : 'irr.start', { zone: tx(z.nameKey) })}" aria-pressed="${running}" ${act('zone', z.id)}>${icon(running ? 'stop' : 'play')}</button></li>`;
  }).join('');
  return `<section class="card mini">
    <div class="eyebrow"><h2>${icon('drop')}${t('irr.title')}</h2></div>
    <p class="stat"><b>${f.pct(irr.moisture)}</b> ${t('irr.moisture')}</p>
    <ul class="zone-list">${zones}</ul>
    <p class="muted">${t('irr.last', { time: f.time(irr.lastWatered.h, irr.lastWatered.m) })}</p>
  </section>`;
}

function tonightCard({ d, t, tx, rich, f }) {
  const night = d.tonight;
  const progress = (d.now.h + d.now.m / 60 - 7) / (night.sunset.h + night.sunset.m / 60 - 7);
  return `<section class="card mini">
    <div class="eyebrow"><h2>${icon('sun')}${t('tonight.title')}</h2></div>
    ${sunArc(progress)}
    <p class="note-line">${icon('sunset')}<span>${rich('tonight.sun', { time: f.time(night.sunset.h, night.sunset.m) })} ${rich('tonight.outside', { state: tx(night.outside ? 'common.on' : 'common.off') })}</span></p>
    <p class="note-line">${icon('battery')}<span>${rich('tonight.battery', { pct: f.pct(d.energy.battery.soc) })}</span></p>
    <div class="btn-row">
      <button type="button" class="btn" ${act('scene', 'outside-on')}><span>${t('tonight.btn.on')}</span></button>
      <button type="button" class="btn" ${act('scene', 'outside-off')}><span>${t('tonight.btn.off')}</span></button>
    </div>
    <div class="btn-row">
      <button type="button" class="btn btn-gold" aria-pressed="${night.stringLights}" ${act('scene', 'string-lights')}>${icon('sun')}<span>${t(night.stringLights ? 'tonight.btn.stringOn' : 'tonight.btn.string')}</span></button>
    </div>
  </section>`;
}

const HOME_CARDS = { lights: lightsCard, music: musicCard, irrigation: irrigationCard, tonight: tonightCard };

export function homeView(c) {
  const { s, d, t, tn, f } = c;
  const sum = homeSummary(d);
  const floor = d.floors.find((fl) => fl.id === s.floor) || d.floors[0];
  const lead = [sum.doorsOpen.length ? tn('home.doors', sum.doorsOpen.length) : t('home.doors.none')];
  if (sum.motionNow.length) lead.push(t('home.motion', { room: roomNameRaw(c, sum.motionNow[sum.motionNow.length - 1]) }));
  if (sum.unreachable) lead.push(tn('home.unreachable', sum.unreachable));

  const people = d.people.map((p) => `<li class="person"><span class="avatar">${icon('user')}<i class="dot is-${p.state}"></i></span>
    <span class="person-main"><b>${t(p.nameKey)}</b><small>${t(`person.state.${p.state}`)}</small></span>
    <span class="person-batt" aria-label="${t('person.battery', { pct: f.pct(p.battery) })}">${f.pct(p.battery)}</span></li>`).join('');

  const openId = sum.doorsOpen[0];
  const doorGlyphs = sum.doors.map((id) => `<i class="door-glyph${d.rooms[id].door.open ? ' is-open' : ''}"></i>`).join('');
  const doorChip = openId
    ? `<button type="button" class="chip chip-btn is-door" ${act('room', openId)}><span class="door-glyphs">${doorGlyphs}</span>${t('home.doorOpen', { room: roomNameRaw(c, openId) })}</button>`
    : `<span class="chip"><span class="door-glyphs">${doorGlyphs}</span>${t('home.doorsClosed')}</span>`;
  const cam = d.camera;
  // The camera chip belongs to a room; it goes away when that room is removed.
  const camChip = d.rooms[cam.roomId]
    ? `<button type="button" class="chip chip-btn" ${act('room', cam.roomId)}>${icon('camera')}${roomName(c, cam.roomId)} <b class="is-purple">${t(cam.eventKey)} ${f.time(cam.at.h, cam.at.m)}</b></button>` : '';
  const floorTabs = seg(t('plan.floors'), d.floors.map((fl) => ({ label: floorName(c, fl), on: fl.id === floor.id, attrs: act('floor', fl.id) })), 'seg-wrap');
  const editBtn = `<button type="button" class="btn${s.planEdit ? ' is-on' : ''}" aria-pressed="${s.planEdit}" ${act('plan-edit')}>${icon('edit')}<span>${t(s.planEdit ? 'common.done' : 'common.edit')}</span></button>`;

  return `<div class="page-head"><div><h1>${t('home.title')}</h1><p class="lead">${lead.join(' ')}</p></div></div>
    <ul class="people" aria-label="${t('home.people')}">${people}</ul>
    <div class="chips">
      ${live(c)}
      <span class="chip">${f.unit(d.weather.temp, '°C')}, ${t(d.weather.conditionKey)}</span>
      <span class="chip">${t('home.battery')} <b>${f.pct(d.energy.battery.soc)}</b></span>
      ${doorChip}
      ${camChip}
      <span class="chip"><i class="dot is-warn"></i>${t('guard.label')} <b>${t(d.guardKey)}</b></span>
    </div>
    <section class="card plan" aria-label="${t('plan.title')}">
      <div class="plan-head">${floorTabs}${editBtn}</div>
      ${s.layout === 'phone' ? roomList(c, floor) : floorplan(c, floor) + legend(c)}
      ${s.planEdit ? planEditor(c) : ''}
    </section>
    ${cardGrid(c, 'home', HOME_CARDS, 'grid-home')}`;
}
