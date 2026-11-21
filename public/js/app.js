// Каркас кабинета: полоса концепта, шапка, нижнее меню, роутер, вход и выход, живые уведомления.
import { get, post, setCsrf } from './lib/api.js';
import { on, emit, session, setPlay, setUnread, reset, NO_PLAY } from './lib/bus.js';
import { esc, fmt, when } from './lib/format.js';
import { icon, coin } from './ui/icons.js';
import { modal, openMenu, closeMenu, toast, confirm } from './ui/overlay.js';
import { countUp } from './ui/fx.js';
import { logoMark, wordmark, APP_NAME } from './art/logo.js';
import { ava } from './art/avatar.js';
import { announceSessionChange, onSessionChange } from './lib/session-sync.js';

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
const GAME_VIEWS = ['campus', 'wardrobe', 'shop', 'game'];
const PLAY_OFF = {
  title: 'Студенческая жизнь',
  render: () => `<div class="container"><div class="card empty mt-24" role="status"><div class="h4">Игровой слой сейчас недоступен</div>
    <p class="muted mt-8">Расписание, оценки, заявки и уведомления работают как обычно. Попробуйте открыть раздел позже.</p>
    <a class="btn btn-secondary mt-16" href="#/home">На главную</a></div></div>`,
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
const LIFE = NAV.slice(4);

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
    <span class="concept-links"><button data-about>${icon('shieldOk', 15)} <span class="hide-s">Как защищены данные</span><span class="show-s">Безопасность</span></button>${session.user ? `<button data-tour>${icon('play', 15)} Демо-тур</button>` : ''}${session.sandbox && session.sandbox.id ? `<button class="hide-s" data-sandbox>${icon('key', 15)} Ваш демо-кабинет</button>` : ''}</span>
  </div>`;
}

// Демо-кабинет: своя копия вымышленных данных у каждого проверяющего
function sandboxItem() {
  return session.sandbox && session.sandbox.id ? `<button class="menu-item" data-sandbox>${icon('key', 18)} Ваш демо-кабинет</button>` : '';
}

function sandboxModal() {
  const id = session.sandbox && session.sandbox.id;
  if (!id) return;
  const link = `${location.origin}/?demo=${id}`;
  modal.open({
    label: 'Ваш демо-кабинет',
    html: `<div class="modal-title">Ваш демо-кабинет</div>
      <p class="modal-sub">У каждого проверяющего своя копия вымышленных данных: ваши заявки, объявления и прочитанные уведомления не видят другие, а их действия не меняют ваш кабинет.</p>
      <label class="field mt-20"><span class="field-label">Ссылка для приватного окна или телефона</span>
        <input class="input" readonly value="${esc(link)}" data-sandbox-link aria-describedby="sandbox-hint"></label>
      <p class="small muted mt-8" id="sandbox-hint">Откройте её, чтобы войти как сотрудник деканата и как студент в один и тот же кабинет.</p>
      <div class="modal-foot"><button class="btn btn-primary btn-lg" data-sandbox-copy>${icon('docs', 18)} Скопировать ссылку</button>
        <button class="btn btn-secondary btn-lg" data-sandbox-new>${icon('refresh', 18)} Начать с чистого кабинета</button>
        <button class="btn btn-ghost btn-lg" data-close>Закрыть</button></div>`,
    onMount(el) {
      el.querySelector('[data-sandbox-copy]').onclick = async () => {
        const input = el.querySelector('[data-sandbox-link]');
        try { await navigator.clipboard.writeText(link); toast('Ссылка скопирована', { icon: 'check' }); } catch (e) { input.select(); toast('Выделите ссылку и скопируйте её', { icon: 'info' }); }
      };
      el.querySelector('[data-sandbox-new]').onclick = async () => {
        const ok = await confirm({ title: 'Начать с чистого кабинета?', text: 'Откроется новый демо-кабинет со стартовыми данными. Текущий останется доступен по старой ссылке', yes: 'Начать' });
        if (!ok) return;
        try {
          await post('/api/demo/new', {});
          setCsrf(null);
          reset();
          stopPolling();
          announceSessionChange();
          location.hash = '#/login';
          location.reload();
        } catch (er) { toast(esc(er.message), { icon: 'alert' }); }
      };
    },
  });
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
    $tab.innerHTML = `<a href="#/dean" class="on" aria-current="page"><span class="tb-ic">${icon('doc', 20)}</span>Заявки</a><a href="#more" data-more><span class="tb-ic">${icon('logout', 20)}</span>Выйти</a>`;
    $ask.innerHTML = '';
    return;
  }
  const p = session.play;
  const unread = session.unread;
  $head.innerHTML = `<div class="container">
    <a class="logo" href="#/home" aria-label="${APP_NAME} — главная">${logoMark()}${wordmark()}</a>
    <nav class="nav" aria-label="Разделы">${NAV.slice(0, 4).map(([id, name]) => `<a href="#/${id}" class="${route === id ? 'on' : ''}"${route === id ? ' aria-current="page"' : ''}>${name}</a>`).join('')}
      <button type="button" class="${LIFE.some(([id]) => id === route) ? 'on' : ''}" data-life aria-label="Студенческая жизнь" aria-haspopup="dialog" aria-expanded="false">Студенческая жизнь ${icon('down', 14)}</button></nav>
    <div class="header-right">
      ${p && !p.unavailable ? `<a class="bal-pill" href="#/shop" data-bal title="М-коины — за активность, не за оценки">${coin(26)}<span class="bal-num tnum">${fmt(p.coins)}</span></a>` : ''}
      <button class="icon-btn ask-header" data-ask aria-label="Спросить деканат" title="Спросить деканат">${icon('chat', 20)}</button>
      <button class="icon-btn" data-bell aria-label="Уведомления${unread ? `: ${unread} новых` : ''}">${icon('bell', 20)}${unread ? `<span class="badge-dot">${unread > 9 ? '9+' : unread}</span>` : ''}</button>
      <button class="me-btn" data-me aria-label="Меню профиля">${p && !p.unavailable ? ava(p, 40) : `<span class="me-initial">${esc((u.firstName || '?')[0])}</span>`}</button>
    </div>
  </div>`;
  $tab.className = 'tabbar';
  $tab.innerHTML = TABS.map(([id, name, ic]) => `<a href="#/${id}" class="${route === id ? 'on' : ''}"${route === id ? ' aria-current="page"' : ''}><span class="tb-ic">${icon(ic, 20)}</span>${name}</a>`).join('') +
    `<a href="#more" data-more class="${['notifications', 'campus', 'wardrobe', 'shop', 'game', 'profile'].includes(route) ? 'on' : ''}"><span class="tb-ic">${icon('plus', 20)}</span>Ещё${unread ? '<span class="tb-dot"></span>' : ''}</a>`;
  // Помощник остаётся в закреплённой шапке и не перекрывает формы и карточки.
  $ask.innerHTML = '';
}

// ---------- роутер ----------
let current = null;
let cleanup = null;
let token = 0;
let sessionReloading = false;

function reloadChangedSession() {
  if (sessionReloading) return;
  sessionReloading = true;
  ++token;
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  stopPolling();
  reset();
  setCsrf(null);
  modal.closeAll();
  closeMenu();
  // Убираем прежние данные до сетевой загрузки и очищаем кеши модулей перезагрузкой.
  document.querySelectorAll('.drawer, .drawer-overlay').forEach((el) => el.remove());
  $head.replaceChildren();
  $tab.replaceChildren();
  $ask.replaceChildren();
  document.getElementById('toast-root')?.replaceChildren();
  $main.innerHTML = '<div class="container view"><p role="status">Сеанс изменился в другой вкладке. Обновляем кабинет…</p></div>';
  location.reload();
}

onSessionChange(reloadChangedSession);
on('sessionchanged', reloadChangedSession);

function parse() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map((x) => {
    try { return decodeURIComponent(x); } catch { return x; }
  });
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
    if (isStudent() && (!session.play || (session.play.unavailable && GAME_VIEWS.includes(name)))) await loadPlay();
    // Игровые разделы без игрового API показывают понятную заглушку, учебные работают как обычно
    view = isStudent() && session.play.unavailable && GAME_VIEWS.includes(name) ? PLAY_OFF : (await VIEWS[name]()).default;
  } catch (e) {
    console.error(e);
    if (my !== token) return;
    paintChrome(name);
    $main.innerHTML = '<div class="container view"><div class="card error-box" role="alert"><div class="h4">Раздел не загрузился</div><p class="muted mt-8">Проверьте интернет и попробуйте ещё раз</p><button class="btn btn-primary mt-16" data-retry>Повторить</button></div></div>';
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
  $main.focus({ preventScroll: true });
  document.title = `${view.title} · ${APP_NAME}`;
  try {
    const c = view.mount ? await view.mount(el, params, app) : null;
    if (my !== token) { if (typeof c === 'function') c(); return; }
    cleanup = typeof c === 'function' ? c : null;
  } catch (e) {
    if (my !== token) return;
    console.error(e);
    el.innerHTML = '<div class="container"><div class="card error-box" role="alert"><div class="h4">Не удалось открыть раздел</div><p class="muted mt-8">Попробуйте загрузить его снова</p><button class="btn btn-primary mt-16" data-retry>Повторить</button></div></div>';
  }
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
  try {
    const r = await get('/api/play');
    setPlay(r.play);
  } catch (e) {
    // Сбой игрового API не мешает войти и работать с расписанием, оценками и заявками
    if (e.status === 401) throw e;
    setPlay(NO_PLAY);
  }
}

// Демо-кабинет проверяющего: код нужен, чтобы показать ссылку для второго окна или телефона
async function loadSandbox() {
  try { session.sandbox = await get('/api/demo'); } catch (e) { session.sandbox = null; }
  paintConcept();
}

const app = {
  async signedIn(user) {
    session.user = user;
    announceSessionChange();
    if (user.role === 'student') { await loadPlay(); startPolling(); }
    loadSandbox();
    location.hash = homeOf();
    setTimeout(() => {
      if (session.user !== user || sessionReloading) return;
      // На телефоне сообщение о входе перекрывало бы первую карточку — прошлый вход виден в профиле
      if (!matchMedia('(max-width: 720px)').matches) toast(`Вы вошли как ${esc(user.name)}${user.lastLogin ? ` · прошлый вход ${esc(when(user.lastLogin))}` : ''}`, { icon: 'user', ms: 3600 });
      if (isStudent() && session.play && !session.play.steps.onboarded) import('./views/onboarding.js').then((m) => m.openOnboarding());
    }, 350);
  },
  ask() { import('./views/assistant.js').then((m) => m.openAssistant()); },
  refresh() { emit('refresh'); },
};

async function signOut() {
  closeMenu();
  try { await post('/api/auth/logout'); } catch (e) {
    if (e.status !== 401) { toast('Не удалось завершить сеанс. Проверьте связь и нажмите «Выйти» ещё раз', { icon: 'alert' }); return; }
  }
  setCsrf(null);
  reset();
  stopPolling();
  announceSessionChange();
  // История чата помощника стирается вместе с сеансом
  import('./views/assistant.js').then((m) => m.resetAssistant()).catch(() => {});
  location.hash = '#/login';
}

on('unauthorized', () => {
  if (!session.user) return;
  reset();
  stopPolling();
  setCsrf(null);
  announceSessionChange();
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

on('unread', () => {
  // Счётчик меняется без пересоздания шапки: открытое меню и фокус остаются на месте.
  if (!current || !isStudent()) return;
  const n = session.unread;
  const bell = $head.querySelector('[data-bell]');
  if (bell) {
    bell.setAttribute('aria-label', `Уведомления${n ? `: ${n} новых` : ''}`);
    let badge = bell.querySelector('.badge-dot');
    if (n) {
      if (!badge) { badge = document.createElement('span'); badge.className = 'badge-dot'; bell.appendChild(badge); }
      badge.textContent = n > 9 ? '9+' : n;
    } else badge?.remove();
  }
  const more = $tab.querySelector('[data-more]');
  if (more) {
    const dot = more.querySelector('.tb-dot');
    if (n && !dot) { const el = document.createElement('span'); el.className = 'tb-dot'; more.appendChild(el); }
    else if (!n) dot?.remove();
  }
});

// ---------- общие клики ----------
document.addEventListener('click', (e) => {
  if (e.target.closest('.skip')) { e.preventDefault(); $main.focus(); return; }
  if (e.target.closest('[data-ask]')) { e.preventDefault(); app.ask(); return; }
  if (e.target.closest('[data-about]')) { import('./views/about.js').then((m) => m.openAbout()); return; }
  if (e.target.closest('[data-tour]')) { import('./views/about.js').then((m) => m.startTour()); }
  if (e.target.closest('#concept [data-sandbox]')) sandboxModal();
});

// Один обработчик повторной загрузки работает и при сбое до mount раздела.
$main.addEventListener('click', (e) => {
  if (!e.target.closest('[data-retry]')) return;
  e.preventDefault();
  e.stopPropagation();
  go();
}, true);

$head.addEventListener('click', async (e) => {
  const life = e.target.closest('[data-life]');
  if (life) {
    e.stopPropagation();
    openMenu(life, LIFE.map(([id, name, ic]) => `<a class="menu-item" href="#/${id}">${icon(ic, 18)} ${name}</a>`).join(''), (menu) => {
      menu.addEventListener('click', (event) => { if (event.target.closest('a')) closeMenu(); });
    });
    return;
  }
  const bell = e.target.closest('[data-bell]');
  if (bell) {
    e.stopPropagation();
    const m = openMenu(bell, '<div class="small muted" style="padding:12px">Загружаем…</div>', null, { width: 'min(380px, calc(100vw - 24px))' });
    try {
      const r = await get('/api/notifications');
      setUnread(r.unread);
      const KIC = { news: 'megaphone', schedule: 'calendar', deadline: 'clock', request: 'doc', grade: 'chart', system: 'spark' };
      m.innerHTML = `<div style="padding:8px 12px 4px" class="row space"><b style="font-weight:500">Уведомления</b>${r.unread ? '<button class="link small" data-readall>Прочитать все</button>' : '<span class="small muted">всё прочитано</span>'}</div>
        ${r.list.slice(0, 6).map((n) => `<button class="notif ${n.read ? '' : 'unread'}" style="width:100%;border:0;background:transparent;text-align:left;cursor:pointer" data-go="${esc(n.link || '#/notifications')}" data-id="${n.id}"><span class="notif-ic">${icon(KIC[n.kind] || 'bell', 18)}</span><span class="grow small"><b style="display:block">${esc(n.title)}</b><span class="muted">${esc(n.kindLabel)} · ${esc(when(n.at))}</span></span></button>`).join('')}
        <div class="menu-sep"></div><button class="menu-item" data-go="#/notifications">${icon('bell', 18)} Все уведомления</button>`;
      m.addEventListener('click', async (ev) => {
        if (ev.target.closest('[data-readall]')) {
          ev.stopPropagation();
          const x = await post('/api/notifications/read', { all: true }).catch(() => null);
          if (x) { setUnread(x.unread); closeMenu(); toast('Все уведомления прочитаны'); emit('refresh'); }
          return;
        }
        const g = ev.target.closest('[data-go]');
        if (!g) return;
        closeMenu();
        if (g.dataset.id) post('/api/notifications/read', { ids: [Number(g.dataset.id)] }).then((x) => setUnread(x.unread)).catch(() => {});
        location.hash = g.dataset.go;
      });
    } catch (er) { m.innerHTML = `<div class="small muted" style="padding:12px">${esc(er.message)}</div>`; }
    return;
  }
  const me = e.target.closest('[data-me]');
  if (me) {
    e.stopPropagation();
    const u = session.user;
    const items = isStudent()
      ? `<button class="menu-item" data-go="#/profile">${icon('user', 18)} Профиль и безопасность</button>
         <button class="menu-item" data-go="#/wardrobe">${icon('hanger', 18)} Изменить образ</button>
         <button class="menu-item" data-go="#/notifications">${icon('bell', 18)} Уведомления</button>
         <div class="menu-sep"></div>
         <button class="menu-item" data-monb>${icon('door', 18)} Знакомство заново</button>
         <button class="menu-item" data-about>${icon('shieldOk', 18)} Как защищены данные</button>${sandboxItem()}`
      : `<button class="menu-item" data-about>${icon('shieldOk', 18)} Как защищены данные</button>${sandboxItem()}`;
    openMenu(me, `<div class="row" style="padding:10px 12px">${isStudent() && session.play && !session.play.unavailable ? ava(session.play, 44) : ''}<div><b style="font-weight:500">${esc(u.name)}</b><div class="small muted">${esc(u.login)}</div></div></div><div class="menu-sep"></div>${items}<div class="menu-sep"></div>
      <button class="menu-item" data-out>${icon('logout', 18)} Выйти</button>`, (m) => {
      m.addEventListener('click', (ev) => {
        const g = ev.target.closest('[data-go]');
        if (g) { closeMenu(); location.hash = g.dataset.go; return; }
        if (ev.target.closest('[data-monb]')) {
          closeMenu();
          if (session.play && session.play.unavailable) { toast('Игровой слой сейчас недоступен — учебные разделы работают', { icon: 'info' }); return; }
          import('./views/onboarding.js').then((x) => x.openOnboarding());
          return;
        }
        if (ev.target.closest('[data-sandbox]')) { closeMenu(); sandboxModal(); return; }
        if (ev.target.closest('[data-about]')) { closeMenu(); return; }
        if (ev.target.closest('[data-out]')) signOut();
      });
    });
  }
});

$tab.addEventListener('click', (e) => {
  const more = e.target.closest('[data-more]');
  if (!more) return;
  e.preventDefault();
  e.stopPropagation();
  if (!isStudent()) { confirm({ title: 'Выйти из кабинета?', yes: 'Выйти' }).then((ok) => ok && signOut()); return; }
  const n = session.unread;
  openMenu(more, `${[['notifications', `Уведомления${n ? ` · ${n}` : ''}`, 'bell'], ...NAV.filter(([id]) => !TABS.some((t) => t[0] === id)), ['profile', 'Профиль и безопасность', 'user']]
    .map(([id, name, ic]) => `<button class="menu-item" data-go="#/${id}">${icon(ic, 18)} ${name}</button>`).join('')}
    <button class="menu-item" data-askm>${icon('chat', 18)} Спросить деканат</button>
    <button class="menu-item" data-tourm>${icon('play', 18)} Демо-тур по кабинету</button>${sandboxItem()}
    <div class="menu-sep"></div><button class="menu-item" data-out>${icon('logout', 18)} Выйти</button>`, (m) => {
    m.addEventListener('click', (ev) => {
      const g = ev.target.closest('[data-go]');
      if (g) { closeMenu(); location.hash = g.dataset.go; return; }
      if (ev.target.closest('[data-askm]')) { closeMenu(); app.ask(); return; }
      if (ev.target.closest('[data-tourm]')) { closeMenu(); import('./views/about.js').then((x) => x.startTour()); return; }
      if (ev.target.closest('[data-sandbox]')) { closeMenu(); sandboxModal(); return; }
      if (ev.target.closest('[data-out]')) signOut();
    });
  }, { up: true });
});

window.addEventListener('scroll', () => { $head.classList.toggle('scrolled', window.scrollY > 4); }, { passive: true });
window.addEventListener('hashchange', go);

// Восстановленная/спавшая вкладка могла пропустить сообщение о смене аккаунта.
let lastSessionCheck = 0;
function checkVisibleSession() {
  if (sessionReloading || document.hidden || Date.now() - lastSessionCheck < 1000) return;
  if (document.querySelector('.auth-form [data-submit]:disabled')) return;
  lastSessionCheck = Date.now();
  get('/api/auth/session').then(() => {
    if (!session.user) reloadChangedSession();
  }).catch((e) => { if (e.status === 401 && session.user) emit('unauthorized'); });
}
window.addEventListener('focus', checkVisibleSession);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkVisibleSession(); });
window.addEventListener('pageshow', (event) => { if (event.persisted) reloadChangedSession(); });

async function boot() {
  paintConcept();
  paintFoot();
  loadSandbox();
  try {
    const r = await get('/api/auth/session');
    session.user = r.user;
    setCsrf(r.csrf);
    if (isStudent()) { await loadPlay(); startPolling(); }
  } catch (e) { /* не вошли — покажем экран входа */ }
  await go();
}
boot();
