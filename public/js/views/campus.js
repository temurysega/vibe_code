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

function zoneCards() {
  const v = session.play.visited;
  return ROOMS.map((r) => `<button class="zone ${zone === r.id ? 'here' : ''}" data-zone="${r.id}">
    <span class="zone-ic">${icon(r.icon, 18)}</span><b>${esc(r.name)}</b><span class="small muted">${esc(r.desc)}</span>
    ${v.includes(r.id) ? `<span class="stamp-ok">${icon('check', 12, 2.6)}</span>` : ''}</button>`).join('');
}

async function firstVisit(z) {
  if (session.play.visited.includes(z)) return;
  try {
    const r = await post('/api/play/visit', { zone: z });
    const before = session.play.coins;
    setPlay(r.play);
    const res = r.result;
    if (!res || !res.first) return;
    const room = ROOMS.find((x) => x.id === z);
    toast(`${esc(room.name)} · +${res.coins} М-коинов${res.unlocked.length ? ' · открыто: ' + esc(res.unlocked.join(', ')) : ''}`, { coin: true, ms: 4200 });
    const pill = document.querySelector('[data-bal]');
    if (pill) fx.flyCoins(pill.getBoundingClientRect(), before, r.play.coins);
    if (res.all) setTimeout(() => { fx.confetti({ n: 180 }); toast('Весь кампус пройден! Открыты панама, ёжик и рамка «Исследователь»', { icon: 'trophy', ms: 5600 }); }, 900);
  } catch (e) { /* повторим при следующем входе в зону */ }
}

function npcModal(z) {
  const n = NPC[z];
  const room = ROOMS.find((r) => r.id === z);
  modal.open({
    label: n.name,
    html: `<span class="eyebrow">${esc(room.name)} · ${esc(n.role)}</span><div class="modal-title mt-8">${esc(n.name)}</div>
      <div class="note note-navy mt-16" style="font-size:16px">${icon('chat', 20)}<span>«${esc(n.say)}»</span></div>
      <div class="modal-foot"><a class="btn btn-primary btn-lg" href="${room.link}">Открыть «${esc(room.name)}» ${icon('arrow', 18)}</a><button class="btn btn-secondary btn-lg" data-close>Позже</button></div>`,
  });
}

function act(t) {
  if (t.kind === 'npc') { npcModal(t.id); return; }
  switch (t.act) {
    case 'wardrobe': toast('Добро пожаловать в примерочную', { icon: 'hanger' }); location.hash = '#/wardrobe'; break;
    case 'tickets':
      modal.open({ label: 'Гардероб', html: `<div class="modal-title">Номерок № 117</div><p class="modal-sub">Гардероб работает с 8:00 до 21:00. А здесь, в кампусе кабинета, в гардеробе меняют образ аватара — всё базовое бесплатно</p><div class="modal-foot"><a class="btn btn-primary btn-lg" href="#/wardrobe">${icon('hanger', 18)} В примерочную</a><button class="btn btn-secondary btn-lg" data-close>Закрыть</button></div>` });
      break;
    case 'request': location.hash = '#/requests/new'; break;
    case 'requests': location.hash = '#/requests'; break;
    case 'schedule': location.hash = '#/schedule'; break;
    case 'grades': location.hash = '#/grades'; break;
    case 'shop': location.hash = '#/shop'; break;
    case 'clubs':
      modal.open({ label: 'Студклубы', size: 'wide', html: `<div class="modal-title">Студенческие клубы</div><p class="modal-sub">Объявления клубов приходят в уведомления — расписание встреч ниже (демо)</p>
        <div class="col mt-20" style="gap:10px">${[['globe', 'Модель ООН', 'Пятница, 17:00 · ауд. 1001 · регистрация делегатов открыта'], ['chat', 'Дебатный клуб', 'Среда, 18:20 · ауд. 2014'], ['heart', 'Волонтёрский центр', 'Набор на зимний фестиваль языков'], ['bolt', 'Спортклуб', 'Волейбол и баскетбол — спорткомплекс, по записи'], ['book', 'Языковые клубы', 'Разговорные встречи на 12 языках — каждый вторник']]
          .map(([ic, tt, d]) => `<div class="row" style="align-items:flex-start;background:var(--surface);border-radius:14px;padding:12px 14px"><span class="way-n">${icon(ic, 18)}</span><div><b style="font-weight:500">${tt}</b><div class="small muted">${d}</div></div></div>`).join('')}</div>
        <div class="modal-foot"><a class="btn btn-primary btn-lg" href="#/notifications">${icon('bell', 18)} Объявления</a><button class="btn btn-secondary btn-lg" data-close>Закрыть</button></div>` });
      break;
    case 'focus': {
      const p = session.play;
      modal.open({ label: 'Тихий час', html: `<div class="modal-title">Тихий час в библиотеке</div><p class="modal-sub">25 минут учёбы без отвлечений. ${esc(p.petName)} посидит рядом и подрастёт${p.focusLeftToday ? `, а вы получите +${RULES.focusCoins} М-коинов` : ''}</p>
        <div class="modal-foot"><button class="btn btn-primary btn-lg" data-start autofocus>${icon('clock', 18)} Начать 25 минут</button><button class="btn btn-secondary btn-lg" data-close>Позже</button></div>`,
        onMount(el, entry) {
          el.querySelector('[data-start]').onclick = async () => {
            try { const r = await post('/api/play/focus', { action: 'start' }); setPlay(r.play); modal.close(entry); toast('Таймер запущен — он виден на главной в карточке питомца', { icon: 'clock' }); location.hash = '#/home'; } catch (e) { toast(esc(e.message), { icon: 'alert' }); }
          };
        } });
      break;
    }
    default: break;
  }
}

