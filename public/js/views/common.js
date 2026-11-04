// Общие кусочки разметки для разделов кабинета.
import { esc, toMin, mskNow, dayShort, relDay, initials } from '../lib/format.js';
import { icon } from '../ui/icons.js';
import { modal } from '../ui/overlay.js';

export const skeleton = (rows = 3, h = 120) => `<div class="col" style="gap:16px">${Array.from({ length: rows }, () => `<div class="skel" style="height:${h}px"></div>`).join('')}</div>`;

export function errorBox(e, retry = true) {
  const status = e && e.status;
  const text = status === 404 ? 'Не нашли такую страницу. Возможно, ссылка устарела или ведёт к чужим данным — они вам недоступны.'
    : status === 403 ? 'Этот раздел вам недоступен.'
      : (e && e.message) || 'Не удалось загрузить данные';
  return `<div class="card error-box"><span class="emoji" style="font-size:36px">${status === 404 ? '🔎' : '🛰️'}</span><div class="h4 mt-12">${status === 404 ? 'Не найдено' : 'Что-то пошло не так'}</div><p class="muted mt-8">${esc(text)}</p>
    <div class="row-wrap mt-20" style="justify-content:center">${retry && status !== 404 && status !== 403 ? `<button class="btn btn-primary" data-retry>${icon('refresh', 18)} Повторить</button>` : ''}<a class="btn btn-secondary" href="#/home">На главную</a></div></div>`;
}

// Статус пары относительно текущего времени по Москве
export function lessonState(it, now = mskNow()) {
  if (it.date < now.date) return 'past';
  if (it.date > now.date) return 'future';
  if (toMin(it.end) <= now.minutes) return 'past';
  if (toMin(it.start) <= now.minutes) return 'now';
  return 'future';
}

export const KIND_ICON = { lecture: 'people', seminar: 'chat', language: 'globe', practice: 'target', sport: 'bolt', consult: 'question' };

// Что изменилось в паре — коротко для бейджа
export function changeTag(it) {
  if (!it.change) return '';
  const c = it.change;
  if (c.type === 'cancel') return `${icon('ban', 13)} Отменена`;
  if (c.type === 'room') return `${icon('pin', 13)} Новая аудитория`;
  if (c.type === 'teacher') return `${icon('user', 13)} Замена преподавателя`;
  if (c.type === 'extra') return `${icon('plus', 13)} Дополнительно`;
  if (c.type === 'move' && it.status === 'moved') return `${icon('route', 13)} Перенесена на ${esc(relDay(c.to.date))}, ${c.to.pair} пара`;
  if (c.type === 'move') return `${icon('route', 13)} Перенос с ${esc(dayShort(c.from.date))}`;
  return '';
}

export function changeLine(it) {
  const c = it.change;
  const what = `${esc(it.short || it.discipline)}, ${esc(relDay(it.date))}`;
  if (c.type === 'cancel') return { cls: 'cancel', icon: 'ban', title: `${what}: пара отменена`, sub: c.reason };
  if (c.type === 'room') return { cls: 'room', icon: 'pin', title: `${what}: ауд. ${esc(it.room)} вместо ${esc(c.from)}`, sub: c.reason };
  if (c.type === 'teacher') return { cls: 'teacher', icon: 'user', title: `${what}: ведёт ${esc(it.teacher ? it.teacher.short : '')}`, sub: c.reason };
  if (c.type === 'extra') return { cls: 'extra', icon: 'plus', title: `${what}: ${esc(it.kindLabel.toLowerCase())}, ${it.pair} пара, ауд. ${esc(it.room)}`, sub: c.reason };
  if (it.status === 'moved') return { cls: 'move', icon: 'route', title: `${what}: перенос на ${esc(relDay(c.to.date))}, ${c.to.pair} пара`, sub: c.reason };
  return { cls: 'move', icon: 'route', title: `${what}: ${it.pair} пара — перенос с ${esc(dayShort(c.from.date))}`, sub: c.reason };
}

// Карточка преподавателя: контакты и приёмные часы
export function teacherModal(t, extra) {
  if (!t) return;
  modal.open({
    label: t.name,
    html: `<div class="teacher-card" style="background:transparent;padding:0"><span class="teacher-ava">${esc(initials(t.name.split(' ').slice(0, 2).join(' ')))}</span>
        <div class="grow"><div class="modal-title" style="font-size:24px">${esc(t.name)}</div><div class="muted mt-4">${esc(t.title || '')}</div></div></div>
      <dl class="kv mt-24">
        <dt>Кафедра</dt><dd>${esc(t.department || '—')}</dd>
        <dt>Приёмные часы</dt><dd>${esc(t.hours || 'по договорённости')}</dd>
        <dt>Почта</dt><dd>${esc(t.email || '—')} <span class="small muted">· вымышленная</span></dd>
        ${extra || ''}
      </dl>
      <div class="modal-foot"><button class="btn btn-secondary btn-lg" data-close>Понятно</button></div>`,
  });
}

export const STATUS_ICON = { submitted: 'send', in_work: 'hourglass', ready: 'check', issued: 'check', approved: 'check', rejected: 'ban', cancelled: 'undo' };
export const statusPill = (status, label) => `<span class="st st-${status}"><i></i>${esc(label)}</span>`;

// Полоска прогресса заявки по шагам
export function pipe(steps, status) {
  const bad = status === 'rejected' || status === 'cancelled';
  const idx = bad ? steps.length : Math.max(0, steps.indexOf(status));
  const done = !bad && idx === steps.length - 1;
  return `<div class="pipe ${bad ? 'bad' : done ? 'done' : ''}">${steps.map((s, i) => `<i class="${bad || i <= idx ? 'on' : ''}"></i>`).join('')}</div>`;
}

export const PICKUP_ICON = icon('pin', 20);
