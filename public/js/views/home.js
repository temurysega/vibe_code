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

