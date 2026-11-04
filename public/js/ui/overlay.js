// Модальные окна, выпадающие меню, тосты и подсказки.
import { esc } from '../lib/format.js';
import { icon } from './icons.js';

let stack = [];

export const modal = {
  open(o) {
    const root = document.getElementById('modal-root');
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML = `<div class="modal ${o.size ? 'm-' + o.size : ''}" role="dialog" aria-modal="true" aria-label="${esc(o.label || o.title || 'Окно')}">
      <button class="modal-x" data-close aria-label="Закрыть">${icon('x', 20)}</button>
      <div class="modal-content"></div></div>`;
    root.appendChild(ov);
    const box = ov.querySelector('.modal');
    const content = ov.querySelector('.modal-content');
    const entry = { ov, box, content, onClose: o.onClose, back: document.activeElement };
    stack.push(entry);
    const render = (html) => { content.innerHTML = html; };
    render(typeof o.html === 'function' ? o.html() : o.html || '');
    ov.addEventListener('mousedown', (e) => { if (e.target === ov && !o.sticky) modal.close(entry); });
    ov.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) modal.close(entry); });
    document.body.style.overflow = 'hidden';
    if (o.onMount) o.onMount(content, entry, render);
    setTimeout(() => {
      const f = box.querySelector('[autofocus]') || box.querySelector('.modal-x');
      if (f) f.focus();
    }, 60);
    return entry;
  },
  close(entry) {
    entry = entry || stack[stack.length - 1];
    if (!entry || !stack.includes(entry)) return;
    stack = stack.filter((m) => m !== entry);
    entry.ov.classList.add('closing');
    setTimeout(() => entry.ov.remove(), 160);
    if (!stack.length) document.body.style.overflow = '';
    if (entry.onClose) entry.onClose();
    if (entry.back && entry.back.focus) try { entry.back.focus({ preventScroll: true }); } catch (e) { /* ничего */ }
  },
  closeAll() { while (stack.length) modal.close(); },
  get isOpen() { return stack.length > 0; },
};

// Простое подтверждение: «Да» / «Отмена»
export function confirm({ title, text, yes = 'Да', no = 'Отмена', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const entry = modal.open({
      label: title,
      html: `<div class="modal-title">${esc(title)}</div>${text ? `<p class="modal-sub">${esc(text)}</p>` : ''}
        <div class="modal-foot"><button class="btn ${danger ? 'btn-danger' : 'btn-primary'} btn-lg" data-yes autofocus>${esc(yes)}</button><button class="btn btn-secondary btn-lg" data-close>${esc(no)}</button></div>`,
      onMount(el) { el.querySelector('[data-yes]').onclick = () => { answered = true; modal.close(entry); resolve(true); }; },
      onClose() { if (!answered) resolve(false); },
    });
  });
}

