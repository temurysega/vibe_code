// Модальные окна, выпадающие меню, тосты и подсказки.
import { esc } from '../lib/format.js';
import { icon } from './icons.js';

let stack = [];
const focusables = (root) => [...root.querySelectorAll('button, a[href], input, select, textarea, [tabindex]')]
  .filter((el) => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length && !el.closest('[inert]'));
function syncModalAccess() {
  const top = stack[stack.length - 1];
  for (const id of ['concept', 'header', 'main', 'foot', 'tabbar', 'ask']) {
    const el = document.getElementById(id);
    if (el) el.inert = !!top;
  }
  stack.forEach((entry) => { entry.ov.inert = entry !== top; });
}

export const modal = {
  open(o) {
    closeMenu();
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
    syncModalAccess();
    const render = (html) => { content.innerHTML = html; };
    render(typeof o.html === 'function' ? o.html() : o.html || '');
    ov.addEventListener('mousedown', (e) => { if (e.target === ov && !o.sticky) modal.close(entry); });
    ov.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) modal.close(entry); });
    document.body.style.overflow = 'hidden';
    if (o.onMount) o.onMount(content, entry, render);
    setTimeout(() => {
      if (stack[stack.length - 1] !== entry) return;
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
    entry.ov.inert = true;
    syncModalAccess();
    setTimeout(() => entry.ov.remove(), 160);
    if (!stack.length) document.body.style.overflow = '';
    if (entry.onClose) entry.onClose();
    if (entry.back && entry.back.isConnected && !entry.back.closest('[inert]')) try { entry.back.focus({ preventScroll: true }); } catch (e) { /* ничего */ }
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

document.addEventListener('keydown', (e) => {
  if (e.key === 'Tab' && stack.length) {
    const box = stack[stack.length - 1].box;
    const all = focusables(box);
    const first = all[0], last = all[all.length - 1];
    if (e.shiftKey && (document.activeElement === first || !box.contains(document.activeElement))) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || !box.contains(document.activeElement))) { e.preventDefault(); first?.focus(); }
    return;
  }
  if (e.key !== 'Escape') return;
  if (document.querySelector('.menu')) { closeMenu(); return; }
  if (stack.length) modal.close();
});

// ---------- выпадающее меню ----------
let away = null;
let menuAnchor = null;
export function openMenu(anchor, html, onMount, opt = {}) {
  closeMenu();
  menuAnchor = anchor;
  anchor.setAttribute('aria-expanded', 'true');
  const m = document.createElement('div');
  m.className = 'menu';
  m.setAttribute('role', 'dialog');
  m.setAttribute('aria-label', anchor.getAttribute('aria-label') || 'Быстрые действия');
  m.innerHTML = html;
  document.body.appendChild(m);
  if (opt.width) m.style.width = opt.width;
  const r = anchor.getBoundingClientRect();
  const w = m.offsetWidth;
  if (opt.up) m.style.bottom = window.innerHeight - r.top + 8 + 'px';
  else m.style.top = r.bottom + 8 + 'px';
  m.style.maxHeight = Math.max(100, (opt.up ? r.top : window.innerHeight - r.bottom) - 20) + 'px';
  m.style.left = Math.max(12, Math.min(window.innerWidth - w - 12, r.right - w)) + 'px';
  setTimeout(() => {
    if (!m.isConnected) return;
    away = (e) => { if (!m.contains(e.target)) closeMenu(); };
    document.addEventListener('click', away);
    focusables(m)[0]?.focus();
  }, 0);
  if (onMount) onMount(m);
  return m;
}
export function closeMenu() {
  const focused = document.activeElement?.closest('.menu');
  document.querySelectorAll('.menu').forEach((m) => m.remove());
  if (away) document.removeEventListener('click', away);
  away = null;
  menuAnchor?.setAttribute('aria-expanded', 'false');
  if (focused && menuAnchor?.isConnected) menuAnchor.focus({ preventScroll: true });
  menuAnchor = null;
}

// ---------- тосты ----------
export function toast(html, opt = {}) {
  const root = document.getElementById('toast-root');
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.innerHTML = `<span class="toast-ic">${opt.coin ? '<b style="font-size:14px">М</b>' : icon(opt.icon || 'check', 18, 2.2)}</span><span>${html}</span>`;
  root.appendChild(t);
  // Не больше трёх тостов одновременно
  while (root.children.length > 3) root.firstElementChild.remove();
  const hide = () => { t.classList.add('out'); setTimeout(() => t.remove(), 260); };
  const timer = setTimeout(hide, opt.ms || 3600);
  // Нажатие в любом месте тоста закрывает его: на телефоне он стоит над учебным содержимым
  t.addEventListener('click', () => { clearTimeout(timer); hide(); });
}

// ---------- подсказки ----------
const tip = () => document.getElementById('tooltip');
document.addEventListener('mouseover', (e) => {
  const el = e.target.closest && e.target.closest('[data-tip]');
  const t = tip();
  if (!t) return;
  if (!el) { t.hidden = true; return; }
  t.innerHTML = el.getAttribute('data-tip');
  t.hidden = false;
});
document.addEventListener('mousemove', (e) => {
  const t = tip();
  if (!t || t.hidden) return;
  const w = t.offsetWidth, h = t.offsetHeight;
  let x = e.clientX + 14, y = e.clientY - h - 12;
  if (x + w > window.innerWidth - 8) x = e.clientX - w - 14;
  if (y < 8) y = e.clientY + 18;
  t.style.left = x + 'px';
  t.style.top = y + 'px';
});
document.addEventListener('focusout', () => { const t = tip(); if (t) t.hidden = true; });
