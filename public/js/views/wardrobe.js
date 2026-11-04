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

function swatches(slot) {
  const it = ITEMS.find((i) => i.slot === slot && i.id === draft[slot]);
  if (!it || !it.colors) return '';
  const pal = slot === 'pet' ? PETC : CLOTH;
  return `<div class="opt-group"><div class="opt-title"><span>Цвет: ${esc(it.name.toLowerCase())}</span></div><div class="swatches">${it.colors.map((c) => `<button class="swatch ${draft[slot + 'Color'] === c ? 'on' : ''}" style="background:${pal[c]}" data-color="${slot}:${c}" aria-label="Цвет ${c}"></button>`).join('')}</div></div>`;
}

function lookTab() {
  const chips = (key, list) => `<div class="chips">${list.map(([id, n]) => `<button class="chip ${draft[key] === id ? 'on' : ''}" data-look="${key}:${id}">${esc(n)}</button>`).join('')}</div>`;
  return `<div class="opt-group"><div class="opt-title">Фигура</div>${chips('body', APPEARANCE.body)}</div>
    <div class="opt-group"><div class="opt-title">Тон кожи</div><div class="swatches">${APPEARANCE.skin.map(([id, c]) => `<button class="swatch ${draft.skin === id ? 'on' : ''}" style="background:${c}" data-look="skin:${id}" aria-label="Тон кожи"></button>`).join('')}</div></div>
    <div class="opt-group"><div class="opt-title">Причёска</div>${tilesLook('hair')}</div>
    <div class="opt-group"><div class="opt-title">Цвет волос</div><div class="swatches">${APPEARANCE.hairColor.map(([id, n]) => `<button class="swatch ${draft.hairColor === id ? 'on' : ''}" style="background:${HAIR[id]}" data-look="hairColor:${id}" aria-label="${esc(n)}" data-tip="${esc(n)}"></button>`).join('')}</div></div>
    <div class="opt-group"><div class="opt-title">Глаза</div>${chips('eyes', APPEARANCE.eyes)}</div>
    <div class="opt-group"><div class="opt-title">Улыбка</div>${chips('mouth', APPEARANCE.mouth)}</div>
    <div class="opt-group"><div class="opt-title">Щёки</div>${chips('cheeks', APPEARANCE.cheeks)}</div>
    ${draft.body === 'm' ? `<div class="opt-group"><div class="opt-title">Борода и усы</div>${chips('facial', APPEARANCE.facial)}</div>` : ''}`;
}

function tilesLook(key) {
  return `<div class="items">${APPEARANCE[key].map(([id, n]) => `<button class="item ${draft[key] === id ? 'on' : ''}" data-look="${key}:${id}"><span class="item-pic">${itemPreview(key, id, null, draft)}</span><span class="item-name">${esc(n)}</span></button>`).join('')}</div>`;
}

function profileTab() {
  const titles = play().titles;
  return `<div class="opt-group"><div class="opt-title">Фон карточки</div>${tiles('backdrop')}</div>
    <div class="opt-group"><div class="opt-title">Узор</div>${tiles('pattern')}</div>
    <div class="opt-group"><div class="opt-title">Рамка аватара</div>${tiles('frame')}</div>
    <div class="opt-group"><div class="opt-title">Эмодзи-статус</div><div class="emoji-grid">${['', ...EMOJIS].map((e) => `<button class="emoji-btn ${prof.emoji === e ? 'on' : ''}" data-emoji="${e}" aria-label="${e || 'Без эмодзи'}">${e || '—'}</button>`).join('')}</div></div>
    <div class="opt-group"><div class="opt-title">Титул</div><div class="chips">${titles.map((t) => `<button class="chip ${prof.title === t.id ? 'on' : ''}" data-title="${t.id}" ${t.unlocked ? '' : `data-tip="${esc(t.how || '')}"`} style="${t.unlocked ? '' : 'opacity:.55'}">${t.unlocked ? '' : icon('lock', 13)} ${esc(t.name)}</button>`).join('')}</div></div>
    <label class="field opt-group"><span class="field-label">Имя питомца</span><input class="input" data-petname maxlength="24" value="${esc(petName)}"></label>`;
}

