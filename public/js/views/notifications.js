// Уведомления: деканат, расписание, дедлайны, заявки и оценки в одной ленте с фильтрами и настройками.
import { get, post, patch } from '../lib/api.js';
import { session, setUnread, setPlay, on } from '../lib/bus.js';
import { esc, when, dateOfTs, relDay, dayShort } from '../lib/format.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/overlay.js';
import { replaceKeepingFocus } from '../ui/focus.js';
import { skeleton, errorBox } from './common.js';

const KIC = { news: 'megaphone', schedule: 'calendar', deadline: 'clock', request: 'doc', grade: 'chart', system: 'spark' };
const FILTERS = [['all', 'Все'], ['unread', 'Непрочитанные'], ['news', 'Деканат'], ['schedule', 'Расписание'], ['deadline', 'Дедлайны'], ['request', 'Заявки'], ['grade', 'Оценки']];
let list = [];
let unread = 0;
let filter = 'all';
// Лента показывается порциями: на телефоне не нужно листать сотню карточек до настроек
const PAGE = 12;
let limit = PAGE;

function items() {
  const all = list.filter((n) => filter === 'all' || (filter === 'unread' ? !n.read : n.kind === filter));
  if (!all.length) return `<div class="card empty"><span class="emoji">🔕</span>${filter === 'unread' ? 'Все уведомления прочитаны' : 'Здесь пока ничего нет'}</div>`;
  const shown = all.slice(0, limit);
  const rest = all.length - shown.length;
  let day = '';
  const more = rest > 0 ? `<button class="btn btn-secondary btn-block mt-12" data-more-n data-focus-key="notification-more">${icon('down', 18)} Показать ещё ${Math.min(rest, PAGE)}${rest > PAGE ? ` из ${rest}` : ''}</button>` : '';
  return `<div class="n-list">${shown.map((n) => {
    const d = dateOfTs(n.at);
    const sep = d !== day ? `<div class="n-day">${esc(relDay(d) === 'сегодня' || relDay(d) === 'вчера' ? relDay(d) : dayShort(d))}</div>` : '';
    day = d;
    return `${sep}<button class="n-item ${n.read ? '' : 'unread'} ${n.important ? 'important' : ''}" data-n="${n.id}" data-focus-key="notification-${n.id}" data-link="${esc(n.link || '')}">
      <span class="notif-ic">${icon(KIC[n.kind] || 'bell', 20)}</span>
      <span style="min-width:0"><b>${esc(n.title)}</b>${n.body ? `<span class="small" style="display:block;margin-top:4px;color:var(--text)">${esc(n.body)}</span>` : ''}
        <span class="n-meta"><span class="badge badge-gray">${esc(n.kindLabel)}</span><span>${esc(n.scope)}</span>${n.author ? `<span>${esc(n.author)}</span>` : ''}<span>${esc(when(n.at))}</span>${n.important ? `<span class="badge badge-gold">${icon('star', 11)} важное</span>` : ''}</span></span>
    </button>`;
  }).join('')}</div>${more}`;
}

function prefs() {
  const p = session.play ? session.play.prefs : {};
  const row = (k, t, d) => `<label class="pref-row"><span class="grow"><b>${t}</b><span class="small muted">${d}</span></span><span class="switch"><input type="checkbox" data-pref="${k}" data-focus-key="notification-pref-${k}" ${p[k] ? 'checked' : ''}><i></i></span></label>`;
  return `<div class="card"><div class="card-title">Куда присылать</div><div class="card-sub">В кабинете уведомления видны всегда</div>
    <div class="mt-12">${row('push', 'Push на телефон', 'Когда кабинет установлен как приложение')}${row('email', 'Почта', 'Короткое письмо о важном')}${row('telegram', 'Telegram-бот', 'Концепт: бот деканата МГИМО Мании')}${row('quietHours', 'Тихие часы 23:00–08:00', 'Ночью — только срочное')}</div>
    <div class="note mt-12">${icon('info', 18)}<span>В демо каналы — переключатели концепта: письма и сообщения не отправляются</span></div></div>`;
}

function body() {
  return `<div class="notif-page"><div>
      <div class="row-wrap" style="justify-content:space-between;margin-bottom:16px"><div class="chips" role="group" aria-label="Фильтры уведомлений">${FILTERS.map(([id, n]) => {
        const c = id === 'all' ? list.length : id === 'unread' ? unread : list.filter((x) => x.kind === id).length;
        return `<button class="chip ${filter === id ? 'on' : ''}" data-f="${id}" data-focus-key="notification-filter-${id}" aria-pressed="${filter === id}">${n}${c ? ` <span class="count">${c}</span>` : ''}</button>`;
      }).join('')}</div>
      ${unread ? `<button class="btn btn-secondary btn-sm" data-readall data-focus-key="notification-readall">${icon('check', 16)} Прочитать все</button>` : ''}</div>
      ${items()}</div>
    <aside class="sticky-side">${prefs()}
      <div class="card"><div class="card-title">Без пропусков</div><p class="muted mt-8">О переносе пары, новом дедлайне и готовой справке кабинет напомнит сам: за 3 дня до срока и в день срока.</p></div></aside></div>`;
}

export default {
  title: 'Уведомления',
  render() {
    return `<div class="container"><div class="page-head"><div><h1 class="h1">Уведомления</h1><p class="lead">Новости деканата, изменения расписания, дедлайны и статусы заявок</p></div></div><div data-body>${skeleton(4, 90)}</div></div>`;
  },
  async mount(el) {
    filter = 'all';
    limit = PAGE;
    const box = el.querySelector('[data-body]');
    const paint = () => replaceKeepingFocus(box, body(), { fallback: `[data-f="${filter}"]` });
    const load = async () => {
      try {
        const r = await get('/api/notifications');
        list = r.list; unread = r.unread;
        setUnread(unread);
        paint();
      } catch (e) { if (e.status !== 401) replaceKeepingFocus(box, errorBox(e), { fallback: '[data-retry]' }); }
    };
    await load();
    const off = on('notif', load);
    el.addEventListener('click', async (e) => {
      const f = e.target.closest('[data-f]');
      if (f) { filter = f.dataset.f; limit = PAGE; paint(); return; }
      const more = e.target.closest('[data-more-n]');
      if (more) {
        const first = list.filter((n) => filter === 'all' || (filter === 'unread' ? !n.read : n.kind === filter))[limit];
        limit += PAGE;
        paint();
        // Фокус — на первую из новых карточек, чтобы клавиатура и экранный диктор продолжили с неё
        const next = first && box.querySelector(`[data-n="${first.id}"]`);
        if (next) next.focus();
        return;
      }
      if (e.target.closest('[data-readall]')) {
        const r = await post('/api/notifications/read', { all: true }).catch((er) => { toast(esc(er.message), { icon: 'alert' }); return null; });
        if (r) { toast('Все уведомления прочитаны'); load(); }
        return;
      }
      const n = e.target.closest('[data-n]');
      if (n) {
        const id = Number(n.dataset.n);
        const item = list.find((x) => x.id === id);
        if (item && !item.read) {
          try { const r = await post('/api/notifications/read', { ids: [id] }); setUnread(r.unread); }
          catch (er) { toast(esc(er.message), { icon: 'alert' }); return; }
          item.read = true; unread = Math.max(0, unread - 1);
        }
        if (n.dataset.link && n.dataset.link !== '#/notifications') location.hash = n.dataset.link;
        else paint();
      }
    });
    el.addEventListener('change', async (e) => {
      const p = e.target.closest('[data-pref]');
      if (!p) return;
      try {
        const r = await patch('/api/me/prefs', { [p.dataset.pref]: p.checked });
        if (session.play) setPlay(Object.assign({}, session.play, { prefs: r.prefs }));
        toast('Настройка сохранена');
      } catch (er) { p.checked = !p.checked; toast(esc(er.message), { icon: 'alert' }); }
    });
    return off;
  },
};
