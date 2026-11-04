// Профиль: учебные данные, контакты деканата и безопасность — сеансы, смена пароля, что хранится.
import { get, post, del } from '../lib/api.js';
import { session } from '../lib/bus.js';
import { esc, stamp, when } from '../lib/format.js';
import { icon } from '../ui/icons.js';
import { toast, confirm } from '../ui/overlay.js';
import { backdrop, ava } from '../art/avatar.js';
import { skeleton, errorBox } from './common.js';

let me = null;
let sec = null;
const shown = {};

// Чувствительное по умолчанию скрыто: номер зачётки и телефон открываются по нажатию
const mask = (key, v) => (shown[key] ? esc(v) : esc(String(v).replace(/[0-9A-Za-zА-Яа-я](?=.{3})/g, '•'))) + ` <button class="reveal" data-reveal="${key}">${shown[key] ? 'скрыть' : 'показать'}</button>`;

function card() {
  const p = session.play;
  const prof = p.prof;
  const title = p.titles.find((t) => t.id === prof.title && t.id !== 'none');
  return `<div class="tg" data-ink="${prof.backdrop === 'navy' || prof.backdrop === 'graphite' || prof.backdrop === 'violet' ? 'light' : 'dark'}" style="--tg-ink:${['navy', 'graphite', 'violet'].includes(prof.backdrop) ? '#fff' : '#1B1F2A'}">
    <div class="tg-bg">${backdrop(prof.backdrop, prof.pattern, { w: 400, h: 340, cy: 120, r0: 70 })}</div>
    <div class="tg-ava">${ava(p, 132)}</div>
    <div class="tg-name">${esc(me.firstName)} ${esc(me.lastName)}${prof.emoji ? ` <span class="emoji">${prof.emoji}</span>` : ''}</div>
    <div class="tg-sub">${esc(me.faculty.short)} · ${me.course} курс · ${esc(me.group)}</div>
    <div class="tg-badges">${title ? `<span class="tg-badge">${icon('star', 13)} ${esc(title.name)}</span>` : ''}<span class="tg-badge">${icon('paw', 13)} ${esc(p.petName)}, ур. ${p.level}</span></div>
  </div>`;
}

