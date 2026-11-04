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

