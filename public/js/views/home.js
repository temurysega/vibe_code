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

