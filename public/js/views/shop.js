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

