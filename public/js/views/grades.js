// Успеваемость: «как у меня дела» простыми словами, баллы с прогнозом, сессия и электронная зачётка.
import { get } from '../lib/api.js';
import { session } from '../lib/bus.js';
import { esc, num, plural, dateNum, monthShort, weekdayShort, dayShort, relDay } from '../lib/format.js';
import { icon } from '../ui/icons.js';
import { modal } from '../ui/overlay.js';
import { skeleton, errorBox, teacherModal } from './common.js';

let g = null;
let tab = 'current';
let semPick = null;

const LETTER_TONE = (l) => `letter ${l}`;

function ring(pct) {
  const r = 54, C = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, pct || 0));
  return `<div class="ring"><svg viewBox="0 0 132 132"><circle cx="66" cy="66" r="${r}" fill="none" stroke="#fff" stroke-width="14"/><circle cx="66" cy="66" r="${r}" fill="none" stroke="var(--navy)" stroke-width="14" stroke-linecap="round" stroke-dasharray="${(v / 100) * C} ${C}"/></svg>
    <div class="ring-v"><span><b>${pct == null ? '—' : v + '%'}</b><span>набрано от возможного</span></span></div></div>`;
}

// Шкала дисциплины: набранное, прогноз пунктиром и пороги 60 / 75 / 90
function scale(c) {
  const f = c.forecast == null ? c.earned : c.forecast;
  return `<div class="scale" aria-hidden="true"><span class="forecast" style="left:${c.earned}%;width:${Math.max(0, f - c.earned)}%"></span><span class="earned" style="width:${c.earned}%"></span>
    ${[60, 75, 90].map((m) => `<span class="mark" style="left:${m}%"><span>${m}</span></span>`).join('')}</div>`;
}

function discCard(c) {
  const st = { excellent: ['badge-good', 'идёт на «отлично»'], good: ['badge-soft', 'хорошо'], ok: ['badge-gray', 'стабильно'], risk: ['badge-red', 'в зоне риска'] }[c.status];
  return `<button class="disc ${c.status}" style="--c:${c.color}" data-disc="${c.id}">
    <span class="disc-head"><span><span class="disc-name" style="display:block">${esc(c.name)}</span><span class="small muted">${esc(c.controlLabel)} · ${c.credits} ЗЕ${c.teacher ? ' · ' + esc(c.teacher.short) : ''}</span></span>
      <span class="disc-points">${c.earned}<small> / 100</small></span></span>
    <span class="row-wrap"><span class="badge ${st[0]}">${st[1]}</span>${c.forecast != null ? `<span class="small muted">прогноз ${c.forecast} · ${esc(c.forecastVerdict.label)}</span>` : ''}${c.attendance != null ? `<span class="small muted">посещаемость ${c.attendance}%</span>` : ''}</span>
    ${scale(c)}
    <span class="disc-advice">${icon(c.status === 'risk' ? 'alert' : 'target', 16)}<span>${esc(c.advice)}${c.next ? `. Дальше: ${esc(c.next.title.toLowerCase())}${c.next.date ? ', ' + esc(relDay(c.next.date)) : ''}` : ''}</span></span>
  </button>`;
}

function current() {
  const s = g.summary;
  const ic = s.mood === 'great' ? '🌟' : s.mood === 'warn' ? '⚡' : '🙂';
  return `<div class="grades-hero">
      <div class="card verdict"><div class="row" style="align-items:flex-start;gap:16px"><span class="verdict-ic">${ic}</span><div><span class="eyebrow">Как у меня дела</span><div class="verdict-big mt-4">${esc(s.headline)}</div></div></div>
        <div class="stat-row">
          <div class="stat"><div class="stat-v">${s.avg != null ? num(s.avg, 2) : '—'}</div><div class="stat-l">средний балл прошлых сессий</div></div>
          <div class="stat"><div class="stat-v">${s.excellent}<span class="small muted" style="font-weight:400">/${s.total}</span></div><div class="stat-l">идут на «отлично»</div></div>
          <div class="stat"><div class="stat-v">${s.attendance != null ? s.attendance + '%' : '—'}</div><div class="stat-l">посещаемость</div></div>
        </div>
        ${s.tips.length ? `<div>${s.tips.map((t) => `<a class="tip ${t.kind}" href="${t.link}"><span class="dot"></span><span class="grow">${esc(t.text)}</span>${icon('arrow', 14)}</a>`).join('')}</div>` : ''}
      </div>
      <div class="card"><div class="card-title">Семестр</div><div class="card-sub">${esc(g.semesterLabel)} · ${g.semester} семестр · ${s.credits} ЗЕ</div>
        <div class="ring-wrap mt-16">${ring(s.semPace)}<div class="col" style="gap:8px;min-width:160px;flex:1">
          <div><span class="small muted">Набрано</span><div class="h4">${s.earned} из ${s.possible} баллов</div></div>
          <div><span class="small muted">Место в рейтинге группы</span><div class="h4">${s.rank.place} из ${s.rank.of} · топ-${s.rank.top}%</div></div>
        </div></div>
        <div class="note mt-16">${icon(s.stipend.kind === 'high' ? 'star' : s.stipend.kind === 'none' ? 'info' : 'coins', 18)}<span><b style="font-weight:500">${esc(s.stipend.label)}</b><br><span class="muted">${esc(s.stipend.hint)}</span></span></div>
      </div>
    </div>
    <div class="section-head mt-32"><h2 class="h3">Дисциплины</h2><div class="scale-legend"><span><i style="width:14px;height:8px;border-radius:4px;background:var(--navy)"></i> набрано</span><span><i style="width:14px;height:8px;border-radius:4px;background:repeating-linear-gradient(-45deg,#DCE6F8 0 3px,#C9D6F0 3px 6px)"></i> прогноз</span><span>60 — зачёт · 75 — «хорошо» · 90 — «отлично»</span></div></div>
    <div class="disc-grid">${g.current.slice().sort((a, b) => (a.status === 'risk' ? -1 : 0) - (b.status === 'risk' ? -1 : 0)).map(discCard).join('')}</div>`;
}

function sessionTab() {
  const s = g.session;
  const ex = s.exams;
  const first = ex.find((x) => x.inDays >= 0 && x.kind !== 'consult');
  return `<div class="grid g-main">
    <div class="card"><div class="card-head"><div><div class="card-title">Зачёты и экзамены</div><div class="card-sub">Сессия ${esc(dayShort(s.start))} — ${esc(dayShort(s.end))}</div></div></div>
      ${ex.map((x) => `<div class="exam-row ${x.kind === 'consult' ? 'consult' : ''}"><span class="exam-date"><b>${dateNum(x.date)}</b><span>${monthShort(x.date)}, ${esc(weekdayShort(x.date))}</span></span>
        <div><b style="font-weight:500">${esc(x.discipline)}</b><div class="small muted">${esc(x.kindLabel)} · ${x.time} · ${/^\d+$/.test(x.room) ? 'ауд. ' : ''}${esc(x.room)}${x.teacher ? ' · ' + esc(x.teacher) : ''}</div></div>
        <span class="badge ${x.kind === 'consult' ? 'badge-gray' : x.kind === 'exam' ? 'badge-navy' : 'badge-soft'}">${x.inDays < 0 ? 'прошло' : x.inDays === 0 ? 'сегодня' : `через ${x.inDays} ${plural(x.inDays, ['день', 'дня', 'дней'])}`}</span></div>`).join('')}
    </div>
    <div class="col" style="gap:20px">
      <div class="card ${s.admitted ? '' : 'card-gold'}"><div class="card-title">${s.admitted ? 'Допуск к сессии — идёт по плану' : 'Допуск под вопросом'}</div>
        <p class="muted mt-8">${s.admitted ? 'Рисков и долгов нет. Допуск ставится автоматически после последней контрольной точки.' : 'Закройте риски и долги — тогда допуск поставят автоматически.'}</p>
        ${first ? `<div class="note mt-16">${icon('calendar', 18)}<span>Первое испытание — «${esc(first.discipline)}», ${esc(dayShort(first.date))} в ${first.time}</span></div>` : ''}</div>
      <div class="card"><div class="card-title">Если заболели</div><p class="muted mt-8">Перенос экзамена оформляется заявлением на индивидуальный график — без похода в деканат.</p><a class="btn btn-primary mt-16" href="#/requests/new/individual">${icon('doc', 18)} Подать заявление</a></div>
    </div></div>`;
}

// Средний балл по семестрам — простой линейный график
function chart(hist) {
  const pts = hist.filter((h) => h.avg != null);
  if (pts.length < 2) return '';
  const W = 640, H = 200, L = 40, R = 20, T = 20, B = 30;
  const x = (i) => L + ((W - L - R) * i) / (pts.length - 1);
  const y = (v) => T + (H - T - B) * (1 - (v - 3) / 2);
  const path = pts.map((p, i) => `${x(i)},${y(p.avg)}`).join(' ');
  return `<div class="chart mt-16"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Средний балл по семестрам">
    ${[3, 4, 5].map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#E4E6E9"/><text x="${L - 10}" y="${y(v) + 4}" text-anchor="end" font-size="12" fill="#6B7280">${v}</text>`).join('')}
    <polygon points="${x(0)},${y(3)} ${path} ${x(pts.length - 1)},${y(3)}" fill="#0F2D69" opacity=".08"/>
    <polyline points="${path}" fill="none" stroke="#0F2D69" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.avg)}" r="5" fill="#C9A646" stroke="#fff" stroke-width="2"/><text x="${x(i)}" y="${y(p.avg) - 12}" text-anchor="middle" font-size="12" font-weight="600" fill="#1B1F2A">${num(p.avg, 2)}</text><text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="12" fill="#6B7280">${p.semester} сем.</text>`).join('')}
  </svg></div>`;
}

