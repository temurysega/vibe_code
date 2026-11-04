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

export default {
  title: 'Перерыв',
  render() {
    const p = session.play;
    return `<div class="container"><div class="page-head"><div><h1 class="h1">Перерыв</h1><p class="lead">«Бегом на пару»: аватар бежит по коридору корпуса к аудитории. 5 минут в день — и снова за учёбу</p></div>
      <span class="badge badge-gold" style="height:34px;font-size:14px">${icon('star', 14)} Рекорд ${fmt(p.game.best)}</span></div>
      <div class="grid g-main">
        <div class="card runner-card"><div class="runner-head"><div class="card-title">Бегом на пару</div><span class="limit-clock" data-left>${icon('clock', 15)} ${clock(p.gameLeft)} из 5:00</span></div>
          <div class="runner-wrap" tabindex="0" aria-label="Игра «Бегом на пару»: стрелки — дорожка, пробел — прыжок, вниз — подкат"><canvas></canvas><div class="runner-overlay"></div></div>
          <div class="touch-pad"><button data-pad="left" aria-label="Влево">${icon('left', 22)}</button><button data-pad="jump" aria-label="Прыжок">${icon('up', 22)}</button><button data-pad="slide" aria-label="Подкат">${icon('down', 22)}</button><button data-pad="right" aria-label="Вправо">${icon('right', 22)}</button></div>
          <div class="runner-foot"><span class="muted small">${icon('info', 14)} Кофе ☕ — неуязвимость, зачётка 📗 — очки ×2. Растяжку «Ремонт» — подкатом, скамейку — прыжком</span></div></div>
        <div class="col" style="gap:20px">${side()}</div>
      </div></div>`;
  },
  mount(el) {
    const p = session.play;
    const leftEl = el.querySelector('[data-left]');
    const runner = new Runner(el.querySelector('.runner-wrap'), {
      av: p.av, pet: p.av.pet, petColor: p.av.petColor, best: p.game.best, left: p.gameLeft,
      async onStart() {
        try { return await post('/api/game/start'); } catch (e) { toast(esc(e.message), { icon: 'clock' }); return { left: e.data && e.data.left != null ? e.data.left : 0 }; }
      },
      async onFinish(run, score, coins) {
        const before = session.play.coins;
        const r = await post('/api/game/finish', { run, score, coins });
        setPlay(r.play);
        leftEl.innerHTML = `${icon('clock', 15)} ${clock(r.result.left)} из 5:00`;
        leftEl.classList.toggle('low', r.result.left < 30);
        if (r.result.coins) { const pill = document.querySelector('[data-bal]'); if (pill) fx.flyCoins(el.querySelector('.runner-wrap').getBoundingClientRect(), before, r.play.coins); }
        if (r.result.record) fx.confetti({ n: 120 });
        el.querySelector('.col').innerHTML = side();
        return r.result;
      },
    });
    // Обновляем отображение остатка каждую секунду, пока идёт забег
    const t = setInterval(() => { if (runner.state === 'run') { leftEl.innerHTML = `${icon('clock', 15)} ${clock(Math.max(0, runner.left))} из 5:00`; leftEl.classList.toggle('low', runner.left < 30); } }, 500);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pad]');
      if (!b) return;
      const a = b.dataset.pad;
      if (a === 'left') runner.move(-1);
      if (a === 'right') runner.move(1);
      if (a === 'jump') runner.jump();
      if (a === 'slide') runner.slide();
    });
    get('/api/play').then((r) => setPlay(r.play)).catch(() => {});
    return () => { clearInterval(t); runner.destroy(); };
  },
};
