// Лавка МГИМО: мерч с цифровой копией и вещи только для аватара. М-коины — за активность, не за оценки.
import { post } from '../lib/api.js';
import { session, setPlay } from '../lib/bus.js';
import { esc, fmt, when } from '../lib/format.js';
import { icon, coin, money } from '../ui/icons.js';
import { modal, toast, confirm } from '../ui/overlay.js';
import * as fx from '../ui/fx.js';
import { itemPreview, svg as avatarSvg, pet as petSvg, backdrop } from '../art/avatar.js';
import { ITEMS, KITS, RULES, itemState } from '../shared/catalog.js';

const play = () => session.play;

// Иллюстрация мерча: вещь крупно и аватар в ней в кружке
function kitPic(kit) {
  const [slot, id] = kit.twin.split(':');
  const av = Object.assign({}, play().av, { [slot]: id });
  return `<div class="prod-pic" style="background:var(--navy-4)">${itemPreview(slot, id, null, play().av)}<span class="twin">${avatarSvg(av, { view: 'bust' })}</span></div>`;
}

function kits() {
  return `<div class="shop-grid">${KITS.map((k) => {
    const left = play().stock[k.id];
    const have = play().owned.includes(k.twin);
    return `<button class="prod" data-kit="${k.id}" ${have ? 'disabled style="opacity:.7"' : ''}>${kitPic(k)}
      <div><div class="prod-name">${esc(k.name)}</div><div class="prod-desc">${esc(k.desc)}</div></div>
      <div class="prod-foot"><span class="prod-price">${money(k.price, 20)}</span><span class="stock">${have ? 'уже у вас' : left > 0 ? `осталось ${left}` : 'закончились'}</span></div></button>`;
  }).join('')}</div>`;
}

function digital() {
  const list = ITEMS.filter((i) => i.src === 'digital');
  return `<div class="shop-grid">${list.map((it) => {
    const st = itemState(it, play(), { excellent: play().excellent });
    const pic = it.slot === 'pet' ? petSvg(it.id) : it.slot === 'backdrop' ? backdrop(it.id, 'globes', { w: 200, h: 150, cy: 75, r0: 20 }) : itemPreview(it.slot, it.id, it.colors ? it.colors[0] : null, play().av);
    return `<button class="prod" data-buy="${it.slot}:${it.id}"><div class="prod-pic">${pic}</div><div class="prod-name">${esc(it.name)}</div>
      <div class="prod-foot"><span class="prod-price">${money(it.price, 20)}</span><span class="stock">${st.owned ? 'куплено' : 'только для аватара'}</span></div></button>`;
  }).join('')}</div>`;
}

