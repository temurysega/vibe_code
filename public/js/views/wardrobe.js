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

