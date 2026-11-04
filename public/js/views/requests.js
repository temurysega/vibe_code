// Заявки и справки: каталог, форма с автозаполнением, статус «как у посылки» и электронная справка.
import { get, post } from '../lib/api.js';
import { session, setPlay, on } from '../lib/bus.js';
import { esc, plural, stamp, when, dayShort, dateLong } from '../lib/format.js';
import { icon } from '../ui/icons.js';
import { modal, toast, confirm } from '../ui/overlay.js';
import * as fx from '../ui/fx.js';
import { logoMark } from '../art/logo.js';
import { skeleton, errorBox, statusPill, pipe, STATUS_ICON } from './common.js';

const STEP_LABEL = { submitted: 'Подана', in_work: 'В работе', ready: 'Готова', issued: 'Выдана', approved: 'Одобрена' };
const DELIVERY = { electronic: ['Электронная', 'PDF с QR-кодом, сразу в кабинете'], paper: ['Бумажная', 'Оригинал с печатью в деканате'] };
const LANG = { ru: 'Русский', en: 'Английский' };
let types = null;
let me = null;

const head = (title, lead, back) => `<div class="page-head"><div>${back ? `<div class="crumbs"><a href="${back[0]}">${icon('back', 14)} ${back[1]}</a></div>` : ''}<h1 class="h1">${title}</h1>${lead ? `<p class="lead">${lead}</p>` : ''}</div></div>`;

async function loadTypes() {
  if (!types) types = (await get('/api/requests/types')).types;
  return types;
}

// ---------- список ----------
function listView(list, filter) {
  const active = list.filter((r) => !['issued', 'approved', 'rejected', 'cancelled'].includes(r.status));
  const shown = filter === 'all' ? list : active;
  return `<div class="row-wrap" style="justify-content:space-between;margin-bottom:20px">
      <div class="seg"><a href="#/requests" class="${filter !== 'all' ? 'on' : ''}">Активные · ${active.length}</a><a href="#/requests/all" class="${filter === 'all' ? 'on' : ''}">Все · ${list.length}</a></div>
      <a class="btn btn-primary" href="#/requests/new">${icon('plus', 18)} Новая заявка</a></div>
    ${shown.length ? `<div class="req-list">${shown.map((r) => `<a class="req-card" href="#/requests/${r.id}"><span class="cat-ic">${icon(r.icon || 'doc', 20)}</span>
      <span style="min-width:0"><b>${esc(r.title)}</b><span class="small muted" style="display:block">№ ${esc(r.number)} · подана ${esc(when(r.createdAt))}${r.delivery !== 'none' ? ' · ' + DELIVERY[r.delivery][0].toLowerCase() : ''}</span>${pipe(r.steps, r.status)}</span>
      ${statusPill(r.status, r.statusLabel)}</a>`).join('')}</div>`
      : `<div class="card empty"><span class="emoji">📭</span><div class="h4">${filter === 'all' ? 'Заявок пока нет' : 'Активных заявок нет'}</div><p class="mt-8">Справку об обучении можно заказать за минуту — электронная готова в течение дня</p><a class="btn btn-primary mt-16" href="#/requests/new/study">Заказать справку</a></div>`}`;
}

