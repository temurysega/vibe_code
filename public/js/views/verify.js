// Проверка подлинности электронной справки по коду. Доступна без входа, раскрывает только инициалы.
import { get } from '../lib/api.js';
import { session } from '../lib/bus.js';
import { esc, stamp } from '../lib/format.js';
import { icon } from '../ui/icons.js';
import { logoMark, wordmark } from '../art/logo.js';

export default {
  title: 'Проверка справки',
  render() {
    return `<div class="container" style="max-width:640px"><div class="page-head"><div>${session.user ? '' : `<span class="logo" style="margin-bottom:18px;display:inline-flex">${logoMark()}${wordmark()}</span>`}<h1 class="h1">Проверка справки</h1><p class="lead">Введите код с электронной справки — увидите, действительна ли она</p></div></div>
      <form class="card" data-form><label class="field"><span class="field-label">Код проверки</span><input class="input" name="code" maxlength="19" autocapitalize="characters" spellcheck="false" placeholder="4F2A-9C1D-7B3E-0A55" style="letter-spacing:.12em;font-weight:500"><span class="field-hint">16 знаков с дефисами — как в справке</span></label>
        <button class="btn btn-primary btn-lg mt-16" type="submit">${icon('shieldOk', 18)} Проверить</button><div data-res class="mt-16"></div></form>
      <p class="small muted mt-16">Демо-стенд концепта: проверяются только справки, выданные в этом прототипе. Персональные данные не раскрываются — только инициалы владельца</p></div>`;
  },
  mount(el, params) {
    const form = el.querySelector('[data-form]');
    const res = el.querySelector('[data-res]');
    async function check(code) {
      // Код печатается группами через дефис; у справок, выданных раньше, он 8-значный
      code = String(code || '').toUpperCase().replace(/[^0-9A-F]/g, '');
      if (!/^(?:[0-9A-F]{8}|[0-9A-F]{16})$/.test(code)) { res.innerHTML = `<div class="auth-error">${icon('info', 18)}<span>Код — 16 знаков (у ранних образцов — 8): цифры и буквы A–F</span></div>`; return; }
      res.innerHTML = '<span class="small muted">Проверяем…</span>';
      try {
        const r = await get(`/api/verify/${code}`);
        res.innerHTML = `<div class="pickup">${icon('shieldOk', 22)}<span><b style="font-weight:500">Справка действительна</b><br>«${esc(r.title)}» № ${esc(r.number)}<br>выдана ${esc(stamp(r.issuedAt))} · владелец ${esc(r.holder)}</span></div>`;
      } catch (e) {
        res.innerHTML = `<div class="auth-error">${icon('alert', 18)}<span>${e.status === 404 ? 'Справка с таким кодом не найдена' : esc(e.message)}</span></div>`;
      }
    }
    form.addEventListener('submit', (e) => { e.preventDefault(); check(form.elements.code.value); });
    if (params[0]) { form.elements.code.value = params[0]; check(params[0]); }
    return null;
  },
};
