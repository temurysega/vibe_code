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

export function openAssistant() {
  if (drawer) { drawer.querySelector('input').focus(); return; }
  const name = session.user ? session.user.firstName : '';
  if (!history.length) history.push({ role: 'assistant', text: `Здравствуйте${name ? ', ' + name : ''}! Я помощник деканата. Подскажу про пары и переносы, баллы, дедлайны, справки и заявления — по вашим данным в кабинете.` });
  drawer = document.createElement('div');
  drawer.className = 'drawer';
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-label', 'Спросить деканат');
  drawer.innerHTML = `<div class="drawer-head"><span class="fab-ic" style="width:38px;height:38px;border-radius:50%;background:var(--gold);color:var(--navy-ink);display:grid;place-items:center">${icon('chat', 18)}</span>
      <div class="grow"><b style="font-weight:500">Спросить деканат</b><small>Видит только ваши данные · концепт</small></div><button class="icon-btn" data-x aria-label="Закрыть">${icon('x', 18)}</button></div>
    <div class="chat" data-chat aria-live="polite">${history.map(msg).join('')}</div>
    <div class="chat-suggest" ${history.some((h) => h.role === 'user') ? 'hidden' : ''}>${SUGGEST.map((s) => `<button type="button" data-s>${esc(s)}</button>`).join('')}</div>
    <form class="chat-form" data-f><input class="input" name="q" maxlength="500" autocomplete="off" placeholder="Напишите вопрос…" aria-label="Вопрос"><button class="btn btn-primary" aria-label="Отправить">${icon('send', 18)}</button></form>`;
  document.body.appendChild(drawer);
  const chat = drawer.querySelector('[data-chat]');
  const input = drawer.querySelector('input');
  const scroll = () => { chat.scrollTop = chat.scrollHeight; };
  scroll();
  setTimeout(() => input.focus(), 50);

  async function ask(q) {
    q = q.trim();
    if (!q) return;
    history.push({ role: 'user', text: q });
    // После первого вопроса подсказки уступают место переписке
    const sug = drawer.querySelector('.chat-suggest');
    if (sug) sug.hidden = true;
    chat.insertAdjacentHTML('beforeend', msg({ role: 'user', text: q }) + '<div class="msg bot" data-typing><span class="typing"><i></i><i></i><i></i></span></div>');
    scroll();
    input.value = '';
    try {
      const r = await post('/api/assistant', { message: q, history: history.slice(-7, -1).map((h) => ({ role: h.role, text: h.text })) });
      const m = { role: 'assistant', text: r.text, link: r.link, source: r.source };
      history.push(m);
      chat.querySelector('[data-typing]').outerHTML = msg(m);
    } catch (e) {
      chat.querySelector('[data-typing]').outerHTML = msg({ role: 'assistant', text: e.message });
    }
    scroll();
  }

  const close = () => { if (drawer) { drawer.remove(); drawer = null; document.removeEventListener('keydown', onKey); } };
  const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('.modal-overlay')) close(); };
  document.addEventListener('keydown', onKey);
  drawer.addEventListener('submit', (e) => { e.preventDefault(); ask(input.value); });
  drawer.addEventListener('click', (e) => {
    if (e.target.closest('[data-x]')) { close(); return; }
    const s = e.target.closest('[data-s]');
    if (s) { ask(s.textContent); return; }
    if (e.target.closest('[data-chat-link]') && window.innerWidth < 720) close();
  });
  window.addEventListener('hashchange', function once() { if (window.innerWidth < 720) close(); window.removeEventListener('hashchange', once); });
}

export function resetAssistant() { history = []; if (drawer) { drawer.remove(); drawer = null; } }
