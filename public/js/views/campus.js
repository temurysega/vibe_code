// Экран кампуса: сцена, подсказки, отметки маршрута и быстрые переходы по зонам.
import { post } from '../lib/api.js';
import { session, setPlay } from '../lib/bus.js';
import { esc, plural } from '../lib/format.js';
import { icon } from '../ui/icons.js';
import { modal, toast } from '../ui/overlay.js';
import * as fx from '../ui/fx.js';
import { ROOMS, RULES } from '../shared/catalog.js';
import { Campus, NPC, HOTS } from '../campus/scene.js';

let scene = null;
let zone = null;
let walkTo = null;

function hudZone() {
  if (walkTo) return `<span class="hud-pill walk-status"><span class="z-ic">${icon('arrow', 16)}</span><span>Идём: ${esc(walkTo)}</span></span>`;
  const r = ROOMS.find((x) => x.id === zone);
  const v = session.play.visited;
  return `<span class="hud-pill"><span class="z-ic">${icon(r ? r.icon : 'building', 16)}</span><span>${r ? esc(r.name) : 'Лифт'}</span>
    <span class="route-dots" title="Маршрут: ${v.length} из ${ROOMS.length}">${ROOMS.map((x) => `<i class="${v.includes(x.id) ? 'on' : ''}"></i>`).join('')}</span></span>`;
}

