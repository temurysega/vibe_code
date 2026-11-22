// Главная: ближайшая пара, день, «как у меня дела», дедлайны, заявки, изменения и новости —
// а ниже образ, питомец, кампус и перерыв из игрового слоя.
import { get, post } from '../lib/api.js';
import { session, setPlay, on, NO_PLAY } from '../lib/bus.js';
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
let expandedSections = new Set();

const isMobile = () => matchMedia('(max-width: 720px)').matches;
const detailOpen = (key) => (key === 'day' && !isMobile()) || expandedSections.has(key) ? 'open' : '';

// На главной показываем ближайшее, остальные записи раскрываются на месте.
function compactList(key, rows, label, keep = 2) {
  if (rows.length <= keep) return rows.join('');
  return `${rows.slice(0, keep).join('')}<details class="home-more" data-home-more="${key}" ${detailOpen(key)}>
    <summary><span class="home-more-collapsed">Ещё ${rows.length - keep} ${label}</span><span class="home-more-expanded">Свернуть список</span>${icon('down', 16)}</summary>
    <div>${rows.slice(keep).join('')}</div></details>`;
}

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
        <button class="home-guide" data-start-guide>${icon('info', 16)} С чего начать?</button>
      </div>
      <div class="quick">
        <a class="btn btn-primary" href="#/requests/new">${icon('doc', 18)} Заказать справку</a>
        <a class="btn btn-secondary" href="#/schedule">${icon('calendar', 18)} Неделя</a>
        <button class="btn btn-secondary home-ask" data-ask>${icon('chat', 18)} Спросить деканат</button>
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
    // На телефоне время уже видно рядом с аудиторией; в верхней строке достаточно
    // дня, ожидания начала или оставшегося времени текущей пары.
    const mobileCount = live
      ? `<span class="live-dot"></span> Ещё <b>${toMin(n.end) - now.minutes} мин</b>`
      : n.date === now.date ? `${icon('clock', 15)} <b>${inMinutes(toMin(n.start) - now.minutes).replace(/^./, (c) => c.toUpperCase())}</b>`
        : `${icon('calendar', 15)} <b>${esc(relDay(n.date).replace(/^./, (c) => c.toUpperCase()))}</b>`;
    const ch = n.change;
    const chText = ch ? (ch.type === 'room' ? `Аудитория изменена: была ${esc(ch.from)}. ${esc(ch.reason || '')}` : ch.type === 'teacher' ? `Замена преподавателя. ${esc(ch.reason || '')}` : ch.type === 'move' ? `Пара перенесена сюда с другого дня. ${esc(ch.reason || '')}` : ch.type === 'extra' ? `Дополнительное занятие. ${esc(ch.reason || '')}` : '') : '';
    return `<div class="next-card has-next" data-sec="next">
      <span class="eyebrow"><span class="next-label-full">${live ? 'Сейчас идёт' : 'Ближайшая пара'}</span><span class="next-label-mobile">${live ? 'Идёт' : 'Далее'}</span> · ${n.pair} пара</span>
      <div class="next-title">${esc(n.discipline)}</div>
      <div class="next-meta"><span>${icon('clock', 15)} ${n.start}–${n.end}</span><span class="hl">${icon('pin', 15)} ауд. ${esc(n.room)}${n.place ? `<span class="next-floor"> · ${esc(n.place)}</span>` : ''}</span>${n.teacher ? `<span>${icon('user', 15)} ${esc(n.teacher.short)}</span>` : ''}<span>${esc(n.kindLabel)}</span></div>
      <div class="next-count"><span class="next-count-full">${count}</span><span class="next-count-mobile">${mobileCount}</span></div>
      ${chText ? `<div class="next-change">${icon('alert', 16)}<span>${chText}</span></div>` : ''}
      <a class="btn btn-light btn-sm" href="#/schedule">Расписание на неделю ${icon('arrow', 16)}</a>
    </div>`;
  },

  day() {
    const now = mskNow();
    const useTomorrow = data.today.holiday || !data.today.items.length || data.today.items.every((it) => lessonState(it, now) === 'past');
    const d = useTomorrow ? data.tomorrow : data.today;
    const title = useTomorrow ? `Завтра, ${esc(dayLabel(d.date).split(', ')[1] || '')}` : 'Сегодня';
    const hasNext = d.items.some((it) => it.key === data.next?.key);
    const remaining = d.items.length - Number(hasNext);
    let body;
    if (d.holiday || !d.items.length) {
      body = `<div class="day-empty"><span class="emoji">${d.holiday ? '🎉' : '🌿'}</span><div><b style="font-weight:500">${d.holiday ? esc(d.holiday) : 'Пар нет'}</b><div class="small muted">${d.holiday ? 'Выходной день — занятий нет' : 'Свободный день'}</div></div></div>`;
    } else {
      body = `<div class="day-line">${d.items.map((it) => {
        const st = lessonState(it, now);
        return `<a class="day-item ${st} ${it.status}${it.key === data.next?.key ? ' day-item-next' : ''}" data-day-lesson="${esc(it.key)}" href="#/schedule" style="--c:${it.color}">
          <span class="t"><b>${it.start}</b>${it.end}</span><span class="stripe"></span>
          <span class="what"><b>${esc(it.discipline)}</b><span class="small muted">${esc(it.kindLabel)} · ауд. ${esc(it.room)}${it.teacher ? ' · ' + esc(it.teacher.short) : ''}</span>
          ${it.status === 'cancelled' ? `<span class="lesson-tag" style="background:var(--red-2);color:var(--red-ink)">${icon('ban', 12)} Отменена</span>` : it.status === 'moved' ? `<span class="lesson-tag">${icon('route', 12)} Перенесена на ${esc(relDay(it.change.to.date))}</span>` : it.change ? `<span class="lesson-tag" style="background:var(--blue-2);color:var(--blue-ink)">${icon('info', 12)} ${it.change.type === 'room' ? 'Новая аудитория' : it.change.type === 'teacher' ? 'Замена' : it.change.type === 'extra' ? 'Дополнительно' : 'Перенос'}</span>` : ''}</span></a>`;
      }).join('')}</div>`;
    }
    const count = `${remaining} ${plural(remaining, ['занятие', 'занятия', 'занятий'])}`;
    return `<details class="card home-day" data-sec="day" data-day-date="${d.date}" data-home-more="day" ${detailOpen('day')}>
      <summary><span><b>${hasNext ? 'Остальные пары' : title}</b><span class="small muted">${hasNext ? `${title} · ${remaining ? count : 'Других пар нет'}` : d.holiday ? esc(d.holiday) : count}</span></span>${icon('down', 18)}</summary>
      <div class="home-day-body"><div class="card-head home-day-desktop-head"><div class="card-title">${title}</div><a class="link-arrow" href="#/schedule">Неделя ${icon('arrow', 16)}</a></div>
        ${hasNext ? '<p class="home-day-note small muted">Ближайшая пара показана в карточке выше.</p>' : ''}${body}
        <a class="home-day-week link-arrow" href="#/schedule">Расписание на неделю ${icon('arrow', 16)}</a>
      </div></details>`;
  },

  priority() {
    const summary = data.grades.summary;
    const tip = summary.tips.find((item) => ['debt', 'risk', 'att'].includes(item.kind));
    const risk = data.grades.risk[0];
    const study = tip
      // Причина риска — прямо в ярлыке, без перехода в оценки: по опросу 22 ноября «риск по дисциплине» был самым трудным заданием
      ? { label: tip.kind === 'risk' && risk ? `Риск · нужно ещё ${risk.need} из ${risk.remaining} баллов` : 'Требует внимания', text: tip.kind === 'risk' && risk ? risk.name : tip.text, link: tip.link, icon: 'alert' }
      : { label: session.play.newcomer ? 'Ваш первый семестр' : 'Учебных рисков нет', text: summary.total ? 'Посмотреть успеваемость' : 'Открыть раздел учёбы', link: '#/grades', icon: 'chart' };
    const request = data.requests.find((item) => item.status === 'ready')
      || data.requests.find((item) => !['issued', 'approved', 'rejected', 'cancelled'].includes(item.status))
      || data.requests[0];
    return `<section class="home-priority" data-sec="priority" aria-label="Важное по учёбе">
      <a class="home-priority-link${tip ? ' attention' : ''}" data-home-priority="study" href="${esc(study.link)}">
        <span class="home-priority-icon">${icon(study.icon, 18)}</span><span class="grow"><span class="home-priority-label">${esc(study.label)}</span><b>${esc(study.text)}</b></span>${icon('arrow', 16)}
      </a>
      <a class="home-priority-link" data-home-priority="request" href="${request ? `#/requests/${request.id}` : '#/requests/new/study'}">
        <span class="home-priority-icon">${icon('doc', 18)}</span><span class="grow"><span class="home-priority-label">${request ? esc(request.statusLabel) : 'Заявок пока нет'}</span><b>${request ? esc(request.title) : 'Заказать первую справку'}</b></span>${icon('arrow', 16)}
      </a>
    </section>`;
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
        <div class="stat"><div class="stat-v">${s.avg != null ? num(s.avg, 2) : '—'}</div><div class="stat-l">средний за сессии</div></div>
        <div class="stat"><div class="stat-v">${s.semPace != null ? s.semPace + '%' : '—'}</div><div class="stat-l">от возможного</div></div>
        <div class="stat"><div class="stat-v">${s.rank.place}<span class="small muted" style="font-weight:400">/${s.rank.of}</span></div><div class="stat-l">место в группе</div></div>
      </div>
      ${s.tips.length ? `<div>${s.tips.slice(0, 3).map((t) => `<a class="tip ${t.kind}" href="${t.link}"><span class="dot"></span><span class="grow">${esc(t.text)}</span>${icon('arrow', 14)}</a>`).join('')}</div>` : `<div class="tip"><span class="dot" style="background:var(--mint)"></span><span>Рисков нет — так держать</span></div>`}
    </div>`;
  },

  deadlines() {
    const list = data.deadlines;
    return `<div class="card" data-sec="deadlines"><div class="card-head"><div class="card-title">Дедлайны</div><span class="badge badge-gray">${data.deadlines.length}</span></div>
      ${list.length ? compactList('deadlines', list.map((d) => {
        const soon = d.dueAt - Date.now() < 2 * 864e5;
        const day = dateOfTs(d.dueAt);
        return `<a class="dl ${soon ? 'soon' : ''}" href="${esc(d.link || '#/grades')}"><span class="dl-date"><b>${dateNum(day)}</b><span>${monthShort(day)}</span></span>
          <span class="grow"><b>${esc(d.title)}</b><span class="small muted" style="display:block">${esc(dueLabel(d.dueAt))}${d.discipline ? ' · ' + esc(d.discipline) : ''}</span></span></a>`;
      }), plural(Math.max(0, list.length - 2), ['дедлайн', 'дедлайна', 'дедлайнов'])) : '<div class="empty"><span class="emoji">🗓️</span>Ближайшие две недели — без дедлайнов</div>'}
    </div>`;
  },

  requests() {
    const list = data.requests;
    return `<div class="card" data-sec="requests"><div class="card-head"><div class="card-title">Мои заявки</div><a class="link-arrow" href="#/requests">Все ${icon('arrow', 16)}</a></div>
      ${list.length ? compactList('requests', list.map((r) => `<a class="req-mini" href="#/requests/${r.id}">
        <span class="grow"><span class="req-mini-top"><b>${esc(r.title)}</b>${statusPill(r.status, r.statusLabel)}</span><span class="small muted">№ ${esc(r.number)} · ${esc(when(r.updatedAt))}</span><span style="display:block;margin-top:8px">${pipe(r.steps, r.status)}</span></span></a>`), plural(Math.max(0, list.length - 2), ['заявка', 'заявки', 'заявок']))
        : '<div class="empty"><span class="emoji">📄</span>Активных заявок нет</div>'}
      <a class="btn btn-primary btn-block mt-16" href="#/requests/new">${icon('plus', 18)} Новая справка или заявление</a>
    </div>`;
  },

  changes() {
    const list = data.changes;
    return `<div class="card" data-sec="changes"><div class="card-head"><div><div class="card-title">Изменения расписания</div><div class="card-sub">Переносы, отмены и новые аудитории на две недели</div></div></div>
      ${list.length ? compactList('changes', list.map((it) => { const c = changeLine(it); return `<a class="chg" href="#/schedule"><span class="chg-ic ${c.cls}">${icon(c.icon, 18)}</span><span class="grow"><b>${c.title}</b>${c.sub ? `<span class="small muted" style="display:block">${esc(c.sub)}</span>` : ''}</span></a>`; }), plural(Math.max(0, list.length - 2), ['изменение', 'изменения', 'изменений']))
        : '<div class="empty"><span class="emoji">✅</span>Изменений нет — всё по плану</div>'}
    </div>`;
  },

  news() {
    const list = data.notifications.latest;
    const KIC = { news: 'megaphone', schedule: 'calendar', deadline: 'clock', request: 'doc', grade: 'chart', system: 'spark' };
    return `<div class="card" data-sec="news"><div class="card-head"><div class="card-title">Уведомления</div><a class="link-arrow" href="#/notifications">Все${data.notifications.unread ? ` · ${data.notifications.unread} новых` : ''} ${icon('arrow', 16)}</a></div>
      ${compactList('news', list.map((n) => `<a class="notif ${n.read ? '' : 'unread'}" href="${esc(n.link || '#/notifications')}" style="padding:10px 0"><span class="notif-ic">${icon(KIC[n.kind] || 'bell', 18)}</span><span class="grow small"><b>${esc(n.title)}</b><span class="muted" style="display:block">${esc(n.kindLabel)} · ${esc(when(n.at))}</span></span></a>`), plural(Math.max(0, list.length - 2), ['уведомление', 'уведомления', 'уведомлений'])) || '<div class="empty">Пока тихо</div>'}
    </div>`;
  },

  look() {
    const p = session.play;
    const title = p.titles.find((t) => t.id === p.prof.title && t.id !== 'none');
    return `<div class="card hero-profile" data-sec="look">
      <a class="hero-look" href="#/wardrobe" aria-label="Изменить образ">
        <div class="tg-bg">${backdrop(p.prof.backdrop, p.prof.pattern, { w: 240, h: 320, cy: 140, r0: 64 })}</div>
        <div class="hero-av">${avatarSvg(p.av, { view: 'full' })}</div>
        ${p.av.pet && p.av.pet !== 'none' ? `<div class="hero-pet">${petSvg(p.av.pet, p.av.petColor)}</div>` : ''}
        ${p.prof.emoji ? `<span class="hero-emoji">${p.prof.emoji}</span>` : ''}
        <span class="hero-edit">${icon('edit', 14)} Образ</span>
      </a>
      <div class="hero-info">
        <div><div class="h3">${esc(session.user.name)}</div><div class="muted small mt-4">${esc(session.user.faculty)} · ${session.user.course} курс · ${esc(session.user.group)}</div>${title ? `<span class="badge badge-gold mt-8">${icon('star', 12)} ${esc(title.name)}</span>` : ''}</div>
        <div class="stat-row">
          <a class="stat" href="#/shop"><div class="stat-v tnum">${coin(22)}${fmt(p.coins)}</div><div class="stat-l">М-коинов</div></a>
          <a class="stat" href="#/campus"><div class="stat-v">${p.visited.length}<span class="small muted" style="font-weight:400">/${ROOMS.length}</span></div><div class="stat-l">зон кампуса</div></a>
          <a class="stat" href="#/game"><div class="stat-v">${fmt(p.game.best)}</div><div class="stat-l">рекорд забега</div></a>
        </div>
        <div class="row-wrap"><a class="btn btn-primary" href="#/wardrobe">${icon('hanger', 18)} Гардероб</a><a class="btn btn-secondary" href="#/campus">${icon('building', 18)} В кампус</a></div>
      </div></div>`;
  },

  pet() {
    const p = session.play;
    if (!p.av.pet || p.av.pet === 'none') return `<div class="card pet-card" data-sec="pet"><div class="card-title">Питомец</div><p class="muted mt-8">Питомец подсказывает про пары и дедлайны и растёт, пока вы учитесь</p><a class="btn btn-primary mt-16" href="#/wardrobe">${icon('paw', 18)} Завести питомца</a></div>`;
    const ph = petPhrases();
    const text = ph[phraseI % ph.length];
    const focus = p.pet.focusEnd > Date.now();
    return `<div class="card pet-card" data-sec="pet">
      <div class="card-head" style="margin-bottom:6px"><div><div class="card-title">${esc(p.petName)}</div><div class="card-sub">Уровень ${p.level} · ${p.pet.sessions} ${plural(p.pet.sessions, ['фокус-сессия', 'фокус-сессии', 'фокус-сессий'])}</div></div></div>
      <div class="pet-stage" data-petclick role="button" tabindex="0" aria-label="Погладить питомца">${p.prefs.quiet ? '' : `<div class="pet-bubble">${esc(text)}</div>`}<div class="pet-anim">${petSvg(p.av.pet, p.av.petColor)}</div></div>
      ${focus
        ? `<div class="focus-on mt-12"><span class="tnum" data-focus>25:00</span><span class="small muted grow">учимся вместе — не отвлекайтесь</span><button class="btn btn-sm btn-secondary" data-focus-stop>Стоп</button></div>`
        : `<button class="btn btn-secondary btn-block mt-12" data-focus-start>${icon('clock', 17)} Учиться вместе 25 минут</button>`}
      <div class="bar-label mt-12"><span>Рост · уровень ${p.level}</span><span class="tnum muted">${p.pet.growth % 10} / 10</span></div><div class="bar"><i style="width:${(p.pet.growth % 10) * 10}%"></i></div>
    </div>`;
  },

  campus() {
    const v = session.play.visited;
    let s = `<svg class="mini" viewBox="0 0 300 152" aria-hidden="true"><rect width="300" height="152" fill="#fff"/><rect x="18" y="30" width="264" height="116" rx="4" fill="#0F2D69"/><rect x="96" y="8" width="108" height="22" rx="11" fill="#0F2D69"/><text x="150" y="23" text-anchor="middle" font-family="Onest, Arial" font-size="11" font-weight="700" fill="#E9D7A0">мгимо мания</text>`;
    ROOMS.forEach((r) => {
      const x = r.side === 'r' ? 158 : 26, y = 36 + (2 - r.floor) * 36;
      const on = v.includes(r.id);
      s += `<rect x="${x}" y="${y}" width="116" height="30" rx="3" fill="${on ? '#C9A646' : '#EEF3FC'}"/><text x="${x + 8}" y="${y + 19}" font-family="Onest, Arial" font-size="10" font-weight="600" fill="#0B2150">${r.name}</text>`;
      if (on) s += `<circle cx="${x + 104}" cy="${y + 15}" r="5" fill="#0F2D69"/><path d="M${x + 101.5} ${y + 15} l1.8 1.8 l3.2 -3.4" stroke="#E9D7A0" stroke-width="1.6" fill="none"/>`;
    });
    s += `<rect x="144" y="36" width="12" height="102" fill="#1C438F"/></svg>`;
    return `<div class="card campus-teaser" data-sec="campus">
      <div class="card-head" style="margin:0"><div><div class="card-title">Кампус</div><div class="card-sub">Деканат, библиотека, гардероб — каждая зона ведёт в раздел кабинета</div></div></div>
      ${s}
      <div class="row space"><span class="route-dots">${ROOMS.map((r) => `<i class="${v.includes(r.id) ? 'on' : ''}"></i>`).join('')}</span><span class="small muted">${v.length} из ${ROOMS.length} зон · +${RULES.visitCoins} М-коинов за новую</span></div>
      <a class="btn btn-dark" href="#/campus">${icon('building', 18)} Войти в кампус</a>
    </div>`;
  },

  game() {
    const p = session.play;
    const left = p.gameLeft;
    return `<div class="card game-teaser" data-sec="game">
      <div class="card-head" style="margin:0"><div><div class="card-title">Перерыв: «Бегом на пару»</div><div class="card-sub muted">5 минут в день — и снова за учёбу</div></div><span class="badge" style="background:rgba(255,255,255,.14);color:#fff">${icon('star', 12)} ${fmt(p.game.best)}</span></div>
      <div class="game-art"><svg viewBox="0 0 300 118" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="gt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1C438F"/><stop offset="1" stop-color="#0B1C42"/></linearGradient></defs><rect width="300" height="118" fill="url(#gt)"/><path d="M110 40 L190 40 L300 118 L0 118 Z" fill="#E9EEF7" opacity=".9"/><path d="M137 40 L95 118 M163 40 L205 118" stroke="#C9D3E6" stroke-width="2"/>${[0, 1, 2, 3].map((i) => `<rect x="${147 - i * 6}" y="${46 + i * 18}" width="${6 + i * 12}" height="${3 + i}" fill="#C9A646" opacity=".8"/>`).join('')}<circle cx="232" cy="28" r="10" fill="#C9A646"/><text x="232" y="32" text-anchor="middle" font-family="Onest" font-weight="700" font-size="11" fill="#0B2150">М</text></svg></div>
      <div><div class="bar-label"><span>Осталось сегодня</span><span class="tnum">${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} из 5:00</span></div><div class="bar"><i style="width:${(left / p.gameDaily) * 100}%"></i></div></div>
      <a class="btn btn-gold" href="#/game">${icon('play', 18)} ${left > 0 ? 'Играть' : 'Лимит на сегодня исчерпан'}</a>
    </div>`;
  },
};

// Без игрового слоя главная показывает только учебные карточки: его сбой не мешает учёбе
for (const key of ['steps', 'look', 'pet', 'campus', 'game']) {
  const draw = sec[key];
  sec[key] = () => (session.play && session.play.unavailable ? `<div data-sec="${key}" hidden></div>` : draw());
}

function body() {
  return `${sec.hello()}
    <div class="home-top">${sec.next()}${sec.priority()}${sec.day()}</div>
    ${sec.steps()}
    <div class="grid home-trio mt-20">${sec.mood()}${sec.deadlines()}${sec.requests()}</div>
    <div class="grid g-2 mt-20">${sec.changes()}${sec.news()}</div>
    <details class="home-play mt-32" data-home-more="play" ${detailOpen('play')}>
      <summary><span><span class="h3">Питомец и кампус</span><span class="small muted">Фокус-сессия, образ и короткий перерыв</span></span>${icon('down', 20)}</summary>
      <div class="home-play-body">${sec.look()}<div class="grid g-3 mt-20">${sec.pet()}${sec.campus()}${sec.game()}</div></div>
    </details>`;
}

export default {
  title: 'Главная',
  render() {
    return `<div class="container home-dashboard"><div data-body>${skeleton(1, 60)}<div class="home-top mt-20"><div class="skel" style="height:260px"></div><div class="skel" style="height:260px"></div></div><div class="grid g-3 mt-20">${'<div class="skel" style="height:300px"></div>'.repeat(3)}</div></div></div>`;
  },
  async mount(el, params, app) {
    const box = el.querySelector('[data-body]');
    expandedSections = new Set();
    if (session.play?.pet.focusEnd > Date.now()) expandedSections.add('play');
    el.addEventListener('toggle', (e) => {
      if (!e.target.matches('[data-home-more]')) return;
      const key = e.target.dataset.homeMore;
      if (key === 'day' && !isMobile()) return;
      if (e.target.open) expandedSections.add(key);
      else expandedSections.delete(key);
    }, true);
    const viewport = matchMedia('(max-width: 720px)');
    const syncDisclosure = () => box.querySelectorAll('[data-home-more]').forEach((item) => {
      item.open = (item.dataset.homeMore === 'day' && !viewport.matches) || expandedSections.has(item.dataset.homeMore);
    });
    viewport.addEventListener('change', syncDisclosure);
    async function load() {
      try {
        data = await get('/api/home');
        setPlay(data.play || NO_PLAY);
        box.innerHTML = body();
      } catch (e) {
        if (e.status === 401) return;
        box.innerHTML = errorBox(e);
      }
    }
    await load();
    const repaint = (k) => { const n = box.querySelector(`[data-sec="${k}"]`); if (n && data) n.outerHTML = sec[k](); };

    // Таймер фокус-сессии и обратный отсчёт до пары
    const tick = setInterval(async () => {
      if (!data) return;
      const end = session.play && session.play.pet.focusEnd;
      const node = box.querySelector('[data-focus]');
      if (end && node) {
        const left = Math.max(0, end - Date.now());
        node.textContent = `${String(Math.floor(left / 60e3)).padStart(2, '0')}:${String(Math.floor((left % 60e3) / 1e3)).padStart(2, '0')}`;
        if (!left) {
          try {
            const r = await post('/api/play/focus', { action: 'done' });
            setPlay(r.play);
            toast(`25 минут вместе — ${esc(session.play.petName)} подрос${r.result.coins ? `, +${r.result.coins} М-коинов` : ''}`, { icon: 'paw' });
            fx.confetti({ n: 90 });
          } catch (e) { /* таймер покажет снова */ }
          repaint('pet');
        }
      }
    }, 1000);
    const minute = setInterval(() => {
      // Автоматическое обновление ждёт, пока студент закончит действие в карточке.
      for (const key of ['next', 'day']) {
        const node = box.querySelector(`[data-sec="${key}"]`);
        if (node && !node.contains(document.activeElement) && !node.closest('[inert]')) repaint(key);
      }
    }, 30e3);
    const offPlay = on('play', () => { ['look', 'pet', 'campus', 'game', 'steps'].forEach(repaint); });
    const offRefresh = on('refresh', load);
    // Свежие данные: при возврате во вкладку, после окончания пары и при изменении расписания или заявки.
    // Карточку, в которой стоит фокус, не перерисовываем, чтобы не сбить действие студента.
    let fetchedAt = Date.now();
    const refreshData = async () => {
      if (document.hidden || !data) return;
      try {
        data = await get('/api/home');
        fetchedAt = Date.now();
        setPlay(data.play || NO_PLAY);
        box.querySelectorAll('[data-sec]').forEach((node) => {
          const key = node.dataset.sec;
          if (sec[key] && !node.contains(document.activeElement) && !node.closest('[inert]')) node.outerHTML = sec[key]();
        });
      } catch (e) { /* следующая попытка при следующем событии */ }
    };
    const lessonOver = () => data && data.next && data.next.date === data.now.date && data.next.end && Date.now() - fetchedAt > 60e3
      && mskNow().minutes >= toMin(data.next.end);
    const onVisible = () => { if (!document.hidden && Date.now() - fetchedAt > 30e3) refreshData(); };
    document.addEventListener('visibilitychange', onVisible);
    const offNotif = on('notif', (n) => { if (n && ['schedule', 'request', 'deadline'].includes(n.kind)) refreshData(); });
    const freshness = setInterval(() => { if (lessonOver() || Date.now() - fetchedAt > 5 * 60e3) refreshData(); }, 30e3);

    el.addEventListener('click', async (e) => {
      if (e.target.closest('[data-retry]')) { load(); return; }
      if (e.target.closest('[data-start-guide]')) { openOnboarding(); return; }
      if (e.target.closest('[data-ask]')) { app.ask(); return; }
      const fs = e.target.closest('[data-focus-start]');
      if (fs) {
        const r = await post('/api/play/focus', { action: 'start' }).catch((er) => { toast(esc(er.message), { icon: 'alert' }); return null; });
        if (r) { setPlay(r.play); toast('Таймер на 25 минут запущен. Можно свернуть вкладку — время считает сервер', { icon: 'clock' }); }
        return;
      }
      if (e.target.closest('[data-focus-stop]')) {
        const r = await post('/api/play/focus', { action: 'stop' }).catch(() => null);
        if (r) setPlay(r.play);
        return;
      }
      const pc = e.target.closest('[data-petclick]');
      if (pc) {
        phraseI++;
        repaint('pet');
        const anim = box.querySelector('[data-sec="pet"] .pet-anim');
        if (anim) anim.classList.add('hop');
        return;
      }
      const st = e.target.closest('[data-step]');
      if (st) {
        if (st.dataset.step === 'onboarding') openOnboarding();
        if (st.dataset.step === 'quiz') openQuiz();
        return;
      }
      const cl = e.target.closest('[data-claim]');
      if (cl) {
        const before = session.play.coins;
        try {
          const r = await post('/api/play/steps/claim');
          setPlay(r.play);
          fx.flyCoins(cl.getBoundingClientRect(), before, r.play.coins);
          fx.confetti({ n: 160 });
          toast('Первые шаги пройдены! +200 М-коинов и шапочка выпускника', { icon: 'star', ms: 5000 });
        } catch (er) { toast(esc(er.message), { icon: 'alert' }); }
      }
    });
    el.addEventListener('keydown', (e) => { if (['Enter', ' '].includes(e.key) && e.target.matches('[data-petclick]')) { e.preventDefault(); e.target.click(); } });
    return () => { clearInterval(tick); clearInterval(minute); clearInterval(freshness); offPlay(); offRefresh(); offNotif(); document.removeEventListener('visibilitychange', onVisible); viewport.removeEventListener('change', syncDisclosure); };
  },
};
