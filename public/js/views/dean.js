// Кабинет сотрудника деканата: очередь заявок факультета, решения с комментарием,
// объявления студентам и изменения расписания. Чужие факультеты сотруднику не видны.
import { get, post, patch } from '../lib/api.js';
import { session } from '../lib/bus.js';
import { esc, when, stamp, dayShort, mskNow, num } from '../lib/format.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/overlay.js';
import { skeleton, errorBox, statusPill } from './common.js';

const ACTION = {
  in_work: ['Взять в работу', 'btn-primary', 'hourglass'],
  ready: ['Готово', 'btn-primary', 'check'],
  approved: ['Одобрить', 'btn-primary', 'check'],
  issued: ['Выдано лично', 'btn-secondary', 'check'],
  rejected: ['Отклонить', 'btn-danger', 'ban'],
};
const FIELD = { place: 'Куда', copies: 'Экз.', country: 'Страна', dates: 'Даты', office: 'Военкомат', purpose: 'Цель', from: 'С', to: 'По', reason: 'Причина', note: 'Комментарий', details: 'Подробности', disciplines: 'Экзамены', partner: 'Вуз', term: 'Семестр', motivation: 'Мотивация', discipline: 'Дисциплина', slot: 'Дата', lang: 'Язык', size: 'Размер' };

let ov = null;
let list = [];
let filter = 'active';
let tab = 'queue';
let query = '';   // поиск по номеру заявки
let single = null; // прямая ссылка #/dean/<id>

function kpis() {
  const c = ov.counts;
  const k = (v, l, s) => `<div class="card kpi card-tight"><span class="small muted">${l}</span><span class="kpi-v">${v}${s ? ` <small>${s}</small>` : ''}</span></div>`;
  return `<div class="dean-kpi">${k(c.submitted || 0, 'Новые заявки')}${k(c.in_work || 0, 'В работе')}${k(ov.avgHours != null ? num(ov.avgHours, 1) : '—', 'Среднее время ответа', 'ч')}${k(ov.overdue, 'Просрочено', ov.overdue ? '⚠' : '')}</div>`;
}

function payload(p) {
  return Object.entries(p).filter(([k]) => k !== 'kit').map(([k, v]) => `<span>${esc(FIELD[k] || k)}: <b>${esc(k === 'lang' ? (v === 'en' ? 'английский' : 'русский') : /^\d{4}-\d{2}-\d{2}$/.test(v) ? dayShort(v) : v)}</b></span>`).join('');
}

function queue() {
  const shown = list;
  const search = `<form class="row-wrap dean-search" data-search role="search" style="gap:8px;margin-bottom:12px">
      <label class="sr" for="dean-q">Номер заявки</label>
      <input class="input" id="dean-q" name="q" value="${esc(query)}" placeholder="Номер заявки, например 2026/01212" autocomplete="off" style="max-width:320px">
      <button class="btn btn-secondary btn-sm" type="submit">${icon('search', 16)} Найти</button>
      ${query ? '<button class="btn btn-ghost btn-sm" type="button" data-search-clear>Вся очередь</button>' : ''}</form>`;
  const head = single
    ? `<div class="row-wrap" style="justify-content:space-between;margin-bottom:14px"><a class="btn btn-ghost btn-sm" href="#/dean">${icon('back', 16)} Вся очередь</a><span class="small muted">Заявка по прямой ссылке</span></div>`
    : `${search}<div class="row-wrap" style="justify-content:space-between;margin-bottom:14px">${query ? `<span class="small muted" role="status">Найдено по номеру «${esc(query)}»: ${list.length}</span>` : `<div class="seg">${[['active', 'Активные'], ['done', 'Завершённые'], ['all', 'Все']].map(([id, n]) => `<button class="${filter === id ? 'on' : ''}" data-filter="${id}">${n}</button>`).join('')}</div>`}
      <span class="small muted">${icon('refresh', 14)} обновляется сама каждые 10 секунд — набранный комментарий сохранится</span></div>`;
  return `${head}
    ${shown.length ? `<div class="queue">${shown.map((r) => `<div class="q-item ${r.overdue ? 'overdue' : ''}" data-req="${r.id}">
      <div class="q-top"><span class="cat-ic" style="width:42px;height:42px;background:#fff">${icon(r.icon || 'doc', 20)}</span>
        <div class="grow"><b>${esc(r.title)}</b><div class="small muted">№ <a class="link" href="#/dean/${r.id}" aria-label="Прямая ссылка на заявку № ${esc(r.number)}">${esc(r.number)}</a> · ${esc(r.student.name)} · ${esc(r.student.group)} · ${esc(when(r.createdAt))}${r.delivery !== 'none' ? ` · ${r.delivery === 'electronic' ? 'электронная' : 'бумажная'}` : ''}</div></div>
        ${r.overdue ? `<span class="badge badge-red">${icon('alert', 12)} срок ${esc(stamp(r.dueAt))}</span>` : ''}${statusPill(r.status, r.statusLabel)}</div>
      ${Object.keys(r.payload).length ? `<div class="q-payload">${payload(r.payload)}</div>` : ''}
      ${r.actions.length ? `<label class="small muted q-comment-label" for="c-${r.id}">Комментарий студенту по заявке № ${esc(r.number)}${r.actions.includes('rejected') ? ' — обязателен при отказе' : ''}</label><div class="q-actions"><input class="input" id="c-${r.id}" data-comment placeholder="Например: данные проверены" maxlength="500">${r.actions.map((a) => `<button class="btn btn-sm ${ACTION[a][1]}" data-act="${a}">${icon(ACTION[a][2], 16)} ${ACTION[a][0]}</button>`).join('')}</div>` : r.deanComment ? `<div class="small muted">${icon('chat', 14)} ${esc(r.deanComment)}</div>` : ''}
    </div>`).join('')}</div>` : (query ? `<div class="card empty" role="status">Заявка с номером «${esc(query)}» на вашем факультете не найдена</div>` : '<div class="card empty"><span class="emoji">🎉</span>Очередь пуста — все заявки обработаны</div>')}`;
}

function announce() {
  return `<div class="dean-forms"><form class="card" data-ann novalidate><div class="card-title">Объявление студентам</div><div class="card-sub">Появится в уведомлениях сразу — без рассылок в чатах</div>
      <label class="field" data-field="title"><span class="field-label">Заголовок</span><input class="input" name="title" maxlength="120" placeholder="Например, Встреча с деканом"></label>
      <label class="field" data-field="body"><span class="field-label">Текст</span><textarea class="input" name="body" maxlength="1000" placeholder="Когда, где и что взять с собой"></textarea></label>
      <label class="field" data-field="audience"><span class="field-label">Кому</span><select class="input" name="aud"><option value="faculty">Весь факультет ${esc(ov.staff.faculty.short)}</option>${ov.groups.map((g) => `<option value="${esc(g.code)}">Группа ${esc(g.code)} · ${g.course} курс</option>`).join('')}</select></label>
      <label class="check"><input type="checkbox" name="important"> Важное — выделить в ленте</label>
      <div><button class="btn btn-primary" type="submit">${icon('megaphone', 18)} Опубликовать</button></div></form>
    <form class="card" data-chg novalidate><div class="card-title">Изменение расписания</div><div class="card-sub">Группа увидит отметку в расписании и получит уведомление</div>
      <div class="grid g-2" style="gap:12px"><label class="field"><span class="field-label">Группа</span><select class="input" name="group">${ov.groups.map((g) => `<option>${esc(g.code)}</option>`).join('')}</select></label>
        <label class="field" data-field="date"><span class="field-label">Дата</span><input class="input" type="date" name="date" value="${mskNow().date}" min="${mskNow().date}"></label></div>
      <div class="pair-pick" data-pairs><span class="small muted">Выберите группу и дату — покажем пары</span></div>
      <div class="seg"><label style="display:contents"><input type="radio" name="type" value="cancel" class="sr" checked><span class="chg-type on" data-t="cancel" style="height:36px;padding:0 16px;border-radius:100px;display:inline-flex;align-items:center;cursor:pointer">Отмена</span></label><label style="display:contents"><input type="radio" name="type" value="room" class="sr"><span class="chg-type" data-t="room" style="height:36px;padding:0 16px;border-radius:100px;display:inline-flex;align-items:center;cursor:pointer">Новая аудитория</span></label></div>
      <label class="field" data-field="room" hidden data-roomf><span class="field-label">Аудитория</span><input class="input" name="room" inputmode="numeric" maxlength="4" placeholder="Например, 2014"></label>
      <label class="field" data-field="reason"><span class="field-label">Причина</span><input class="input" name="reason" maxlength="300" placeholder="Её увидят студенты"></label>
      <div><button class="btn btn-primary" type="submit">${icon('calendar', 18)} Отметить изменение</button></div></form></div>`;
}

async function loadPairs(el) {
  const f = el.querySelector('[data-chg]');
  const box = f.querySelector('[data-pairs]');
  box.innerHTML = '<span class="small muted">Загружаем…</span>';
  try {
    const { day } = await get(`/api/dean/day?group=${encodeURIComponent(f.elements.group.value)}&date=${encodeURIComponent(f.elements.date.value)}`);
    const ok = day.items.filter((x) => x.status === 'normal');
    box.innerHTML = day.holiday ? `<span class="small muted">${esc(day.holiday)} — пар нет</span>` : ok.length ? ok.map((it, i) => `<label class="pair-opt"><input type="radio" name="pair" value="${it.lessonId}:${it.pair}" ${i === 0 ? 'checked' : ''}><span><b style="font-weight:500">${it.pair} пара, ${it.start}</b> · ${esc(it.discipline)} · ауд. ${esc(it.room)}</span></label>`).join('') : '<span class="small muted">В этот день у группы нет пар без изменений</span>';
  } catch (e) { box.innerHTML = `<span class="small muted">${esc(e.message)}</span>`; }
}

async function audit() {
  try {
    const { log } = await get('/api/dean/audit');
    const L = { login: 'Вход', logout: 'Выход', request_in_work: 'Взята в работу', request_ready: 'Справка готова', request_approved: 'Одобрено', request_rejected: 'Отклонено', request_issued: 'Выдано', announcement: 'Объявление', schedule_cancel: 'Отмена пары', schedule_room: 'Смена аудитории', password_change_demo: 'Проверка пароля (демо)' };
    return `<div class="card"><div class="card-title">Журнал действий</div><div class="card-sub">Каждое решение сохраняется: кто, что и когда</div><div class="list mt-12">${log.map((x) => `<div class="list-item small"><span class="muted" style="min-width:120px">${esc(stamp(x.created_at))}</span><b style="font-weight:500">${esc(L[x.action] || x.action)}</b><span class="muted">${esc(x.target || '')}</span></div>`).join('') || '<div class="empty">Пока пусто</div>'}</div></div>`;
  } catch (e) { return errorBox(e); }
}

export default {
  title: 'Деканат',
  render() {
    const u = session.user;
    return `<div class="container"><div class="page-head"><div><span class="eyebrow">${esc(u.facultyName || '')}</span><h1 class="h1 mt-4">Деканат ${esc(u.faculty)}</h1><p class="lead">${esc(u.name)} · ${esc(u.position || '')}. Видны только заявки и группы своего факультета</p></div></div>
      <div data-body>${skeleton(1, 100)}${skeleton(3, 120)}</div></div>`;
  },
  async mount(el, params) {
    const box = el.querySelector('[data-body]');
    single = params && /^\d+$/.test(params[0] || '') ? Number(params[0]) : null;
    if (single) tab = 'queue';
    // Автообновление и ответ на прежний поиск не теряют набранный комментарий, номер в поиске и фокус сотрудника
    const keep = () => {
      const drafts = new Map([...box.querySelectorAll('[data-comment], #dean-q')].filter((x) => x.value).map((x) => [x.id, x.value]));
      const a = document.activeElement;
      const focus = a && box.contains(a) && a.id ? { id: a.id, start: a.selectionStart, end: a.selectionEnd } : a && box.contains(a) && a.closest('[data-req]') && a.dataset.act ? { req: a.closest('[data-req]').dataset.req, act: a.dataset.act } : null;
      return () => {
        drafts.forEach((v, id) => { const x = box.querySelector(`#${CSS.escape(id)}`); if (x) x.value = v; });
        if (!focus) return;
        const target = focus.id ? box.querySelector(`#${CSS.escape(focus.id)}`) : box.querySelector(`[data-req="${focus.req}"] [data-act="${focus.act}"]`);
        if (target) {
          target.focus({ preventScroll: true });
          if (focus.id && target.setSelectionRange && focus.start != null) target.setSelectionRange(focus.start, focus.end);
        }
      };
    };
    const paint = async () => {
      // На телефоне подписи короче: все три вкладки видны на 360 px без прокрутки
      const tabs = `<div class="seg" style="margin:24px 0 18px">${[['queue', 'Очередь', ' заявок'], ['news', 'Объявления', ' и расписание'], ['audit', 'Журнал', '']].map(([id, n, more]) => `<button class="${tab === id ? 'on' : ''}" data-tab="${id}">${n}${more ? `<span class="hide-s">${more}</span>` : ''}</button>`).join('')}</div>`;
      const content = tab === 'queue' ? queue() : tab === 'news' ? announce() : await audit();
      const restore = keep();
      box.innerHTML = kpis() + tabs + `<div data-tabbody>${content}</div>`;
      restore();
      if (tab === 'news') loadPairs(el);
    };
    const load = async (quiet) => {
      try {
        const one = single ? get(`/api/dean/requests/${single}`).then((r) => ({ requests: [r.request] })) : null;
        const url = query ? `/api/dean/requests?q=${encodeURIComponent(query)}` : `/api/dean/requests?status=${filter}`;
        [ov, { requests: list }] = await Promise.all([get('/api/dean/overview'), one || get(url)]);
        if (!quiet || tab === 'queue') {
          // Пока сотрудник печатает комментарий или номер, очередь не перерисовывается
          if (quiet && el.querySelector('[data-comment]:focus, #dean-q:focus')) return;
          await paint();
        }
      } catch (e) {
        // Неверный номер — подсказка, очередь остаётся на экране
        if (query && e.status === 400) { toast(esc(e.message), { icon: 'alert' }); query = ''; return; }
        if (e.status !== 401) box.innerHTML = errorBox(e);
      }
    };
    await load();
    const timer = setInterval(() => load(true), 10e3);

    el.addEventListener('click', async (e) => {
      const t = e.target.closest('[data-tab]');
      if (t) { tab = t.dataset.tab; paint(); return; }
      const f = e.target.closest('[data-filter]');
      if (f) { filter = f.dataset.filter; load(); return; }
      if (e.target.closest('[data-search-clear]')) { query = ''; const typed = el.querySelector('#dean-q'); if (typed) typed.value = ''; await load(); const q = el.querySelector('#dean-q'); if (q) q.focus(); return; }
      const ct = e.target.closest('.chg-type');
      if (ct) {
        el.querySelectorAll('.chg-type').forEach((x) => x.classList.toggle('on', x === ct));
        el.querySelector('[data-roomf]').hidden = ct.dataset.t !== 'room';
        return;
      }
      const a = e.target.closest('[data-act]');
      if (a) {
        const item = a.closest('[data-req]');
        const comment = item.querySelector('[data-comment]').value;
        a.disabled = true;
        try {
          await patch(`/api/dean/requests/${item.dataset.req}`, { status: a.dataset.act, comment });
          const done = { in_work: 'заявка взята в работу', ready: 'справка готова', approved: 'заявление одобрено', issued: 'отмечено как выданное', rejected: 'заявка отклонена' }[a.dataset.act];
          toast(`Сохранено: ${done}. Студент получил уведомление`, { icon: 'check' });
          load();
        } catch (er) {
          a.disabled = false;
          toast(esc(er.data && er.data.fields ? Object.values(er.data.fields)[0] : er.message), { icon: 'alert' });
        }
      }
    });
    el.addEventListener('change', (e) => {
      if (e.target.closest('[data-chg]') && ['group', 'date'].includes(e.target.name)) loadPairs(el);
      if (e.target.name === 'type') el.querySelector('[data-roomf]').hidden = e.target.value !== 'room';
    });
    el.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      if (form.matches('[data-search]')) {
        query = form.elements.q.value.trim();
        try { await load(); } catch (er) { /* ошибка показана в очереди */ }
        const q = el.querySelector('#dean-q');
        if (q) q.focus();
        return;
      }
      form.querySelectorAll('.field-error').forEach((x) => x.remove());
      form.querySelectorAll('.invalid').forEach((x) => x.classList.remove('invalid'));
      const showErr = (er) => {
        const fe = er.data && er.data.fields;
        if (fe) Object.entries(fe).forEach(([k, msg]) => { const x = form.querySelector(`[data-field="${k}"]`); if (x) { x.classList.add('invalid'); x.insertAdjacentHTML('beforeend', `<span class="field-error">${esc(msg)}</span>`); } });
        toast(esc(er.message), { icon: 'alert' });
      };
      // Поля берём через form.elements: у формы есть свои свойства title и target
      const E = form.elements;
      if (form.matches('[data-ann]')) {
        const target = E.aud.value;
        try {
          await post('/api/dean/announcements', { title: E.title.value, body: E.body.value, audience: target === 'faculty' ? 'faculty' : 'group', group: target === 'faculty' ? undefined : target, important: E.important.checked });
          toast('Объявление опубликовано — студенты увидят его в уведомлениях', { icon: 'megaphone' });
          form.reset();
        } catch (er) { showErr(er); }
      }
      if (form.matches('[data-chg]')) {
        const pick = form.querySelector('input[name="pair"]:checked');
        if (!pick) { toast('Выберите пару', { icon: 'info' }); return; }
        const [lesson, pair] = pick.value.split(':').map(Number);
        try {
          await post('/api/dean/changes', { group: E.group.value, date: E.date.value, lesson, pair, type: form.querySelector('input[name="type"]:checked').value, room: E.room.value, reason: E.reason.value });
          toast('Изменение отмечено — группа получила уведомление', { icon: 'calendar' });
          E.reason.value = '';
          E.room.value = '';
          loadPairs(el);
        } catch (er) { showErr(er); }
      }
    });
    return () => clearInterval(timer);
  },
};
