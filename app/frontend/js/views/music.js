// The music card, the sheet for temporary speaker groups and the music settings.
import { esc } from '../util.js';
import { icon } from '../icons.js';
import { MUSIC_SHOW } from '../config.js';
import { ACTIVE_STATES, GROUP_MIN, can, target, managed, defaultPlayer, sessions, selected, playerRooms, groupable, canGroup } from '../music.js';
import { act, toggle, seg, select, eyebrow, sheet, textInput, roomNameRaw, showId } from './parts.js';

const KIND_ICON = { speaker: 'speaker', group: 'speakers', temp: 'speakers' };

/** The name Home Assistant gives a player, or a numbered name for a temporary group. Unescaped. */
function builtInNameRaw(c, id) {
  const { d, tx, f } = c;
  const temp = d.tempGroups.findIndex((g) => g.id === id);
  if (temp >= 0) return tx('music.tempName', { n: f.num(temp + 1) });
  return d.speakers[id] ? tx(d.speakers[id].nameKey) : String(id).replace(/_/g, '-');
}

/** A name the user typed wins. Unescaped, for use as a parameter of t(). */
export const playerNameRaw = (c, id) => c.cfg.music.names[id] || builtInNameRaw(c, id);
const playerName = (c, id) => esc(playerNameRaw(c, id));

const roomsRaw = (c, id) => playerRooms(c.d, c.cfg, id).map((roomId) => roomNameRaw(c, roomId)).join(', ');
const membersRaw = (c, tg) => tg.members.map((m) => playerNameRaw(c, m)).join(', ');
const isActive = (p) => ACTIVE_STATES.includes(p.state);

/** Title and artist, leaving out what the player does not report. */
function media(c, p) {
  const { cfg, t } = c;
  if (!isActive(p) || !p.titleKey) return { title: t('music.nothing'), artist: '' };
  return { title: t(p.titleKey), artist: cfg.music.show.includes('artist') && p.artistKey ? t(p.artistKey) : '' };
}

function cover(c, tg, cls = '') {
  if (!c.cfg.music.show.includes('artwork')) return '';
  const p = tg.player;
  const art = isActive(p) && p.art ? ` art-${p.art}` : ' is-empty';
  return `<span class="cover${cls}${art}">${icon(tg.kind === 'speaker' ? 'music' : 'speakers')}</span>`;
}

/** Name, room and playback state of a target on one line. */
function metaLine(c, tg) {
  const { cfg, t } = c;
  const rooms = cfg.music.show.includes('room') ? roomsRaw(c, tg.id) : '';
  const parts = [playerName(c, tg.id), esc(rooms), t(`music.state.${tg.player.state}`)].filter(Boolean);
  return `<small class="track-meta">${icon(KIND_ICON[tg.kind])}<span>${parts.join(' · ')}</span></small>`;
}

function controls(c, tg) {
  const { t, f } = c;
  const p = tg.player;
  const { id } = tg;
  const name = playerNameRaw(c, id);
  if (p.state === 'unavailable') return `<p class="menu-note is-warn">${t('music.unavailable', { name })}</p>`;
  const btn = (feature, arg, ic, label, cls = '') => (can(p, feature)
    ? `<button type="button" class="icon-btn${cls}" aria-label="${label}"${arg === 'toggle' ? ` aria-pressed="${p.state === 'playing'}"` : ''} ${act('music', arg, id)}>${icon(ic)}</button>` : '');
  const playing = p.state === 'playing';
  const volume = can(p, 'volume') ? `${icon('volume')}
      <input type="range" class="range" min="0" max="100" step="1" value="${p.volume}" aria-label="${t(tg.kind === 'speaker' ? 'music.volume' : 'music.groupVolume')}" data-input="volume" data-arg="${esc(id)}" data-fid="volume:${esc(id)}">
      <output class="vol" data-bind="volume">${f.num(p.volume)}</output>` : '';
  const stop = can(p, 'stop') && isActive(p)
    ? `<button type="button" class="btn btn-two" aria-label="${t('music.stop', { name })}" ${act('music', 'stop', id)}>${icon('stop')}<span><b>${t('music.stopCast')}</b><small>${esc(name)}</small></span></button>` : '';
  const extras = `${can(p, 'playlist') && p.playlistKey ? `<button type="button" class="btn btn-dashed" ${act('music', 'playlist', id)}>${icon('play')}<span>${t(p.playlistKey)}</span></button>` : ''}
    ${can(p, 'sound') ? `<div class="btn-row">
      <button type="button" class="btn" ${act('music', 'sound', id)}><span>${t('music.sound')}</span></button>
      <button type="button" class="btn${p.loudness ? ' btn-gold' : ''}" aria-pressed="${Boolean(p.loudness)}" ${act('music', 'loudness', id)}><span>${t(p.loudness ? 'music.loudnessOn' : 'music.loudnessOff')}</span></button>
    </div>` : ''}`;
  return `<div class="player">
      ${btn('prev', 'prev', 'prev', t('music.prev'))}${btn('play', 'toggle', playing ? 'pause' : 'play', t(playing ? 'music.pause' : 'music.play'), ' is-primary')}${btn('next', 'next', 'next', t('music.next'))}
      ${volume}
    </div>${stop}${extras}`;
}

/** Everything that is playing, at a glance. An item opens its controls. */
function overview(c, active, current) {
  const { d, cfg, t } = c;
  const rows = active.map((id) => {
    const tg = target(d, cfg, id);
    const m = media(c, tg.player);
    const rooms = cfg.music.show.includes('room') ? roomsRaw(c, id) : '';
    const playing = tg.player.state === 'playing';
    return `<li><button type="button" class="now-row${id === current ? ' is-on' : ''}" aria-pressed="${id === current}" ${act('speaker-tab', id, 'list')}>
      ${cover(c, tg, ' is-small')}<span class="now-main"><b>${playerName(c, id)}${rooms ? ` <span>${esc(rooms)}</span>` : ''}</b><small>${[m.title, m.artist].filter(Boolean).join(' · ')}</small></span>
      <span class="now-state${playing ? ' is-playing' : ''}">${icon(playing ? 'play' : 'pause')}<span class="sr-only">${t(`music.state.${tg.player.state}`)}</span></span></button></li>`;
  }).join('');
  return `<ul class="now-list" aria-label="${t('music.overview')}">${rows}</ul>`;
}

/**
 * One card for however many speakers play: the speaker itself when it is the
 * only one, tabs and an overview when there are several, the default speaker
 * when nothing plays. With no speaker configured there is no card.
 */
export function musicCard(c) {
  const { s, d, cfg, t, tn, f } = c;
  const { list, missing } = managed(d, cfg);
  if (!list.length && !missing.length) return '';
  const active = sessions(d, cfg);
  const id = selected(d, cfg, s.musicSel) || defaultPlayer(d, cfg);
  const tg = id ? target(d, cfg, id) : null;
  const many = active.length > 1;

  let side = '';
  if (many) side = `<span>${tn('music.activeCount', active.length)}</span>`;
  else if (tg && tg.player.battery !== undefined) side = `<span>${icon('bolt')}${f.pct(tg.player.battery)}</span>`;
  const tabs = many ? seg(t('music.tabs'), active.map((sid) => ({
    label: playerName(c, sid), icon: KIND_ICON[target(d, cfg, sid).kind], on: sid === id, attrs: act('speaker-tab', sid),
  })), 'seg-scroll') : '';

  let body = '';
  if (tg) {
    const m = media(c, tg.player);
    const members = tg.members.length ? `<p class="members">${t('music.members', { names: membersRaw(c, tg) })}</p>` : '';
    body = `<div class="track">${cover(c, tg)}<div><b>${m.title}</b>${m.artist ? `<small>${m.artist}</small>` : ''}${metaLine(c, tg)}</div></div>
    ${members}${controls(c, tg)}`;
  }
  const group = canGroup(d, cfg) || d.tempGroups.length
    ? `<div class="btn-row">${tg && tg.kind === 'temp' ? `<button type="button" class="btn" ${act('music-dissolve', tg.id)}><span>${t('music.dissolve')}</span></button>` : ''}
      <button type="button" class="btn" ${act('music-group')}>${icon('speakers')}<span>${t('music.group')}</span></button></div>` : '';
  const errors = missing.map((mid) => `<p class="menu-note is-warn">${t('music.missing', { id: String(mid).replace(/_/g, '-') })}</p>`).join('');

  return `<section class="card mini music">
    <div class="eyebrow"><h2>${icon('speaker')}${t('music.title')}</h2>${side}</div>
    ${tabs}${body}${group}${many && cfg.music.overview ? overview(c, active, id) : ''}${errors}
  </section>`;
}

/** Pick speakers, one by one or a room at a time, and play on them as one target. */
export function groupSheet(c) {
  const { s, d, cfg, t, tn } = c;
  const options = groupable(d, cfg);
  const free = options.filter((o) => !o.reason).map((o) => o.id);
  const picked = s.musicPick.filter((id) => free.includes(id));

  const row = (o, withRoom) => {
    const name = playerNameRaw(c, o.id);
    const rooms = withRoom === true ? roomsRaw(c, o.id) : '';
    const state = `${rooms ? `${esc(rooms)} · ` : ''}${o.reason ? t(`music.cannot.${o.reason}`) : t(`music.state.${d.speakers[o.id].state}`)}`;
    return `<li class="tile ed-row${o.reason ? ' is-dim' : ''}"><span class="ic-box">${icon('speaker')}</span>
      <span class="ed-name"><b>${esc(name)}</b><small>${state}</small></span>
      ${toggle({ on: picked.includes(o.id), label: t('music.pick', { name }), action: 'music-pick', arg: o.id, disabled: Boolean(o.reason) })}</li>`;
  };
  // Rooms with a speaker that can be picked come first, one section per room.
  // Everything else follows in one list, so the start button stays near the top.
  const sections = [];
  const placed = new Set();
  d.floors.forEach((fl) => fl.rooms.forEach((roomId) => {
    const own = options.filter((o) => !placed.has(o.id) && (d.rooms[roomId].speakers || []).includes(o.id));
    if (!own.some((o) => !o.reason)) return;
    own.forEach((o) => placed.add(o.id));
    const name = roomNameRaw(c, roomId);
    const all = `<button type="button" class="btn btn-small" ${act('music-pick-room', roomId)}><span>${t('music.pickRoom', { name })}</span></button>`;
    sections.push(`<section>${eyebrow(esc(name), all)}<ul class="ed-list">${own.map(row).join('')}</ul></section>`);
  }));
  const loose = options.filter((o) => !placed.has(o.id) && !o.reason);
  if (loose.length) sections.push(`<section>${eyebrow(t('music.noRoom'))}<ul class="ed-list">${loose.map(row).join('')}</ul></section>`);
  const rest = options.filter((o) => !placed.has(o.id) && o.reason);
  const others = rest.length ? `<section>${eyebrow(t('music.others'))}<ul class="ed-list">${rest.map((o) => row(o, true)).join('')}</ul></section>` : '';

  const groups = d.tempGroups.map((g) => {
    const tg = target(d, cfg, g.id);
    return `<li class="tile ed-row"><span class="ic-box">${icon('speakers')}</span>
      <span class="ed-name"><b>${playerName(c, g.id)}</b><small>${esc(membersRaw(c, tg))}</small></span>
      <button type="button" class="btn" ${act('music-dissolve', g.id)}><span>${t('music.dissolve')}</span></button></li>`;
  }).join('');

  const head = `<div><p class="kicker">${t('music.title')}</p><h2 id="sheet-title">${t('music.group')}</h2><p class="lead">${t('music.groupLead')}</p></div>`;
  return sheet(c, head, `${groups ? `<section>${eyebrow(t('music.tempGroups'))}<ul class="ed-list">${groups}</ul></section>` : ''}
    ${free.length < GROUP_MIN ? `<p class="menu-note is-warn">${t('music.groupNone')}</p>` : ''}${sections.join('')}
    <section><div class="btn-row"><button type="button" class="btn btn-solid"${picked.length < GROUP_MIN ? ' disabled' : ''} ${act('music-group-start')}>${icon('play')}<span>${tn('music.startOn', picked.length)}</span></button></div>
      <p class="muted ed-gap">${t('music.groupNote')}</p></section>${others}`);
}

/** Which players the dashboard manages and how the card behaves. Part of the settings sheet. */
export function musicSettings(c) {
  const { d, cfg, t, tx } = c;
  const m = cfg.music;
  const { missing } = managed(d, cfg);
  const all = Object.keys(d.speakers).sort((a, b) => (d.speakers[a].kind === d.speakers[b].kind ? 0 : d.speakers[a].kind === 'speaker' ? -1 : 1));
  const singles = all.filter((id) => d.speakers[id].kind === 'speaker');

  const flag = (key, ic, disabled) => `<div class="tile ed-row"><span class="ic-box">${icon(ic)}</span>
    <span class="ed-name"><b>${t(`music.cfg.${key}`)}</b><small>${t(`music.cfg.${key}Help`)}</small></span>
    ${toggle({ on: m[key], label: t(`music.cfg.${key}`), action: 'speakers-flag', arg: key, disabled })}</div>`;
  const preferred = select({
    label: t('music.cfg.preferred'), input: 'speakers-preferred',
    options: [{ value: '', label: t('music.cfg.preferredNone'), selected: !m.preferred }].concat(managed(d, cfg).list.map((id) => ({ value: id, label: playerName(c, id), selected: id === m.preferred }))),
  });

  const rows = all.map((id) => {
    const p = d.speakers[id];
    const on = m.players.includes(id);
    const haName = tx(p.nameKey);
    const rooms = roomsFor(c, id);
    const info = [t(`music.kind.${p.kind}`), `<span class="mono">${showId(id)}</span>`, rooms ? esc(rooms) : t('music.noRoom'), t(`music.state.${p.state}`)].join(' · ');
    const memberPick = p.kind === 'group' ? `<div class="ed-members"><p class="field-label">${t('music.cfg.members')}</p>
      ${seg(t('music.cfg.membersOf', { name: haName }), singles.map((sid) => ({ label: playerName(c, sid), on: (m.members[id] || []).includes(sid), attrs: act('speakers-member', id, sid) })), 'seg-wrap')}</div>` : '';
    return `<li class="tile ed-row ed-wrap${on ? '' : ' is-dim'}"><span class="ic-box">${icon(KIND_ICON[p.kind])}</span>
      <span class="ed-name"><b>${esc(haName)}</b><small>${info}</small></span>
      ${textInput(t('music.cfg.nameFor', { name: haName }), 'speakers-name', id, playerNameRaw(c, id))}
      ${toggle({ on, label: t('music.cfg.use', { name: haName }), action: 'speakers-use', arg: id })}${memberPick}</li>`;
  }).join('');
  const missingRows = missing.map((id) => `<li class="tile ed-row is-missing"><span class="ic-box">${icon('alert')}</span>
    <span class="ed-name"><b>${t('entity.notFound')}</b><small class="mono">${showId(id)}</small><small>${t('entity.notFoundHelp')}</small></span>
    <button type="button" class="btn" ${act('speakers-use', id)}><span>${t('roomcfg.remove')}</span></button></li>`).join('');

  return `<section>${eyebrow(t('music.title'), t(m.multi ? 'common.on' : 'common.off'))}
    ${flag('multi', 'speakers', false)}${flag('overview', 'music', !m.multi)}
    <p class="field-label">${t('music.cfg.show')}</p>
    ${seg(t('music.cfg.show'), MUSIC_SHOW.map((key) => ({ label: t(`music.show.${key}`), on: m.show.includes(key), attrs: act('speakers-show', key) })), 'seg-full')}
    <label class="field ed-gap"><span>${t('music.cfg.preferred')}</span>${preferred}</label>
    <p class="muted ed-gap">${t('music.cfg.hint')}</p>
    <ul class="ed-list">${missingRows}${rows}</ul></section>`;
}

/** Rooms of a player whether or not it is managed, for the settings list. */
function roomsFor(c, id) {
  const { d, cfg } = c;
  const p = d.speakers[id];
  const own = p.kind === 'group' ? cfg.music.members[id] || [] : [id];
  return Object.keys(d.rooms).filter((roomId) => own.some((x) => (d.rooms[roomId].speakers || []).includes(x))).map((roomId) => roomNameRaw(c, roomId)).join(', ');
}
