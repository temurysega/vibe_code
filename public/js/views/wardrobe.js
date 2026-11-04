// Гардероб: примерочная с зеркалом. Внешность бесплатна, вещи открываются за учёбу, прогулку и забег.
import { patch, post } from '../lib/api.js';
import { session, setPlay } from '../lib/bus.js';
import { esc, fmt } from '../lib/format.js';
import { icon, coin } from '../ui/icons.js';
import { modal, toast, confirm } from '../ui/overlay.js';
import * as fx from '../ui/fx.js';
import { svg as avatarSvg, pet as petSvg, backdrop, itemPreview, applyBody, CLOTH, BACKDROPS, SKIN, HAIR } from '../art/avatar.js';
import { APPEARANCE, ITEMS, SLOTS, PROFILE_SLOTS, EMOJIS, itemState, keyOf } from '../shared/catalog.js';

const PETC = { orange: '#F2A65A', gray: '#9EA4AB', black: '#34343A', cream: '#F1DFC2', sand: '#D9AE74', brown: '#8A5A3B', white: '#F2F2F0' };
const TABS = [['look', 'Внешность'], ...SLOTS, ['profile', 'Профиль']];
let draft = null;
let prof = null;
let petName = '';
let tab = 'look';

const play = () => session.play;
const changed = () => JSON.stringify(draft) !== JSON.stringify(play().av) || JSON.stringify(prof) !== JSON.stringify(play().prof) || petName !== play().petName;
const ctx = () => ({ excellent: play().excellent });

function tagOf(st) {
  if (st.kind === 'buy') return `${coin(14)} ${fmt(st.price)}`;
  if (st.kind === 'kit') return `${icon('bag', 12)} Лавка`;
  if (st.kind === 'locked') return `${icon('lock', 12)} ${esc(st.label)}`;
  if (st.kind === 'owned') return `${icon('check', 12, 2.4)} ${esc(st.label)}`;
  return '';
}

function tiles(slot) {
  const list = ITEMS.filter((i) => i.slot === slot);
  return `<div class="items">${list.map((it) => {
    const st = itemState(it, play(), ctx());
    const on = (PROFILE_SLOTS.some(([s]) => s === slot) ? prof[slot] : draft[slot]) === it.id;
    let pic;
    if (slot === 'pet') pic = it.id === 'none' ? '<span class="emoji">🚫</span>' : petSvg(it.id, it.colors ? (draft.pet === it.id ? draft.petColor : it.colors[0]) : '');
    else if (slot === 'backdrop') pic = backdrop(it.id, prof.pattern, { w: 120, h: 120, cy: 60, r0: 10, dense: false });
    else if (slot === 'pattern') pic = backdrop(prof.backdrop, it.id, { w: 120, h: 120, cy: 60, r0: 4 });
    else if (slot === 'frame') pic = `<span class="ava-w f-${it.id}" style="--s:84px"><span class="ava" style="--ab1:${BACKDROPS[prof.backdrop].c1};--ab2:${BACKDROPS[prof.backdrop].c2}">${avatarSvg(draft, { view: 'bust' })}</span></span>`;
    else pic = itemPreview(slot, it.id, it.colors ? (draft[slot] === it.id ? draft[slot + 'Color'] : it.colors[0]) : null, draft);
    return `<button class="item ${on ? 'on' : ''} ${st.owned ? '' : 'locked'}" data-item="${slot}:${it.id}" ${st.hint ? `data-tip="${esc(st.hint)}"` : ''}>
      ${!st.owned && st.kind === 'locked' ? `<span class="lock">${icon('lock', 13)}</span>` : st.kind === 'owned' ? `<span class="owned-mark">${icon('check', 12, 2.6)}</span>` : ''}
      <span class="item-pic">${pic}</span><span class="item-name">${esc(it.name)}</span><span class="item-tag">${tagOf(st)}</span></button>`;
  }).join('')}</div>`;
}

