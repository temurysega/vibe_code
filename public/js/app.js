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

async function go() {
  let { name, params } = parse();
  if (name === 'more') return;
  if (!session.user) {
    if (!PUBLIC.includes(name)) { location.replace('#/login'); return; }
  } else if (name === 'login' || !VIEWS[name]) { location.replace(homeOf()); return; }
  // Деканат и студенты видят только свои разделы
  if (session.user && session.user.role === 'dean' && name !== 'dean' && name !== 'verify') { location.replace('#/dean'); return; }
  if (session.user && session.user.role === 'student' && name === 'dean') { location.replace('#/home'); return; }

  const my = ++token;
  modal.closeAll();
  closeMenu();
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  document.body.classList.toggle('is-auth', name === 'login');
  document.body.classList.toggle('is-dean', !!(session.user && session.user.role === 'dean'));
  let view;
  try {
    view = (await VIEWS[name]()).default;
  } catch (e) {
    console.error(e);
    $main.innerHTML = '<div class="container view"><div class="card error-box"><div class="h4">Раздел не загрузился</div><p class="muted mt-8">Проверьте интернет и обновите страницу</p></div></div>';
    return;
  }
  if (my !== token) return;
  current = { name, params, view };
  const el = document.createElement('div');
  el.className = 'view';
  el.innerHTML = view.render(params);
  $main.replaceChildren(el);
  paintChrome(name);
  window.scrollTo(0, 0);
  document.title = `${view.title} · ${APP_NAME}`;
  const c = view.mount ? await view.mount(el, params, app) : null;
  if (my !== token) { if (typeof c === 'function') c(); return; }
  cleanup = typeof c === 'function' ? c : null;
}

// ---------- живые уведомления ----------
let poll = null;
let lastId = null;
function startPolling() {
  stopPolling();
  lastId = null;
  const tick = async () => {
    if (document.hidden || !isStudent()) return;
    try {
      const r = await get('/api/notifications/count');
      setUnread(r.unread);
      if (r.latest) {
        if (lastId != null && r.latest.id > lastId && !r.latest.read) {
          toast(`${esc(r.latest.title)}${r.latest.link ? ` <a href="${esc(r.latest.link)}">Открыть</a>` : ''}`, { icon: 'bell', ms: 6000 });
          emit('notif', r.latest);
        }
        lastId = Math.max(lastId || 0, r.latest.id);
      }
    } catch (e) { /* следующая попытка через 15 секунд */ }
  };
  tick();
  poll = setInterval(tick, 15e3);
}
function stopPolling() { if (poll) clearInterval(poll); poll = null; }
document.addEventListener('visibilitychange', () => { if (!document.hidden && poll) get('/api/notifications/count').then((r) => setUnread(r.unread)).catch(() => {}); });

// ---------- вход и выход ----------
async function loadPlay() {
  const r = await get('/api/play');
  setPlay(r.play);
}

const app = {
  async signedIn(user) {
    session.user = user;
    if (user.role === 'student') { await loadPlay(); startPolling(); }
    location.hash = homeOf();
    setTimeout(() => {
      toast(`Вы вошли как ${esc(user.name)}${user.lastLogin ? ` · прошлый вход ${esc(when(user.lastLogin))}` : ''}`, { icon: 'user' });
      if (isStudent() && !session.play.steps.onboarded) import('./views/onboarding.js').then((m) => m.openOnboarding());
    }, 350);
  },
  ask() { import('./views/assistant.js').then((m) => m.openAssistant()); },
  refresh() { emit('refresh'); },
};

async function signOut() {
  closeMenu();
  try { await post('/api/auth/logout'); } catch (e) { /* сессия уже закрыта */ }
  setCsrf(null);
  reset();
  stopPolling();
  // История чата помощника стирается вместе с сеансом
  import('./views/assistant.js').then((m) => m.resetAssistant()).catch(() => {});
  location.hash = '#/login';
}

on('unauthorized', () => {
  if (!session.user) return;
  reset();
  stopPolling();
  setCsrf(null);
  import('./views/assistant.js').then((m) => m.resetAssistant()).catch(() => {});
  toast('Сессия завершилась — войдите снова', { icon: 'lock' });
  location.hash = '#/login';
});

on('play', ({ play, before }) => {
  const pill = document.querySelector('[data-bal] .bal-num');
  if (pill && before != null && before !== play.coins) countUp(pill, before, play.coins, 700);
  else if (pill) pill.textContent = fmt(play.coins);
  const me = document.querySelector('[data-me]');
  if (me && isStudent()) me.innerHTML = ava(play, 40);
});

on('unread', () => { if (current && session.user) paintChrome(current.name); });

// ---------- общие клики ----------
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-ask]')) { e.preventDefault(); app.ask(); return; }
  if (e.target.closest('[data-about]')) { import('./views/about.js').then((m) => m.openAbout()); return; }
  if (e.target.closest('[data-tour]')) { import('./views/about.js').then((m) => m.startTour()); }
});

