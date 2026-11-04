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

