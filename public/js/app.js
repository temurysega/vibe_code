// Каркас кабинета: полоса концепта, шапка, нижнее меню, роутер, вход и выход, живые уведомления.
import { get, post, setCsrf } from './lib/api.js';
import { on, emit, session, setPlay, setUnread, reset } from './lib/bus.js';
import { esc, fmt, when } from './lib/format.js';
import { icon, coin } from './ui/icons.js';
import { modal, openMenu, closeMenu, toast, confirm } from './ui/overlay.js';
import { countUp } from './ui/fx.js';
import { logoMark, wordmark, APP_NAME } from './art/logo.js';
import { ava } from './art/avatar.js';

