// Вход по логину и паролю. В демо-режиме под формой — тестовые учётные записи для жюри.
// Настоящие логины и пароли МГИМО здесь не принимаются: сервер знает только демо-аккаунты.
import { get, post, setCsrf } from '../lib/api.js';
import { session } from '../lib/bus.js';
import { esc } from '../lib/format.js';
import { icon } from '../ui/icons.js';
import { logoMark, wordmark } from '../art/logo.js';
import { svg as avatarSvg, pet, backdrop } from '../art/avatar.js';

// Персонажи обложки — не связаны с учётными записями
const CROWD = [
  ['', { body: 'f', skin: 's2', hair: 'long', hairColor: 'brown', eyes: 'lashes', mouth: 'smile', cheeks: 'blush', top: 'blazer', topColor: 'navy', bottom: 'skirt', bottomColor: 'graphite', shoes: 'loafers', shoesColor: 'black', extra: 'scarf', extraColor: 'gold' }],
  ['big', { body: 'm', skin: 's3', hair: 'short', hairColor: 'black', eyes: 'round', mouth: 'grin', top: 'mgimo-hoodie', bottom: 'jeans', bottomColor: 'denim', shoes: 'sneakers', shoesColor: 'navy', hat: 'mortarboard' }],
  ['', { body: 'f', skin: 's1', hair: 'bob', hairColor: 'ginger', eyes: 'round', mouth: 'smirk', cheeks: 'freckles', top: 'turtleneck', topColor: 'cream', bottom: 'trousers', bottomColor: 'navy', shoes: 'boots', shoesColor: 'black', glasses: 'round' }],
  ['far', { body: 'm', skin: 's5', hair: 'curly', hairColor: 'black', eyes: 'happy', mouth: 'smile', top: 'mun-bomber', bottom: 'trousers', bottomColor: 'beige', shoes: 'sneakers', shoesColor: 'gray' }],
];

function hero() {
  return `<section class="auth-hero">
    <div class="tg-bg">${backdrop('navy', 'globes', { w: 760, h: 960, cy: 720, r0: 170 })}</div>
    <div><span class="logo">${logoMark()}${wordmark()}</span></div>
    <h1 class="auth-title">Учёба, справки и деканат —<br><span>в одном окне</span></h1>
    <p class="auth-lead">Расписание с переносами, баллы с прогнозом, справки онлайн и уведомления деканата — с телефона и компьютера</p>
    <div class="auth-crowd">${CROWD.map(([cls, av]) => `<div class="p ${cls}">${avatarSvg(av, { view: 'full' })}</div>`).join('')}
      <div class="auth-pet">${pet('owl')}</div>
      <span class="auth-float f1"><span class="ic">${icon('check', 15, 2.4)}</span>Справка готова — можно скачать</span>
      <span class="auth-float f2"><span class="ic">${icon('pin', 15)}</span>Теория МО: ауд. 3047</span>
      <span class="auth-float f3"><span class="ic">${icon('chart', 15)}</span>До «отлично» — 6 баллов</span>
    </div>
  </section>`;
}

function accounts(demo) {
  if (!demo || !demo.accounts || !demo.accounts.length) return '';
  return `<div class="auth-or"><span>или тестовый аккаунт</span></div>
    <div class="acc-list">${demo.accounts.map((a) => `<button class="acc" type="button" data-login="${esc(a.login)}">
      <span class="acc-dean" style="${a.role === 'student' ? 'background:var(--navy-3);color:var(--navy)' : ''}">${icon(a.role === 'dean' ? 'building' : 'cap', 20)}</span>
      <span class="grow"><span class="acc-top"><b>${esc(a.who)}</b>${a.role === 'dean' ? '<span class="badge badge-gold">Деканат</span>' : ''}</span><small>${esc(a.note)}</small></span>
      ${icon('arrow', 18)}</button>`).join('')}</div>
    <div class="demo-hint">${icon('key', 15)} Пароль всех демо-аккаунтов: <code>${esc(demo.password)}</code></div>`;
}

