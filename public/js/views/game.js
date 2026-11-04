// Перерыв: забег «Бегом на пару». Пять минут в день — лимит хранит сервер, а не браузер.
import { post, get } from '../lib/api.js';
import { session, setPlay } from '../lib/bus.js';
import { esc, fmt } from '../lib/format.js';
import { icon, coin } from '../ui/icons.js';
import { toast } from '../ui/overlay.js';
import * as fx from '../ui/fx.js';
import { ITEMS, RULES } from '../shared/catalog.js';
import { Runner } from '../game/runner.js';

const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function side() {
  const p = session.play;
  const rewards = ITEMS.filter((i) => i.src === 'game').sort((a, b) => a.need - b.need);
  return `<div class="card"><div class="card-title">Награды забега</div><div class="card-sub">Открываются рекордом — купить их нельзя</div>
      <div class="col mt-16" style="gap:12px">${rewards.map((it) => { const ok = p.game.best >= it.need; return `<div><div class="bar-label"><span>${ok ? icon('check', 14, 2.4) : icon('lock', 14)} ${esc(it.name)}</span><span class="muted tnum">${fmt(Math.min(p.game.best, it.need))} / ${fmt(it.need)}</span></div><div class="bar bar-gold"><i style="width:${Math.min(100, (p.game.best / it.need) * 100)}%"></i></div></div>`; }).join('')}</div></div>
    <div class="card"><div class="card-title">Почему 5 минут</div><p class="muted mt-8">Перерыв — чтобы переключиться, а не залипнуть. Время забега считает сервер: обновление страницы или другая вкладка его не обнулят. М-коинов за день — не больше ${RULES.gameCoinsPerDay}</p></div>`;
}

