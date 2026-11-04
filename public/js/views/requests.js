// Заявки и справки: каталог, форма с автозаполнением, статус «как у посылки» и электронная справка.
import { get, post } from '../lib/api.js';
import { session, setPlay, on } from '../lib/bus.js';
import { esc, plural, stamp, when, dayShort, dateLong } from '../lib/format.js';
import { icon } from '../ui/icons.js';
import { modal, toast, confirm } from '../ui/overlay.js';
import * as fx from '../ui/fx.js';
import { logoMark } from '../art/logo.js';
import { skeleton, errorBox, statusPill, pipe, STATUS_ICON } from './common.js';

const STEP_LABEL = { submitted: 'Подана', in_work: 'В работе', ready: 'Готова', issued: 'Выдана', approved: 'Одобрена' };
const DELIVERY = { electronic: ['Электронная', 'PDF с QR-кодом, сразу в кабинете'], paper: ['Бумажная', 'Оригинал с печатью в деканате'] };
const LANG = { ru: 'Русский', en: 'Английский' };
let types = null;
let me = null;

const head = (title, lead, back) => `<div class="page-head"><div>${back ? `<div class="crumbs"><a href="${back[0]}">${icon('back', 14)} ${back[1]}</a></div>` : ''}<h1 class="h1">${title}</h1>${lead ? `<p class="lead">${lead}</p>` : ''}</div></div>`;

