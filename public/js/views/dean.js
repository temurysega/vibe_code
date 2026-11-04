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

