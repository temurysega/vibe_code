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

function earn() {
  return `<div class="card"><div class="card-title">Как заработать М-коины</div><div class="card-sub">За активность в кабинете и кампусе — оценки за коины не купить и не продать</div>
    <div class="col mt-16" style="gap:10px">${[['building', `+${RULES.visitCoins}`, 'за каждую новую зону кампуса'], ['clock', `+${RULES.focusCoins}`, `за фокус-сессию 25 минут, до ${RULES.focusPerDay} в день`], ['play', `до ${RULES.gameCoinsPerDay}`, 'в день за монеты в забеге'], ['star', '+200', 'за «Первые шаги» первокурсника']]
      .map(([ic, v, d]) => `<div class="row"><span class="way-n">${icon(ic, 18)}</span><b style="font-weight:600;min-width:58px">${v}</b><span class="small muted">${d}</span></div>`).join('')}</div></div>`;
}

function history() {
  const h = play().history || [];
  return `<div class="card"><div class="card-title">История</div>${h.length ? `<div class="list mt-12">${h.slice(0, 8).map((x) => `<div class="list-item"><span class="grow small"><b style="font-weight:500">${esc(x.title)}</b><span class="muted" style="display:block">${esc(when(x.t))}</span></span><span class="money tnum" style="color:${x.amt > 0 ? 'var(--good)' : 'var(--ink)'}">${x.amt > 0 ? '+' : ''}${fmt(x.amt)}</span></div>`).join('')}</div>` : '<div class="empty">Пока пусто</div>'}</div>`;
}

function body() {
  return `<div class="grid g-main">
    <div><div class="section-head"><h2 class="h3">Мерч МГИМО Мании</h2><span class="small muted">Настоящая вещь в Лавке + цифровая копия для аватара</span></div>${kits()}
      <div class="section-head mt-32"><h2 class="h3">Только для аватара</h2><span class="small muted">Цифровые вещи — сразу в гардеробе</span></div>${digital()}</div>
    <div class="col" style="gap:20px"><div class="card card-navy"><span class="muted small">На балансе</span><div class="row mt-8" style="gap:10px">${coin(34)}<span style="font-size:40px;font-weight:500;letter-spacing:-.03em" class="tnum">${fmt(play().coins)}</span></div><p class="muted small mt-8">М-коины не сгорают и не обмениваются на деньги</p></div>${earn()}${history()}</div>
  </div>`;
}

export default {
  title: 'Лавка МГИМО',
  render() {
    return `<div class="container"><div class="page-head"><div><h1 class="h1">Лавка МГИМО</h1><p class="lead">Мерч за М-коины: забронируйте онлайн, заберите на первом этаже. Демо — вещи и выдача вымышлены</p></div></div><div data-body>${body()}</div></div>`;
  },
  mount(el) {
    const box = el.querySelector('[data-body]');
    el.addEventListener('click', async (e) => {
      const k = e.target.closest('[data-kit]');
      if (k && !k.disabled) {
        const kit = KITS.find((x) => x.id === k.dataset.kit);
        let size = kit.sizes.length === 1 ? kit.sizes[0] : null;
        modal.open({
          label: kit.name,
          html: () => `<div class="modal-title">${esc(kit.name)}</div><p class="modal-sub">${esc(kit.desc)}</p>
            ${kit.sizes.length > 1 ? `<div class="field mt-20"><span class="field-label">Размер</span><div class="chips">${kit.sizes.map((s) => `<button class="chip" data-size="${s}">${s}</button>`).join('')}</div></div>` : ''}
            <div class="note mt-20">${icon('pin', 18)}<span>Выдача — Лавка МГИМО, 1 этаж, пн–сб 10:00–19:00. Заявка на выдачу появится в разделе «Заявки»</span></div>
            <div class="modal-foot"><button class="btn btn-primary btn-lg" data-take>${icon('bag', 18)} Забронировать за ${fmt(kit.price)} М-коинов</button><button class="btn btn-secondary btn-lg" data-close>Отмена</button></div>`,
          onMount(m, entry) {
            m.addEventListener('click', async (ev) => {
              const s = ev.target.closest('[data-size]');
              if (s) { size = s.dataset.size; m.querySelectorAll('[data-size]').forEach((x) => x.classList.toggle('on', x === s)); return; }
              if (!ev.target.closest('[data-take]')) return;
              if (!size) { toast('Выберите размер', { icon: 'info' }); return; }
              try {
                const before = play().coins;
                const r = await post('/api/play/kit', { kit: kit.id, size });
                setPlay(r.play);
                modal.close(entry);
                fx.flyCoins(k.getBoundingClientRect(), before, r.play.coins);
                fx.confetti({ n: 100 });
                toast(`«${esc(kit.name)}» забронирован — цифровая копия уже в гардеробе. <a href="#/requests/${r.result.request}">Заявка на выдачу</a>`, { icon: 'bag', ms: 6000 });
                box.innerHTML = body();
              } catch (er) { toast(esc(er.message), { icon: 'alert' }); }
            });
          },
        });
        return;
      }
      const b = e.target.closest('[data-buy]');
      if (b) {
        const [slot, id] = b.dataset.buy.split(':');
        const it = ITEMS.find((i) => i.slot === slot && i.id === id);
        if (play().owned.includes(`${slot}:${id}`)) { location.hash = '#/wardrobe'; return; }
        const ok = await confirm({ title: `Купить «${it.name}»?`, text: `${fmt(it.price)} М-коинов · на балансе ${fmt(play().coins)}`, yes: 'Купить' });
        if (!ok) return;
        try {
          const before = play().coins;
          const r = await post('/api/play/buy', { slot, id });
          setPlay(r.play);
          fx.flyCoins(b.getBoundingClientRect(), before, r.play.coins);
          toast(`«${esc(it.name)}» — в гардеробе. <a href="#/wardrobe">Примерить</a>`, { icon: 'hanger', ms: 5000 });
          box.innerHTML = body();
        } catch (er) { toast(esc(er.message), { icon: 'alert' }); }
      }
    });
    return null;
  },
};
