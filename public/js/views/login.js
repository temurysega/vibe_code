// Вход по логину и паролю. В демо-режиме под формой — тестовые учётные записи для жюри.
// Настоящие логины и пароли МГИМО здесь не принимаются: сервер знает только демо-аккаунты.
import { get, post, setCsrf } from '../lib/api.js';
import { session } from '../lib/bus.js';
import { esc } from '../lib/format.js';
import { icon } from '../ui/icons.js';
import { logoMark, wordmark } from '../art/logo.js';
import { svg as avatarSvg, pet, backdrop } from '../art/avatar.js';
import { RELEASE } from '../shared/release.js';

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
  // Тестовые аккаунты — первыми: на низких экранах телефонов (iPhone SE, Android 360×640) кнопки входа
  // одним нажатием видны без прокрутки; ручная форма — ниже, после разделителя
  return `<p class="auth-sub">Тестовые аккаунты — вход одним нажатием</p>
    <div class="acc-list">${demo.accounts.map((a) => `<button class="acc" type="button" data-login="${esc(a.login)}">
      <span class="acc-dean" style="${a.role === 'student' ? 'background:var(--navy-3);color:var(--navy)' : ''}">${icon(a.role === 'dean' ? 'building' : 'cap', 20)}</span>
      <span class="grow"><span class="acc-top"><b>${esc(a.who)}</b>${a.role === 'dean' ? '<span class="badge badge-gold">Деканат</span>' : ''}</span><small>${esc(a.note)}</small></span>
      ${icon('arrow', 18)}</button>`).join('')}</div>
    <div class="demo-hint">${icon('key', 15)} Пароль всех демо-аккаунтов: <code>${esc(demo.password)}</code></div>
    ${demo.sandboxes ? `<div class="demo-hint" data-sandbox-note>${icon('shieldOk', 15)} ${demo.sandbox ? 'Вы в своём демо-кабинете: заявки и действия других проверяющих его не затрагивают' : 'При входе стенд создаст ваш личный демо-кабинет — заявки и действия других проверяющих его не затронут'}. Ссылку для второго окна или телефона найдёте в меню «Ещё» или профиля.</div>` : ''}
    <div class="auth-or"><span>или по логину и паролю</span></div>`;
}

export default {
  title: 'Вход',
  render() {
    return `<div class="auth">${hero()}
      <section class="auth-panel"><div class="auth-card">
        <div class="auth-mark">${logoMark()}${wordmark(false)}</div>
        <h2 class="h2 mt-24">Вход в кабинет</h2>
        <div data-demo></div>
        <form class="auth-form" data-form novalidate>
          <div data-error role="alert"></div>
          <label class="field"><span class="field-label">Логин</span><input class="input" name="login" autocomplete="username" autocapitalize="none" spellcheck="false" required placeholder="Например, a.morozova"></label>
          <label class="field"><span class="field-label">Пароль</span><span class="pass-wrap"><input class="input" name="password" type="password" autocomplete="current-password" required><button class="pass-eye" type="button" data-eye aria-label="Показать пароль">${icon('eye', 20)}</button></span></label>
          <button class="btn btn-primary btn-lg btn-block" type="submit" data-submit>Войти</button>
        </form>
        <p class="auth-foot"><b>Концепт для конкурса, не официальный сервис МГИМО.</b> Не вводите здесь настоящий логин и пароль от вуза — подойдут только демо-аккаунты. Пароли хранятся в виде хеша, данные вымышлены.<span class="auth-version" data-release>Версия ${RELEASE.version} от ${RELEASE.label}</span></p>
      </div></section></div>`;
  },
  mount(el, params, app) {
    const form = el.querySelector('[data-form]');
    const errBox = el.querySelector('[data-error]');
    const btn = el.querySelector('[data-submit]');
    get('/api/demo/accounts').then((d) => { session.demo = d; el.querySelector('[data-demo]').innerHTML = accounts(d); }).catch(() => {});

    async function submit() {
      if (btn.disabled) return;
      const login = form.login.value.trim();
      const password = form.password.value;
      errBox.innerHTML = '';
      if (!login || !password) {
        errBox.innerHTML = `<div class="auth-error">${icon('info', 18)}<span>Введите логин и пароль</span></div>`;
        (login ? form.password : form.login).focus();
        return;
      }
      btn.disabled = true;
      btn.innerHTML = '<span class="spin"></span> Проверяем…';
      try {
        const r = await post('/api/auth/login', { login, password });
        setCsrf(r.csrf);
        await app.signedIn(r.user);
      } catch (e) {
        errBox.innerHTML = `<div class="auth-error">${icon(e.status === 429 ? 'clock' : 'alert', 18)}<span>${esc(e.message)}</span></div>`;
        form.password.value = '';
        form.password.focus();
      } finally {
        btn.disabled = false;
        btn.textContent = 'Войти';
      }
    }

    form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
    el.addEventListener('click', (e) => {
      const eye = e.target.closest('[data-eye]');
      if (eye) {
        const show = form.password.type === 'password';
        form.password.type = show ? 'text' : 'password';
        eye.innerHTML = icon(show ? 'eyeOff' : 'eye', 20);
        eye.setAttribute('aria-label', show ? 'Скрыть пароль' : 'Показать пароль');
        return;
      }
      const a = e.target.closest('[data-login]');
      if (a && session.demo) {
        form.login.value = a.dataset.login;
        form.password.value = session.demo.password;
        submit();
      }
    });
    // Фокус в поле логина для клавиатуры, но без прокрутки: на невысоком окне страница остаётся
    // на тестовых аккаунтах, а не уезжает к форме
    setTimeout(() => { if (matchMedia('(hover: hover)').matches) form.login.focus({ preventScroll: true }); }, 50);
  },
};
