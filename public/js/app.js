// Каркас кабинета: полоса концепта, шапка, нижнее меню, роутер, вход и выход, живые уведомления.
import { get, post, setCsrf } from './lib/api.js';
import { on, emit, session, setPlay, setUnread, reset } from './lib/bus.js';
import { esc, fmt, when } from './lib/format.js';
import { icon, coin } from './ui/icons.js';
import { modal, openMenu, closeMenu, toast, confirm } from './ui/overlay.js';
import { countUp } from './ui/fx.js';
import { logoMark, wordmark, APP_NAME } from './art/logo.js';
import { ava } from './art/avatar.js';

// Разделы подгружаются по требованию: телефону не нужно качать весь кабинет сразу
const VIEWS = {
  login: () => import('./views/login.js'),
  home: () => import('./views/home.js'),
  schedule: () => import('./views/schedule.js'),
  grades: () => import('./views/grades.js'),
  requests: () => import('./views/requests.js'),
  notifications: () => import('./views/notifications.js'),
  profile: () => import('./views/profile.js'),
  campus: () => import('./views/campus.js'),
  wardrobe: () => import('./views/wardrobe.js'),
  shop: () => import('./views/shop.js'),
  game: () => import('./views/game.js'),
  dean: () => import('./views/dean.js'),
  verify: () => import('./views/verify.js'),
};
// Без входа доступны только экран входа и проверка подлинности справки
const PUBLIC = ['login', 'verify'];

const NAV = [
  ['home', 'Главная', 'home'],
  ['schedule', 'Расписание', 'calendar'],
  ['grades', 'Успеваемость', 'chart'],
  ['requests', 'Заявки', 'doc'],
  ['campus', 'Кампус', 'building'],
  ['wardrobe', 'Гардероб', 'hanger'],
  ['shop', 'Лавка', 'bag'],
  ['game', 'Перерыв', 'play'],
];
const TABS = [['home', 'Главная', 'home'], ['schedule', 'Расписание', 'calendar'], ['grades', 'Оценки', 'chart'], ['requests', 'Заявки', 'doc']];

const $concept = document.getElementById('concept');
const $head = document.getElementById('header');
const $main = document.getElementById('main');
const $tab = document.getElementById('tabbar');
const $foot = document.getElementById('foot');
const $ask = document.getElementById('ask');

const isStudent = () => !!(session.user && session.user.role === 'student');
const homeOf = () => (session.user && session.user.role === 'dean' ? '#/dean' : '#/home');

// ---------- оформление ----------
function paintConcept() {
  $concept.innerHTML = `<div class="container">
    <span class="concept-text"><b>Концепт для конкурса</b><span>· не официальный сервис МГИМО · все люди и данные вымышлены</span></span>
    <span class="concept-links"><button data-about>${icon('shieldOk', 15)} <span class="hide-s">Как защищены данные</span><span class="show-s">Безопасность</span></button>${session.user ? `<button data-tour>${icon('play', 15)} Демо-тур</button>` : ''}</span>
  </div>`;
}

function paintFoot() {
  $foot.innerHTML = `<div class="container"><span><b>${APP_NAME}</b> — концепт личного кабинета студента для конкурса. Не является официальным сервисом МГИМО; знак — собственный, не логотип вуза. Все люди и данные вымышлены.</span><span>Шрифт Onest — SIL Open Font License 1.1</span></div>`;
}

function paintChrome(route) {
  paintConcept();
  if (!session.user) { $head.innerHTML = ''; $tab.innerHTML = ''; $ask.innerHTML = ''; return; }
  const u = session.user;
  $head.className = 'header' + (window.scrollY > 4 ? ' scrolled' : '');
  if (u.role === 'dean') {
    $head.innerHTML = `<div class="container">
      <a class="logo" href="#/dean" aria-label="${APP_NAME} — деканат">${logoMark()}${wordmark()}</a>
      <nav class="nav" aria-label="Разделы"><a href="#/dean" class="on">Заявки факультета</a></nav>
      <div class="header-right"><span class="role-pill">${icon('building', 15)} Деканат ${esc(u.faculty)}</span>
        <button class="me-btn icon-btn" data-me aria-label="Меню профиля" style="background:var(--navy);color:#fff;font-weight:600;font-size:14px">${esc((u.firstName || '?')[0])}</button></div>
    </div>`;
    $tab.className = 'tabbar';
    $tab.innerHTML = `<a href="#/dean" class="on"><span class="tb-ic">${icon('doc', 20)}</span>Заявки</a><a href="#more" data-more><span class="tb-ic">${icon('logout', 20)}</span>Выйти</a>`;
    $ask.innerHTML = '';
    return;
  }
  const p = session.play;
  const unread = session.unread;
  $head.innerHTML = `<div class="container">
    <a class="logo" href="#/home" aria-label="${APP_NAME} — главная">${logoMark()}${wordmark()}</a>
    <nav class="nav" aria-label="Разделы">${NAV.map(([id, name]) => `<a href="#/${id}" class="${route === id ? 'on' : ''}">${name}</a>`).join('')}</nav>
    <div class="header-right">
      <a class="bal-pill" href="#/shop" data-bal title="М-коины — за активность, не за оценки">${coin(26)}<span class="bal-num tnum">${fmt(p ? p.coins : 0)}</span></a>
      <button class="icon-btn" data-bell aria-label="Уведомления${unread ? `: ${unread} новых` : ''}">${icon('bell', 20)}${unread ? `<span class="badge-dot">${unread > 9 ? '9+' : unread}</span>` : ''}</button>
      <button class="me-btn" data-me aria-label="Меню профиля">${p ? ava(p, 40) : ''}</button>
    </div>
  </div>`;
  $tab.className = 'tabbar';
  $tab.innerHTML = TABS.map(([id, name, ic]) => `<a href="#/${id}" class="${route === id ? 'on' : ''}"><span class="tb-ic">${icon(ic, 20)}</span>${name}</a>`).join('') +
    `<a href="#more" data-more class="${['notifications', 'campus', 'wardrobe', 'shop', 'game', 'profile'].includes(route) ? 'on' : ''}"><span class="tb-ic">${icon('plus', 20)}</span>Ещё${unread ? '<span class="tb-dot"></span>' : ''}</a>`;
  $ask.innerHTML = `<button class="ask-fab" data-ask aria-label="Спросить деканат"><span class="fab-ic">${icon('chat', 18)}</span><span class="fab-text">Спросить деканат</span></button>`;
}

// ---------- роутер ----------
let current = null;
let cleanup = null;
let token = 0;

function parse() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map((x) => decodeURIComponent(x));
  return { name: parts[0] || '', params: parts.slice(1) };
}

