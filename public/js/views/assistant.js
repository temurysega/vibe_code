// «Спросить деканат»: чат с помощником, который видит только данные самого студента.
// Ключ ИИ живёт на сервере — браузер отправляет лишь вопрос и получает ответ.
import { post } from '../lib/api.js';
import { session } from '../lib/bus.js';
import { esc } from '../lib/format.js';
import { icon } from '../ui/icons.js';

const SUGGEST = ['Где у меня завтра пары?', 'Что с моими справками?', 'Сколько баллов до «отлично»?', 'Какие дедлайны на неделе?', 'Как получить справку для визы?'];
let history = [];
let drawer = null;

function msg(m) {
  return `<div class="msg ${m.role === 'user' ? 'me' : 'bot'}">${esc(m.text)}${m.link ? `<br><a class="btn btn-sm btn-primary" href="${esc(m.link.href)}" data-chat-link>${esc(m.link.label)} ${icon('arrow', 14)}</a>` : ''}${m.source ? `<div class="msg-meta">${icon(m.source === 'ai' ? 'sparkles' : 'info', 12)} ${m.source === 'ai' ? 'ответ ИИ по вашим данным' : 'ответ по правилам кабинета'}</div>` : ''}</div>`;
}

