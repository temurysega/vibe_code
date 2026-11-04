// Уведомления: деканат, расписание, дедлайны, заявки и оценки в одной ленте с фильтрами и настройками.
import { get, post, patch } from '../lib/api.js';
import { session, setUnread, setPlay, on } from '../lib/bus.js';
import { esc, when, dateOfTs, relDay, dayShort } from '../lib/format.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/overlay.js';
import { skeleton, errorBox } from './common.js';

const KIC = { news: 'megaphone', schedule: 'calendar', deadline: 'clock', request: 'doc', grade: 'chart', system: 'spark' };
const FILTERS = [['all', 'Все'], ['unread', 'Непрочитанные'], ['news', 'Деканат'], ['schedule', 'Расписание'], ['deadline', 'Дедлайны'], ['request', 'Заявки'], ['grade', 'Оценки']];
let list = [];
let unread = 0;
let filter = 'all';

function items() {
  const shown = list.filter((n) => filter === 'all' || (filter === 'unread' ? !n.read : n.kind === filter));
  if (!shown.length) return '<div class="card empty"><span class="emoji">🔕</span>Здесь пока ничего нет</div>';
  let day = '';
  return `<div class="n-list">${shown.map((n) => {
    const d = dateOfTs(n.at);
    const sep = d !== day ? `<div class="n-day">${esc(relDay(d) === 'сегодня' || relDay(d) === 'вчера' ? relDay(d) : dayShort(d))}</div>` : '';
    day = d;
    return `${sep}<button class="n-item ${n.read ? '' : 'unread'} ${n.important ? 'important' : ''}" data-n="${n.id}" data-link="${esc(n.link || '')}">
      <span class="notif-ic">${icon(KIC[n.kind] || 'bell', 20)}</span>
      <span style="min-width:0"><b>${esc(n.title)}</b>${n.body ? `<span class="small" style="display:block;margin-top:4px;color:var(--text)">${esc(n.body)}</span>` : ''}
        <span class="n-meta"><span class="badge badge-gray">${esc(n.kindLabel)}</span><span>${esc(n.scope)}</span>${n.author ? `<span>${esc(n.author)}</span>` : ''}<span>${esc(when(n.at))}</span>${n.important ? `<span class="badge badge-gold">${icon('star', 11)} важное</span>` : ''}</span></span>
    </button>`;
  }).join('')}</div>`;
}

