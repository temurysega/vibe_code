// Главная: ближайшая пара, день, «как у меня дела», дедлайны, заявки, изменения и новости —
// а ниже образ, питомец, кампус и перерыв из игрового слоя.
import { get, post } from '../lib/api.js';
import { session, setPlay, on } from '../lib/bus.js';
import { esc, fmt, plural, toMin, mskNow, dayLabel, relDay, dateNum, monthShort, dueLabel, inMinutes, when, num, dateOfTs } from '../lib/format.js';
import { icon, coin } from '../ui/icons.js';
import { toast } from '../ui/overlay.js';
import * as fx from '../ui/fx.js';
import { svg as avatarSvg, pet as petSvg, backdrop } from '../art/avatar.js';
import { ROOMS, RULES } from '../shared/catalog.js';
import { skeleton, errorBox, lessonState, changeLine, statusPill, pipe } from './common.js';
import { openOnboarding, openQuiz } from './onboarding.js';

let data = null;
let phraseI = 0;

function greeting(min) {
  return min < 300 ? 'Доброй ночи' : min < 720 ? 'Доброе утро' : min < 1080 ? 'Добрый день' : 'Добрый вечер';
}

// Питомец подсказывает мягко и по делу: берёт фразы из настоящих данных студента
function petPhrases() {
  const out = [];
  const now = mskNow();
  const n = data.next;
  if (n && n.date === now.date && !n.live) {
    const m = toMin(n.start) - now.minutes;
    if (m <= 90) out.push(`Через ${m} мин — ${n.short}, ауд. ${n.room}. Провожу!`);
  }
  const ready = data.requests.find((r) => r.status === 'ready');
  if (ready) out.push(ready.delivery === 'electronic' ? `«${ready.title}» готова — можно скачать 🎉` : `«${ready.title}» готова — забери в деканате`);
  const dl = data.deadlines.find((d) => d.dueAt - Date.now() < 2 * 864e5);
  if (dl) out.push(`Не забудь: ${dl.title} — ${dueLabel(dl.dueAt)}`);
  const risk = data.grades.risk[0];
  if (risk) out.push(`Подтянем «${risk.name}»? ${risk.advice}`);
  if (data.notifications.unread) out.push(`У тебя ${data.notifications.unread} ${plural(data.notifications.unread, ['новое уведомление', 'новых уведомления', 'новых уведомлений'])}`);
  if (session.play.focusLeftToday) out.push('Хочешь, посижу рядом 25 минут, пока ты учишь?');
  out.push('Кажется, пора на перерыв ☕ Пять минут забега — и снова за учёбу');
  return out;
}

const sec = {
  hello() {
    const now = data.now;
    const p = data.parity;
    const u = session.user;
    return `<div class="hello" data-sec="hello"><div>
        <h1 class="h1">${greeting(now.minutes)}, ${esc(u.firstName)}</h1>
        <div class="hello-sub"><span>${esc(dayLabel(now.date).replace(/^./, (c) => c.toUpperCase()))}</span><span>·</span><span>${p.n}-я неделя, ${p.parity === 'odd' ? 'нечётная' : 'чётная'}</span>${data.holiday ? `<span class="badge badge-gold">${icon('star', 12)} ${esc(data.holiday)}</span>` : ''}</div>
      </div>
      <div class="quick">
        <a class="btn btn-primary" href="#/requests/new">${icon('doc', 18)} Заказать справку</a>
        <a class="btn btn-secondary" href="#/schedule">${icon('calendar', 18)} Неделя</a>
        <button class="btn btn-secondary" data-ask>${icon('chat', 18)} Спросить деканат</button>
      </div></div>`;
  },

  next() {
    const n = data.next;
    if (!n) return `<div class="next-card" data-sec="next"><span class="eyebrow">Ближайшая пара</span><div class="next-title">Пар в ближайшие дни нет</div><p style="color:rgba(255,255,255,.8)">Отдыхайте — или загляните в библиотеку кампуса</p></div>`;
    const now = mskNow();
    const live = n.date === now.date && toMin(n.start) <= now.minutes && toMin(n.end) > now.minutes;
    const count = live
      ? `<span class="live-dot"></span> Идёт сейчас · до конца <b>${toMin(n.end) - now.minutes} мин</b>`
      : n.date === now.date ? `${icon('clock', 16)} Начнётся <b>${inMinutes(toMin(n.start) - now.minutes)}</b>`
        : `${icon('calendar', 16)} <b>${esc(relDay(n.date).replace(/^./, (c) => c.toUpperCase()))}</b> в ${n.start}`;
    const ch = n.change;
    const chText = ch ? (ch.type === 'room' ? `Аудитория изменена: была ${esc(ch.from)}. ${esc(ch.reason || '')}` : ch.type === 'teacher' ? `Замена преподавателя. ${esc(ch.reason || '')}` : ch.type === 'move' ? `Пара перенесена сюда с другого дня. ${esc(ch.reason || '')}` : ch.type === 'extra' ? `Дополнительное занятие. ${esc(ch.reason || '')}` : '') : '';
    return `<div class="next-card" data-sec="next">
      <span class="eyebrow">${live ? 'Сейчас идёт' : 'Ближайшая пара'} · ${n.pair} пара</span>
      <div class="next-title">${esc(n.discipline)}</div>
      <div class="next-meta"><span>${icon('clock', 15)} ${n.start}–${n.end}</span><span class="hl">${icon('pin', 15)} ауд. ${esc(n.room)}${n.place ? ' · ' + esc(n.place) : ''}</span>${n.teacher ? `<span>${icon('user', 15)} ${esc(n.teacher.short)}</span>` : ''}<span>${esc(n.kindLabel)}</span></div>
      <div class="next-count">${count}</div>
      ${chText ? `<div class="next-change">${icon('alert', 16)}<span>${chText}</span></div>` : ''}
      <a class="btn btn-light btn-sm" href="#/schedule">Расписание на неделю ${icon('arrow', 16)}</a>
    </div>`;
  },

  day() {
    const now = mskNow();
    const useTomorrow = data.today.holiday || !data.today.items.length || data.today.items.every((it) => lessonState(it, now) === 'past');
    const d = useTomorrow ? data.tomorrow : data.today;
    const title = useTomorrow ? `Завтра, ${esc(dayLabel(d.date).split(', ')[1] || '')}` : 'Сегодня';
    let body;
    if (d.holiday || !d.items.length) {
      body = `<div class="day-empty"><span class="emoji">${d.holiday ? '🎉' : '🌿'}</span><div><b style="font-weight:500">${d.holiday ? esc(d.holiday) : 'Пар нет'}</b><div class="small muted">${d.holiday ? 'Выходной день — занятий нет' : 'Свободный день'}</div></div></div>`;
    } else {
      body = `<div class="day-line">${d.items.map((it) => {
        const st = lessonState(it, now);
        return `<a class="day-item ${st} ${it.status}" href="#/schedule" style="--c:${it.color}">
          <span class="t"><b>${it.start}</b>${it.end}</span><span class="stripe"></span>
          <span class="what"><b>${esc(it.discipline)}</b><span class="small muted">${esc(it.kindLabel)} · ауд. ${esc(it.room)}${it.teacher ? ' · ' + esc(it.teacher.short) : ''}</span>
          ${it.status === 'cancelled' ? `<span class="lesson-tag" style="background:var(--red-2);color:var(--red-ink)">${icon('ban', 12)} Отменена</span>` : it.status === 'moved' ? `<span class="lesson-tag">${icon('route', 12)} Перенесена на ${esc(relDay(it.change.to.date))}</span>` : it.change ? `<span class="lesson-tag" style="background:var(--blue-2);color:var(--blue-ink)">${icon('info', 12)} ${it.change.type === 'room' ? 'Новая аудитория' : it.change.type === 'teacher' ? 'Замена' : it.change.type === 'extra' ? 'Дополнительно' : 'Перенос'}</span>` : ''}</span></a>`;
      }).join('')}</div>`;
    }
    return `<div class="card" data-sec="day"><div class="card-head"><div class="card-title">${title}</div><a class="link-arrow" href="#/schedule">Неделя ${icon('arrow', 16)}</a></div>${body}</div>`;
  },

  steps() {
    const p = session.play;
    if (!p.newcomer || p.steps.claimed) return '<div data-sec="steps" hidden></div>';
    const all = p.stepsDone === p.stepsList.length;
    return `<div class="card card-gold mt-20" data-sec="steps">
      <div class="card-head"><div><div class="card-title">Первые шаги в МГИМО Мании</div><div class="card-sub">Пройдите чек-лист — ${fmt(200)} М-коинов и шапочка выпускника для аватара</div></div><span class="badge ${all ? 'badge-navy' : 'badge-gray'}">${p.stepsDone} из ${p.stepsList.length}</span></div>
      <div class="bar bar-gold"><i style="width:${Math.round((p.stepsDone / p.stepsList.length) * 100)}%"></i></div>
      <div class="steps-list mt-12">${p.stepsList.map((x, k) => `<div class="step-row ${x.done ? 'done' : ''}"><span class="step-n">${x.done ? icon('check', 14, 2.6) : k + 1}</span><div class="grow"><b>${esc(x.title)}</b></div>${x.done ? '' : x.act ? `<button class="btn btn-xs btn-secondary" data-step="${x.act}">${esc(x.cta)}</button>` : `<a class="btn btn-xs btn-secondary" href="${x.link}">${esc(x.cta)}</a>`}</div>`).join('')}</div>
      ${all ? `<button class="btn btn-primary mt-16" data-claim>${icon('star', 18)} Забрать 200 М-коинов</button>` : ''}
    </div>`;
  },

  mood() {
    const s = data.grades.summary;
    const ic = s.mood === 'great' ? '🌟' : s.mood === 'warn' ? '⚡' : '🙂';
    return `<div class="card mood mood-${s.mood}" data-sec="mood">
      <div class="card-head" style="margin:0"><div class="card-title">Как у меня дела</div><a class="link-arrow" href="#/grades">Баллы ${icon('arrow', 16)}</a></div>
      <div class="mood-head"><span class="mood-ic">${ic}</span><div><b>${esc(s.headline)}</b><span class="small muted">${esc(data.grades.semesterLabel)} · ${s.total} ${plural(s.total, ['дисциплина', 'дисциплины', 'дисциплин'])}</span></div></div>
      <div class="stat-row">
        <div class="stat"><div class="stat-v">${s.avg != null ? num(s.avg, 2) : '—'}</div><div class="stat-l">средний балл сессий</div></div>
        <div class="stat"><div class="stat-v">${s.semPace != null ? s.semPace + '%' : '—'}</div><div class="stat-l">набрано от возможного</div></div>
        <div class="stat"><div class="stat-v">${s.rank.place}<span class="small muted" style="font-weight:400">/${s.rank.of}</span></div><div class="stat-l">место в рейтинге группы</div></div>
      </div>
      ${s.tips.length ? `<div>${s.tips.slice(0, 3).map((t) => `<a class="tip ${t.kind}" href="${t.link}"><span class="dot"></span><span class="grow">${esc(t.text)}</span>${icon('arrow', 14)}</a>`).join('')}</div>` : `<div class="tip"><span class="dot" style="background:var(--mint)"></span><span>Рисков нет — так держать</span></div>`}
    </div>`;
  },

  deadlines() {
    const list = data.deadlines.slice(0, 5);
    return `<div class="card" data-sec="deadlines"><div class="card-head"><div class="card-title">Дедлайны</div><span class="badge badge-gray">${data.deadlines.length}</span></div>
      ${list.length ? list.map((d) => {
        const soon = d.dueAt - Date.now() < 2 * 864e5;
        const day = dateOfTs(d.dueAt);
        return `<a class="dl ${soon ? 'soon' : ''}" href="${esc(d.link || '#/grades')}"><span class="dl-date"><b>${dateNum(day)}</b><span>${monthShort(day)}</span></span>
          <span class="grow"><b>${esc(d.title)}</b><span class="small muted" style="display:block">${esc(dueLabel(d.dueAt))}${d.discipline ? ' · ' + esc(d.discipline) : ''}</span></span></a>`;
      }).join('') : '<div class="empty"><span class="emoji">🗓️</span>Ближайшие две недели — без дедлайнов</div>'}
    </div>`;
  },

