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

