// Расписание на неделю: изменения подсвечены, на телефоне — выбор дня, экспорт в календарь.
import { get, post } from '../lib/api.js';
import { session, setPlay } from '../lib/bus.js';
import { esc, mskNow, dayShort, dateNum, weekdayShort, relDay, plural, addDays } from '../lib/format.js';
import { icon } from '../ui/icons.js';
import { modal } from '../ui/overlay.js';
import { skeleton, errorBox, lessonState, changeTag, changeLine, teacherModal, KIND_ICON } from './common.js';

let week = null;
let picked = null;

function isoWeekOf(d) {
  const wd = new Date(d + 'T12:00:00Z').getUTCDay() || 7;
  const thursday = addDays(d, 4 - wd);
  const y = thursday.slice(0, 4);
  const jan4 = `${y}-01-04`;
  const w4 = new Date(jan4 + 'T12:00:00Z').getUTCDay() || 7;
  const first = addDays(jan4, 1 - w4);
  const n = Math.round((new Date(addDays(d, 1 - wd) + 'T12:00:00Z') - new Date(first + 'T12:00:00Z')) / (7 * 864e5)) + 1;
  return `${y}-W${String(n).padStart(2, '0')}`;
}

function lessonCard(it, now) {
  const st = lessonState(it, now);
  const cls = [it.status, st, it.change && it.change.type === 'room' ? 'room-changed' : '', it.change && it.change.type === 'teacher' ? 'teacher-changed' : ''].join(' ');
  return `<button class="lesson ${cls}" style="--c:${it.color}" data-lesson="${esc(it.key)}">
    <span class="lesson-time"><b>${it.start}</b>–${it.end} · ${it.pair} пара${st === 'now' && it.status !== 'cancelled' ? ' · <b style="color:var(--navy)">идёт</b>' : ''}</span>
    <span class="lesson-name" style="display:block">${esc(it.discipline)}</span>
    <span class="lesson-sub" style="display:block">${esc(it.kindLabel)}${it.teacher ? ' · ' + esc(it.teacher.short) : ''}${it.subgroup ? ' · подгруппа ' + esc(it.subgroup) : ''}</span>
    <span class="lesson-room">${icon('pin', 14)} ${/^\d+$/.test(it.room) ? 'ауд. ' : ''}${esc(it.room)}${it.change && it.change.type === 'room' ? ` <span class="old">${esc(it.change.from)}</span>` : ''}</span>
    ${it.change ? `<span class="lesson-tag">${changeTag(it)}</span>` : ''}
  </button>`;
}

function dayCol(d, now) {
  const today = d.date === now.date;
  const n = d.items.filter((x) => x.status !== 'cancelled' && x.status !== 'moved').length;
  return `<section class="day-col ${today ? 'today' : ''} ${picked === d.date ? 'picked' : ''}" data-day="${d.date}" aria-label="${esc(dayShort(d.date))}">
    <div class="day-col-head"><b>${esc(weekdayShort(d.date).replace(/^./, (c) => c.toUpperCase()))}, ${dateNum(d.date)}</b><span>${today ? 'сегодня' : n ? `${n} ${plural(n, ['пара', 'пары', 'пар'])}` : ''}</span></div>
    ${d.holiday ? `<div class="holiday">${icon('star', 14)} ${esc(d.holiday)}<div class="small">выходной</div></div>` : d.items.length ? d.items.map((it) => lessonCard(it, now)).join('') : '<div class="empty">Пар нет</div>'}
  </section>`;
}

function body() {
  const now = mskNow();
  const w = week;
  const cur = isoWeekOf(now.date) === w.week;
  const range = `${dateNum(w.monday)}–${dayShort(addDays(w.monday, 5)).split(', ')[1]}`;
  if (!picked || !w.days.some((d) => d.date === picked)) picked = (w.days.find((d) => d.date >= now.date && !d.holiday && d.items.length) || w.days.find((d) => d.date === now.date) || w.days[0]).date;
  return `
    <div class="week-bar">
      <div class="week-nav"><a class="btn btn-secondary btn-icon btn-sm" href="#/schedule/${isoWeekOf(w.prev)}" aria-label="Предыдущая неделя">${icon('left', 18)}</a>
        <div class="week-label">${esc(range)}<small>${w.number}-я неделя · ${w.parity === 'odd' ? 'нечётная' : 'чётная'}</small></div>
        <a class="btn btn-secondary btn-icon btn-sm" href="#/schedule/${isoWeekOf(w.next)}" aria-label="Следующая неделя">${icon('right', 18)}</a></div>
      ${cur ? '' : `<a class="btn btn-ghost btn-sm" href="#/schedule">${icon('calendar', 16)} К текущей неделе</a>`}
      <div class="week-tools"><button class="btn btn-secondary btn-sm" data-bells>${icon('clock', 16)} Звонки</button><a class="btn btn-secondary btn-sm" href="/api/schedule.ics" download>${icon('download', 16)} В свой календарь</a></div>
    </div>
    ${w.changes.length ? `<div class="changes-strip" aria-label="Изменения на неделе">${w.changes.map((it) => { const c = changeLine(it); return `<button class="change-pill ${c.cls}" data-lesson="${esc(it.key)}">${icon(c.icon, 18)}<span><b>${c.title}</b>${c.sub ? `<span class="small">${esc(c.sub)}</span>` : ''}</span></button>`; }).join('')}</div>` : ''}
    <div class="days-pick" role="tablist">${w.days.map((d) => `<button class="day-btn ${picked === d.date ? 'on' : ''} ${d.date === now.date ? 'today' : ''}" data-pick="${d.date}" role="tab" aria-selected="${picked === d.date}"><span>${esc(weekdayShort(d.date))}</span><b>${dateNum(d.date)}</b>${d.items.some((x) => x.change) ? '<i></i>' : ''}</button>`).join('')}</div>
    <div class="week">${w.days.map((d) => dayCol(d, now)).join('')}</div>`;
}

function lessonModal(it) {
  const c = it.change;
  const ch = c ? changeLine(it) : null;
  modal.open({
    label: it.discipline,
    html: `<span class="eyebrow">${esc(it.kindLabel)} · ${it.pair} пара</span>
      <div class="modal-title mt-8">${esc(it.discipline)}</div>
      ${ch ? `<div class="note note-warn mt-16">${icon(ch.icon, 18)}<span><b style="font-weight:500">${ch.title}</b>${ch.sub ? `<br>${esc(ch.sub)}` : ''}</span></div>` : ''}
      <dl class="kv mt-20">
        <dt>Когда</dt><dd>${esc(relDay(it.date).replace(/^./, (x) => x.toUpperCase()))}, ${esc(dayShort(it.date))} · ${it.start}–${it.end}</dd>
        <dt>Где</dt><dd>${/^\d+$/.test(it.room) ? 'Аудитория ' : ''}${esc(it.room)}${it.place ? ' · ' + esc(it.place) : ''}${c && c.type === 'room' ? ` <span class="old">${esc(c.from)}</span>` : ''}</dd>
        <dt>Преподаватель</dt><dd>${it.teacher ? `<button class="link" data-teacher>${esc(it.teacher.name)}</button>` : '—'}</dd>
        <dt>Формат</dt><dd>${icon(KIND_ICON[it.kind] || 'book', 16)} ${esc(it.kindLabel)}</dd>
      </dl>
      <div class="modal-foot">${it.disciplineId ? `<a class="btn btn-primary btn-lg" href="#/grades/${it.disciplineId}">${icon('chart', 18)} Баллы по дисциплине</a>` : ''}<button class="btn btn-secondary btn-lg" data-close>Закрыть</button></div>`,
    onMount(el) {
      const t = el.querySelector('[data-teacher]');
      if (t) t.onclick = () => teacherModal(it.teacher);
    },
  });
}

function bellsModal() {
  modal.open({
    label: 'Звонки',
    html: `<div class="modal-title">Расписание звонков</div><p class="modal-sub">Перерыв между 2 и 3 парой — 30 минут на обед</p>
      <div class="bells mt-20">${week.bells.map(([a, b], i) => `<div class="bell"><span class="muted">${i + 1} пара</span><b>${a}</b>${b}</div>`).join('')}</div>
      <div class="modal-foot"><button class="btn btn-secondary btn-lg" data-close>Закрыть</button></div>`,
  });
}

