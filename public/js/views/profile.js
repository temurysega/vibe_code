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

function body() {
  const m = me;
  return `<div class="profile-layout">
    <div class="profile-side">${card()}<a class="btn btn-secondary btn-block" href="#/wardrobe">${icon('hanger', 18)} Изменить образ</a></div>
    <div class="col" style="gap:20px">
      <div class="card"><div class="card-title">Учебные данные</div>
        <dl class="kv mt-16">
          <dt>ФИО</dt><dd>${esc(`${m.lastName} ${m.firstName} ${m.middleName || ''}`)}</dd>
          <dt>Факультет</dt><dd>${esc(m.faculty.name)}</dd>
          <dt>Направление</dt><dd>${esc(m.program)}</dd>
          <dt>Профиль</dt><dd>${esc(m.profile)}</dd>
          <dt>Курс и группа</dt><dd>${m.course} курс · ${m.semester} семестр · группа ${esc(m.group)}</dd>
          <dt>Форма и основа</dt><dd>${esc(m.studyForm)}, ${esc(m.funding)}</dd>
          <dt>Языки</dt><dd>${m.languages.map((l, i) => `<span class="badge badge-soft" style="margin-right:6px">${i + 1}-й · ${esc(l)}</span>`).join('')}</dd>
          <dt>Зачётная книжка</dt><dd class="masked">${mask('book', m.recordBook)}</dd>
          <dt>Куратор</dt><dd>${esc(m.curator || '—')}</dd>
        </dl></div>
      <div class="card"><div class="card-title">Контакты</div>
        <dl class="kv mt-16"><dt>Почта</dt><dd>${esc(m.email)}</dd><dt>Телефон</dt><dd class="masked">${mask('phone', m.phone || '—')}</dd></dl>
        <div class="note mt-16">${icon('info', 18)}<span>Чтобы изменить ФИО или контакты, нужен документ — деканат ${esc(m.faculty.short)} поможет: ауд. ${esc(m.faculty.dean_office)}, ${esc(m.faculty.hours)}, ${esc(m.faculty.phone)}</span></div></div>
      <div class="card" id="security"><div class="card-head"><div><div class="card-title">Безопасность</div><div class="card-sub">Последний вход: ${sec.lastLogin ? esc(stamp(sec.lastLogin)) : 'первый'} · пароль ${sec.passwordChanged ? 'изменён ' + esc(when(sec.passwordChanged)) : 'не менялся'}</div></div></div>
        <div class="sec-score">${icon('shieldOk', 22)}<span><b style="font-weight:500">Аккаунт защищён</b><br><span class="small">Вход по паролю, сеанс в защищённой cookie, видны только ваши данные</span></span></div>
        <div class="section-head mt-24" style="margin-bottom:6px"><b style="font-weight:500">Активные сеансы</b>${sec.sessions.length > 1 ? '<button class="btn btn-sm btn-secondary" data-revoke-all>Завершить все, кроме этого</button>' : ''}</div>
        ${sec.sessions.map((s) => `<div class="sess"><span class="sess-ic">${icon(/iOS|Android/.test(s.device) ? 'mobile' : 'device', 20)}</span><span class="grow"><b style="font-weight:500">${esc(s.device)}</b>${s.current ? ' <span class="badge badge-good">этот сеанс</span>' : ''}<span class="small muted" style="display:block">IP ${esc(s.ip)} · вход ${esc(stamp(s.createdAt))} · активность ${esc(when(s.lastSeen))}</span></span>${s.current ? '' : `<button class="btn btn-sm btn-danger" data-revoke="${esc(s.id)}">Завершить</button>`}</div>`).join('')}
        <form class="col mt-24" data-pw novalidate style="gap:14px"><b style="font-weight:500">Сменить пароль</b>
          <label class="field" data-field="current"><span class="field-label">Текущий пароль</span><input class="input" type="password" name="current" autocomplete="current-password" required></label>
          <label class="field" data-field="next"><span class="field-label">Новый пароль</span><input class="input" type="password" name="next" autocomplete="new-password" required minlength="10"><span class="field-hint">Не короче 10 символов, буквы и цифры. После смены другие сеансы завершатся</span></label>
          <div><button class="btn btn-primary" type="submit">${icon('key', 18)} Сменить пароль</button></div></form>
      </div>
      <div class="card"><div class="card-title">Что хранится о вас</div>
        <div class="sec-list">${['Только учебные данные: ФИО, группа, баллы, заявки — без паспорта и СНИЛС', 'Пароль — в виде хеша scrypt: его не видит даже администратор', 'Сеанс — случайный ключ в cookie, недоступной скриптам страницы', 'Чужой профиль или чужую заявку не открыть даже по прямой ссылке', 'Ключ ИИ-помощника хранится на сервере и не попадает в браузер'].map((t) => `<div>${icon('check', 16, 2.4)}<span>${t}</span></div>`).join('')}</div>
        <button class="btn btn-secondary mt-16" data-about>${icon('shieldOk', 18)} Подробнее о защите</button></div>
    </div></div>`;
}

export default {
  title: 'Профиль',
  render() {
    return `<div class="container"><div class="page-head"><div><h1 class="h1">Профиль</h1><p class="lead">Учебные данные, контакты и безопасность аккаунта</p></div></div><div data-body>${skeleton(3, 160)}</div></div>`;
  },
  async mount(el) {
    const box = el.querySelector('[data-body]');
    const load = async () => {
      try {
        [me, sec] = await Promise.all([get('/api/me').then((r) => r.profile), get('/api/auth/sessions')]);
        box.innerHTML = body();
      } catch (e) { if (e.status !== 401) box.innerHTML = errorBox(e); }
    };
    await load();
    el.addEventListener('click', async (e) => {
      const rv = e.target.closest('[data-reveal]');
      if (rv) { shown[rv.dataset.reveal] = !shown[rv.dataset.reveal]; box.innerHTML = body(); return; }
      const r1 = e.target.closest('[data-revoke]');
      if (r1) {
        try { await del(`/api/auth/sessions/${r1.dataset.revoke}`); toast('Сеанс завершён', { icon: 'shieldOk' }); load(); } catch (er) { toast(esc(er.message), { icon: 'alert' }); }
        return;
      }
      if (e.target.closest('[data-revoke-all]')) {
        const ok = await confirm({ title: 'Завершить другие сеансы?', text: 'На остальных устройствах придётся войти заново', yes: 'Завершить' });
        if (!ok) return;
        const r = await post('/api/auth/sessions/revoke-others').catch((er) => { toast(esc(er.message), { icon: 'alert' }); return null; });
        if (r) { toast(`Завершено сеансов: ${r.closed}`, { icon: 'shieldOk' }); load(); }
      }
    });
    el.addEventListener('submit', async (e) => {
      const f = e.target.closest('[data-pw]');
      if (!f) return;
      e.preventDefault();
      f.querySelectorAll('.field-error').forEach((x) => x.remove());
      f.querySelectorAll('.invalid').forEach((x) => x.classList.remove('invalid'));
      try {
        const r = await post('/api/auth/password', { current: f.elements.current.value, next: f.elements.next.value });
        if (r.demo) toast('Демо-стенд: новый пароль прошёл проверку, но не сохранён — иначе жюри не сможет войти. В боевом режиме он сохранится как хеш scrypt', { icon: 'key', ms: 7000 });
        else toast('Пароль изменён. Другие сеансы завершены', { icon: 'key' });
        f.reset();
        load();
      } catch (er) {
        const fe = er.data && er.data.fields;
        if (fe) Object.entries(fe).forEach(([k, msg]) => { const x = f.querySelector(`[data-field="${k}"]`); if (x) { x.classList.add('invalid'); x.insertAdjacentHTML('beforeend', `<span class="field-error">${esc(msg)}</span>`); } });
        else toast(esc(er.message), { icon: 'alert' });
      }
    });
    return null;
  },
};
