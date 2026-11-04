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
  return `<div class="row-wrap" style="justify-content:space-between;margin-bottom:14px"><div class="seg">${[['active', 'Активные'], ['done', 'Завершённые'], ['all', 'Все']].map(([id, n]) => `<button class="${filter === id ? 'on' : ''}" data-filter="${id}">${n}</button>`).join('')}</div>
      <span class="small muted">${icon('refresh', 14)} обновляется сама каждые 10 секунд</span></div>
    ${shown.length ? `<div class="queue">${shown.map((r) => `<div class="q-item ${r.overdue ? 'overdue' : ''}" data-req="${r.id}">
      <div class="q-top"><span class="cat-ic" style="width:42px;height:42px;background:#fff">${icon(r.icon || 'doc', 20)}</span>
        <div class="grow"><b>${esc(r.title)}</b><div class="small muted">№ ${esc(r.number)} · ${esc(r.student.name)} · ${esc(r.student.group)} · ${esc(when(r.createdAt))}${r.delivery !== 'none' ? ` · ${r.delivery === 'electronic' ? 'электронная' : 'бумажная'}` : ''}</div></div>
        ${r.overdue ? `<span class="badge badge-red">${icon('alert', 12)} срок ${esc(stamp(r.dueAt))}</span>` : ''}${statusPill(r.status, r.statusLabel)}</div>
      ${Object.keys(r.payload).length ? `<div class="q-payload">${payload(r.payload)}</div>` : ''}
      ${r.actions.length ? `<div class="q-actions"><input class="input" data-comment placeholder="Комментарий студенту${r.actions.includes('rejected') ? ' (обязателен при отказе)' : ''}" maxlength="500">${r.actions.map((a) => `<button class="btn btn-sm ${ACTION[a][1]}" data-act="${a}">${icon(ACTION[a][2], 16)} ${ACTION[a][0]}</button>`).join('')}</div>` : r.deanComment ? `<div class="small muted">${icon('chat', 14)} ${esc(r.deanComment)}</div>` : ''}
    </div>`).join('')}</div>` : '<div class="card empty"><span class="emoji">🎉</span>Очередь пуста — все заявки обработаны</div>'}`;
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

