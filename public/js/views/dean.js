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

