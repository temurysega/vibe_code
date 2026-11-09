// Заявки и справки: каталог, форма с автозаполнением, статус «как у посылки» и электронная справка.
import { get, post } from '../lib/api.js';
import { session, setPlay, on } from '../lib/bus.js';
import { esc, plural, stamp, when, dayShort, dateLong } from '../lib/format.js';
import { icon } from '../ui/icons.js';
import { modal, toast, confirm } from '../ui/overlay.js';
import { replaceKeepingFocus } from '../ui/focus.js';
import * as fx from '../ui/fx.js';
import { logoMark } from '../art/logo.js';
import { skeleton, errorBox, statusPill, pipe, STATUS_ICON } from './common.js';

const STEP_LABEL = { submitted: 'Подана', in_work: 'В работе', ready: 'Готова', issued: 'Выдана', approved: 'Одобрена' };
const DELIVERY = { electronic: ['Электронная', 'Справка с кодом проверки, сразу в кабинете'], paper: ['Бумажная', 'Получение образца в демо-деканате'] };
const LANG = { ru: 'Русский', en: 'Английский' };
let types = null;
let me = null;

const head = (title, lead, back) => `<div class="page-head"><div>${back ? `<div class="crumbs"><a href="${back[0]}">${icon('back', 14)} ${back[1]}</a></div>` : ''}<h1 class="h1">${title}</h1>${lead ? `<p class="lead">${lead}</p>` : ''}</div></div>`;

async function loadTypes() {
  // Доступность заявлений зависит от текущего студента: не кешируем между входами.
  types = (await get('/api/requests/types')).types;
  return types;
}

// ---------- список ----------
function listView(list, filter) {
  const active = list.filter((r) => !['issued', 'approved', 'rejected', 'cancelled'].includes(r.status));
  const shown = filter === 'all' ? list : active;
  return `<div class="row-wrap" style="justify-content:space-between;margin-bottom:20px">
      <div class="seg"><a href="#/requests" class="${filter !== 'all' ? 'on' : ''}">Активные · ${active.length}</a><a href="#/requests/all" class="${filter === 'all' ? 'on' : ''}">Все · ${list.length}</a></div>
      <a class="btn btn-primary" href="#/requests/new">${icon('plus', 18)} Новая заявка</a></div>
    ${shown.length ? `<div class="req-list">${shown.map((r) => `<a class="req-card" href="#/requests/${r.id}"><span class="cat-ic">${icon(r.icon || 'doc', 20)}</span>
      <span style="min-width:0"><b>${esc(r.title)}</b><span class="small muted" style="display:block">№ ${esc(r.number)} · подана ${esc(when(r.createdAt))}${r.delivery !== 'none' ? ' · ' + DELIVERY[r.delivery][0].toLowerCase() : ''}</span>${pipe(r.steps, r.status)}</span>
      ${statusPill(r.status, r.statusLabel)}</a>`).join('')}</div>`
      : `<div class="card empty"><span class="emoji">📭</span><div class="h4">${filter === 'all' ? 'Заявок пока нет' : 'Активных заявок нет'}</div><p class="mt-8">Справку об обучении можно заказать за минуту — электронная готова в течение дня</p><a class="btn btn-primary mt-16" href="#/requests/new/study">Заказать справку</a></div>`}`;
}

// ---------- каталог ----------
function catalogView() {
  const tile = (t) => `<button class="cat-tile" data-type="${t.id}" ${t.available ? '' : 'disabled'}><span class="cat-ic">${icon(t.icon, 22)}</span><b>${esc(t.title)}</b><span class="small muted">${esc(t.hint || t.short)}</span>
    <span class="cat-foot"><span class="badge badge-gray">${icon('clock', 12)} ${t.days} ${plural(t.days, ['день', 'дня', 'дней'])}</span>${t.delivery.includes('electronic') ? `<span class="badge badge-soft">${icon('download', 12)} электронно</span>` : ''}${t.langs && t.langs.includes('en') ? '<span class="badge badge-gold">EN</span>' : ''}</span></button>`;
  return `<div class="section-head"><h2 class="h3">Справки</h2><span class="small muted">Готовятся без визита в деканат</span></div>
    <div class="cat-grid">${types.filter((t) => t.group === 'cert').map(tile).join('')}</div>
    <div class="section-head mt-32"><h2 class="h3">Заявления</h2><span class="small muted">Решение принимает деканат — статус придёт уведомлением</span></div>
    <div class="cat-grid">${types.filter((t) => t.group === 'app').map(tile).join('')}</div>`;
}

// ---------- форма ----------
function fieldHtml(f) {
  const req = f.required ? ' <b>*</b>' : '';
  const base = `name="${f.id}" ${f.required ? 'required' : ''}`;
  let input;
  if (f.type === 'select') input = `<select class="input" ${base}><option value="">Выберите</option>${f.options.map((o) => `<option value="${esc(o)}">${esc(/^\d{4}-\d{2}-\d{2}$/.test(o) ? dayShort(o) : o)}</option>`).join('')}</select>`;
  else if (f.type === 'textarea') input = `<textarea class="input" ${base} maxlength="${f.max || 1000}" placeholder="${esc(f.placeholder || '')}"></textarea>`;
  else if (f.type === 'number') input = `<input class="input" type="number" inputmode="numeric" ${base} min="${f.min}" max="${f.max}" value="${f.default ?? ''}">`;
  else if (f.type === 'date') input = `<input class="input" type="date" ${base}>`;
  else input = `<input class="input" ${base} maxlength="${f.max || 200}" placeholder="${esc(f.placeholder || '')}">`;
  return `<label class="field" data-field="${f.id}"><span class="field-label">${esc(f.label)}${req}</span>${input}${f.min && f.type === 'textarea' ? `<span class="field-hint">Не короче ${f.min} символов</span>` : ''}</label>`;
}

function formView(t) {
  const p = me;
  return `<div class="req-form"><form class="card" data-form novalidate>
      <div><span class="eyebrow">${t.group === 'cert' ? 'Справка' : 'Заявление'} · до ${t.days} ${plural(t.days, ['дня', 'дней', 'дней'])}</span><p class="mt-8" style="font-size:17px">${esc(t.short)}</p></div>
      <details class="prefill" data-prefill ${matchMedia('(max-width: 720px)').matches ? '' : 'open'}>
        <summary><span><span class="field-hint">Данные подставлены из профиля</span><strong>${esc(`${p.lastName} ${p.firstName} ${p.middleName || ''}`)}</strong><span class="small muted">${esc(p.group)} · ${p.course} курс</span></span>${icon('down', 18)}</summary>
        <div class="prefill-details"><dl class="kv"><dt>Факультет</dt><dd>${esc(p.faculty.name)}</dd></dl><span class="badge badge-gray">${icon('lock', 12)} только для деканата</span></div>
      </details>
      ${t.delivery.length > 1 ? `<fieldset class="field request-format"><legend class="field-label">Формат</legend><div class="opt-cards">${t.delivery.map((d, i) => `<label class="opt-card"><input type="radio" name="delivery" value="${d}" ${i === 0 ? 'checked' : ''}><b>${icon(d === 'electronic' ? 'download' : 'doc', 18)} ${DELIVERY[d][0]}</b><span>${DELIVERY[d][1]}</span></label>`).join('')}</div></fieldset>` : ''}
      ${t.langs && t.langs.length > 1 ? `<div class="field"><span class="field-label">Язык справки</span><div class="seg">${t.langs.map((l, i) => `<label style="display:contents"><input type="radio" name="lang" value="${l}" ${i === 0 ? 'checked' : ''} class="sr"><span class="lang-opt ${i === 0 ? 'on' : ''}" data-lang="${l}" style="height:36px;padding:0 16px;border-radius:100px;display:inline-flex;align-items:center;cursor:pointer">${LANG[l]}</span></label>`).join('')}</div></div>` : ''}
      ${t.fields.map(fieldHtml).join('')}
      <div data-form-error role="alert"></div>
      <div class="row-wrap"><button class="btn btn-primary btn-lg" type="submit" data-submit>${icon('send', 18)} Отправить в деканат</button><a class="btn btn-ghost btn-lg" href="#/requests/new">Отмена</a></div>
    </form>
    <aside class="sticky-side">
      <div class="card"><div class="card-title">Что будет дальше</div>
        <div class="stepper mt-16">${(t.group === 'cert' ? ['Заявка уходит в деканат', 'Специалист готовит справку', t.delivery.includes('electronic') ? 'Готово: скачайте или заберите' : 'Готово: заберите в деканате'] : ['Заявление регистрируют', 'Деканат рассматривает', 'Решение приходит уведомлением']).map((s, i) => `<div class="stepper-row"><span class="stepper-dot">${i + 1}</span><div><b>${s}</b></div></div>`).join('')}</div>
        <div class="note mt-16">${icon('clock', 18)}<span>Срок — до ${t.days} ${plural(t.days, ['рабочего дня', 'рабочих дней', 'рабочих дней'])}. Статус обновляется сам, в кабинете и уведомлением</span></div></div>
      ${t.delivery.includes('paper') ? `<div class="card"><div class="card-title">Где забрать оригинал</div><p class="muted mt-8">Деканат ${esc(p.faculty.short)}, ауд. ${esc(p.faculty.dean_office)}<br>${esc(p.faculty.hours)}</p></div>` : ''}
    </aside></div>`;
}

// ---------- карточка заявки ----------
function detailView(r) {
  const evAt = (st) => { const e = r.events.filter((x) => x.status === st).pop(); return e ? e.created_at : null; };
  const bad = r.status === 'rejected' || r.status === 'cancelled';
  const idx = r.steps.indexOf(r.status);
  const steps = bad ? r.steps.slice(0, 1).concat([r.status]) : r.steps;
  const payloadRows = Object.entries(r.payload).filter(([k]) => !['lang', 'kit'].includes(k)).map(([k, v]) => `<dt>${esc({ place: 'Куда', copies: 'Экземпляров', country: 'Страна', dates: 'Даты', office: 'Военкомат', purpose: 'Цель', from: 'С', to: 'По', reason: 'Причина', note: 'Комментарий', details: 'Подробности', disciplines: 'Дисциплины', partner: 'Направление', term: 'Семестр', motivation: 'Мотивация', discipline: 'Дисциплина', slot: 'Дата', size: 'Размер' }[k] || k)}</dt><dd>${esc(/^\d{4}-\d{2}-\d{2}$/.test(v) ? dayShort(v) : v)}</dd>`).join('');
  return `<div class="req-detail"><div class="col" style="gap:20px">
      <div class="card"><div class="row space" style="align-items:flex-start;flex-wrap:wrap"><div><span class="eyebrow">№ ${esc(r.number)}</span><p class="muted mt-4">Подана ${esc(stamp(r.createdAt))}${r.delivery !== 'none' ? ' · ' + DELIVERY[r.delivery][0].toLowerCase() : ''}${r.payload.lang ? ' · ' + (LANG[r.payload.lang] || '').toLowerCase() : ''}</p></div>${statusPill(r.status, r.statusLabel)}</div>
        <div class="stepper mt-24">${steps.map((s, i) => {
          const done = bad ? i === 0 : i <= idx;
          const at = evAt(s);
          const cls = bad && i === steps.length - 1 ? 'bad' : done ? 'done' : i === idx + 1 ? 'current' : '';
          return `<div class="stepper-row ${cls}"><span class="stepper-dot">${done || cls === 'bad' ? icon(cls === 'bad' ? 'x' : 'check', 14, 2.6) : i + 1}</span><div><b>${esc(STEP_LABEL[s] || r.statusLabel)}</b><span class="small muted">${at ? esc(stamp(at)) : i === idx + 1 ? 'ожидается' : ''}</span></div></div>`;
        }).join('')}</div>
        ${r.dueAt && !bad && !['ready', 'issued', 'approved'].includes(r.status) ? `<div class="note note-navy mt-20">${icon('clock', 18)}<span>Срок — до ${esc(stamp(r.dueAt))}. Мы пришлём уведомление, когда статус изменится</span></div>` : ''}
        ${r.deanComment ? `<div class="note mt-16" style="background:var(--surface)">${icon('chat', 18)}<span><b style="font-weight:500">Комментарий деканата:</b> ${esc(r.deanComment)}</span></div>` : ''}
      </div>
      <div class="card"><div class="card-title">История</div><div class="timeline mt-16">${r.events.slice().reverse().map((e) => `<div class="tl-item"><span class="when">${esc(stamp(e.created_at))}</span><span><b>${esc(STEP_LABEL[e.status] || ({ rejected: 'Отклонена', cancelled: 'Отменена' })[e.status] || e.status)}</b> · <span class="muted">${esc(e.actor)}</span>${e.comment ? `<br>${esc(e.comment)}` : ''}</span></div>`).join('')}</div></div>
    </div>
    <aside class="sticky-side">
      ${r.downloadable ? `<div class="card card-navy"><div class="card-title">Справка готова</div><p class="muted mt-8">Демонстрационный образец с кодом проверки. Можно сохранить в PDF через печать</p><a class="btn btn-gold btn-block mt-16" href="#/requests/${r.id}/doc">${icon('download', 18)} Открыть и скачать</a></div>` : ''}
      ${r.pickup && r.status === 'ready' ? `<div class="pickup">${icon('pin', 20)}<span><b style="font-weight:500">Готово — можно забирать</b><br>${esc(r.pickup)}<br><span class="small">Возьмите студенческий билет</span></span></div>` : ''}
      ${payloadRows ? `<div class="card"><div class="card-title">Что указано в заявке</div><dl class="kv mt-16" style="grid-template-columns:110px minmax(0,1fr);font-size:14px">${payloadRows}</dl></div>` : ''}
      ${r.cancellable ? `<button class="btn btn-danger btn-block" data-cancel data-focus-key="request-cancel">${icon('undo', 18)} Отменить заявку</button>` : ''}
      <a class="btn btn-secondary btn-block" href="#/requests" data-focus-key="request-back">${icon('back', 18)} Все заявки</a>
    </aside></div>`;
}

// ---------- электронная справка ----------
const FAC_EN = { 'Факультет международных отношений': 'School of International Relations', 'Международно-правовой факультет': 'International Law School', 'Факультет международных экономических отношений': 'School of International Economic Relations' };
const PROGRAM_EN = { 'Международные отношения': 'International Relations', 'Экономика': 'Economics', 'Юриспруденция': 'Law' };
const COUNTRY_EN = { 'сербия': 'Serbia', 'китай': 'China', 'франция': 'France', 'оаэ': 'the UAE', 'индия': 'India', 'бразилия': 'Brazil', 'германия': 'Germany', 'италия': 'Italy', 'испания': 'Spain', 'турция': 'Turkey', 'египет': 'Egypt', 'япония': 'Japan', 'корея': 'Korea', 'вьетнам': 'Vietnam', 'армения': 'Armenia', 'казахстан': 'Kazakhstan', 'узбекистан': 'Uzbekistan', 'беларусь': 'Belarus' };
const programEn = (p) => p.replace(/^(\S+)\s+(.+)$/, (m, code, name) => `${code} ${PROGRAM_EN[name] || translit(name)}`);
const countryEn = (c) => COUNTRY_EN[String(c || '').trim().toLowerCase()] || translit(c || '');
const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: 'ie', ы: 'y', ь: '', э: 'e', ю: 'iu', я: 'ia' };
const translit = (s) => String(s).split('').map((c) => { const l = c.toLowerCase(); const t = TR[l]; if (t == null) return c; return c === l ? t : t.charAt(0).toUpperCase() + t.slice(1); }).join('');

function stipendTable(statement) {
  const month = (value) => new Date(`${value}-01T12:00:00Z`).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const money = (value) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 2 }).format(value);
  return `<section aria-label="Начисления стипендии">
    <p class="mt-16">Академическая стипендия за шесть завершённых месяцев перед подачей заявки: <b>${esc(month(statement.from))} — ${esc(month(statement.to))}</b>.</p>
    <table class="tbl mt-16" style="font-size:13px" aria-label="Стипендия по месяцам">
      <thead><tr><th scope="col" style="white-space:normal">Месяц и основание</th><th scope="col" class="num">Начислено</th></tr></thead>
      <tbody>${statement.months.map((row) => `<tr><td>${esc(month(row.month))}<br><span class="small muted">${esc(row.reason)}</span></td><td class="num">${esc(money(row.amount))}</td></tr>`).join('')}</tbody>
      <tfoot><tr><th scope="row" style="white-space:normal">Итого за 6 месяцев</th><td class="num"><b>${esc(money(statement.total))}</b></td></tr></tfoot>
    </table>
    ${statement.total === 0 ? '<p class="mt-16">За указанный период академическая стипендия не начислялась.</p>' : ''}
    <p class="small mt-16">${esc(statement.note)}</p>
  </section>`;
}

function docView(d, grades) {
  const fio = `${d.student.lastName} ${d.student.firstName} ${d.student.middleName || ''}`.trim();
  const f = d.student.gender === 'f';
  const en = d.lang === 'en';
  let text;
  if (en) {
    const name = translit(`${d.student.firstName} ${d.student.lastName}`);
    text = `<p>This is to certify that <b>${esc(name)}</b> is a full-time ${d.course}${['st', 'nd', 'rd'][d.course - 1] || 'th'}-year student of the ${esc(FAC_EN[d.faculty] || translit(d.faculty))}, bachelor's programme «${esc(programEn(d.program))}», academic year ${esc(d.academicYear)}.</p>
      <p>Expected graduation: ${d.graduationYear}. ${d.type === 'visa' ? `The certificate is issued for submission to the consular office for a trip to ${esc(countryEn(d.payload.country))}${d.payload.dates ? ` (${esc(d.payload.dates)})` : ''}. The student is granted academic leave for the period of travel.` : 'The certificate is issued upon request.'}</p>`;
  } else {
    text = `<p>Дана <b>${esc(fio)}</b> в том, что ${f ? 'она' : 'он'} действительно является ${f ? 'студенткой' : 'студентом'} ${d.course} курса (${esc(d.faculty.toLowerCase())}), направление подготовки «${esc(d.program)}», профиль «${esc(d.profile)}», форма обучения — ${esc(d.studyForm)}, основа — ${esc(d.funding === 'бюджет' ? 'бюджетная' : 'договорная')}.</p>
      <p>Срок обучения: ${d.admissionYear}–${d.graduationYear}. Номер зачётной книжки: ${esc(d.recordBook)}.</p>
      ${d.payload.place ? `<p>Справка выдана для предоставления: ${esc(d.payload.place)}.</p>` : '<p>Справка выдана по месту требования.</p>'}`;
  }
  if (d.type === 'stipend' && d.stipend) text += stipendTable(d.stipend);
  if (d.type === 'transcript' && grades) {
    text += `<table class="tbl" style="font-size:13px;margin-top:14px"><thead><tr><th>${en ? 'Course' : 'Дисциплина'}</th><th class="num">${en ? 'Term' : 'Семестр'}</th><th class="num">${en ? 'Points' : 'Баллы'}</th><th class="num">ECTS</th></tr></thead><tbody>${grades.history.flatMap((h) => h.list.map((x) => `<tr><td>${esc(en ? translit(x.name) : x.name)}</td><td class="num">${h.semester}</td><td class="num">${x.points}</td><td class="num">${x.verdict.letter}</td></tr>`)).join('')}</tbody></table>`;
  }
  return `<div class="doc-wrap">
    <div class="doc-actions"><button class="btn btn-primary" data-print>${icon('print', 18)} Скачать PDF или распечатать</button><a class="btn btn-secondary" href="#/requests/${location.hash.split('/')[2]}">${icon('back', 18)} К заявке</a></div>
    <article class="doc" aria-label="Электронная справка (демо)">
      <div class="doc-head">${logoMark()}<div class="doc-org"><b>МГИМО Мания — демонстрационный концепт</b><br>${en ? 'Sample of an electronic certificate · not an official document' : 'Образец электронной справки · не является официальным документом'}</div></div>
      <div class="doc-title">${en ? 'Certificate' : esc(d.title)}</div>
      <div class="doc-no">№ ${esc(d.number)} ${en ? 'of' : 'от'} ${esc(en ? new Date(d.issuedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : dateLong(new Date(d.issuedAt).toISOString().slice(0, 10)))}</div>
      ${text}
      <div class="doc-foot"><div class="doc-sign">${en ? 'Demo dean’s office' : 'Демонстрационный деканат'}<span class="line"></span><span class="small">${en ? 'Sample, without an electronic signature' : 'Образец без электронной подписи'}</span></div>
        <div class="doc-qr"><span>${en ? 'Verify this sample' : 'Проверка образца'}:<br><b style="font-size:14px;letter-spacing:.08em">${esc(d.verifyCode)}</b><br><a class="link" href="#/verify/${esc(d.verifyCode)}">${esc(location.origin)}/#/verify/${esc(d.verifyCode)}</a></span></div></div>
      <div class="doc-stamp">МГИМО Мания<br>демо<br>образец</div>
    </article></div>`;
}

export default {
  title: 'Заявки и справки',
  render(params) {
    return `<div class="container" data-root>${head('Заявки и справки', 'Закажите справку или подайте заявление — и следите за статусом', params.length ? ['#/requests', 'Мои заявки'] : null)}<div data-body>${skeleton(3, 96)}</div></div>`;
  },
  async mount(el, params) {
    const root = el.querySelector('[data-root]');
    const box = () => el.querySelector('[data-body]');
    const fail = (e) => { if (e.status !== 401) replaceKeepingFocus(box(), errorBox(e), { fallback: '[data-retry]' }); };
    const [a, b] = params;
    let timer = null;
    let offNotif = null;

    // Каталог: #/requests/new
    if (a === 'new' && !b) {
      try { await loadTypes(); } catch (e) { fail(e); return null; }
      root.innerHTML = head('Новая заявка', 'Выберите справку или заявление. Данные из профиля подставятся сами', ['#/requests', 'Мои заявки']) + `<div data-body>${catalogView()}</div>`;
      el.addEventListener('click', (e) => { const t = e.target.closest('[data-type]'); if (t && !t.disabled) location.hash = `#/requests/new/${t.dataset.type}`; });
      return null;
    }

    // Форма: #/requests/new/:type
    if (a === 'new' && b) {
      let t;
      try {
        await loadTypes();
        me = (await get('/api/me')).profile;
        t = types.find((x) => x.id === b);
      } catch (e) { fail(e); return null; }
      if (!t || !t.available) { box().innerHTML = errorBox({ status: 404 }, false); return null; }
      root.innerHTML = head(esc(t.title), '', ['#/requests/new', 'Все справки и заявления']) + `<div data-body>${formView(t)}</div>`;
      const form = el.querySelector('[data-form]');
      form.addEventListener('change', (e) => {
        if (e.target.name === 'lang') el.querySelectorAll('[data-lang]').forEach((x) => x.classList.toggle('on', x.dataset.lang === e.target.value));
      });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('[data-submit]');
        if (btn.disabled) return;
        form.querySelector('[data-form-error]').innerHTML = '';
        form.querySelectorAll('.field.invalid').forEach((x) => { x.classList.remove('invalid'); const er = x.querySelector('.field-error'); if (er) er.remove(); });
        const fields = {};
        t.fields.forEach((f) => { fields[f.id] = form.elements[f.id].value; });
        const body = { type: t.id, fields, delivery: form.elements.delivery ? form.elements.delivery.value : t.delivery[0], lang: form.elements.lang ? form.elements.lang.value : (t.langs || ['ru'])[0] };
        btn.disabled = true;
        btn.innerHTML = '<span class="spin"></span> Отправляем…';
        try {
          const r = await post('/api/requests', body);
          types = null;
          fx.confetti({ n: 90 });
          toast(`Заявка № ${esc(r.request.number)} отправлена — статус придёт уведомлением`, { icon: 'send', ms: 4500 });
          get('/api/play').then((p) => setPlay(p.play)).catch(() => {});
          location.hash = `#/requests/${r.request.id}`;
        } catch (er) {
          btn.disabled = false;
          btn.innerHTML = `${icon('send', 18)} Отправить в деканат`;
          const fe = er.data && er.data.fields;
          if (fe) {
            Object.entries(fe).forEach(([k, msg]) => {
              const f = form.querySelector(`[data-field="${k}"]`);
              if (f) { f.classList.add('invalid'); f.insertAdjacentHTML('beforeend', `<span class="field-error">${icon('alert', 14)} ${esc(msg)}</span>`); }
            });
            const first = form.querySelector('.field.invalid .input');
            if (first) first.focus();
          }
          form.querySelector('[data-form-error]').innerHTML = `<div class="auth-error">${icon('alert', 18)}<span>${esc(er.message)}${er.data && er.data.id ? ` · <a class="link" href="#/requests/${er.data.id}">Открыть заявку</a>` : ''}</span></div>`;
        }
      });
      return null;
    }

    // Электронная справка: #/requests/:id/doc
    if (a && b === 'doc') {
      try {
        const { document: d } = await get(`/api/requests/${encodeURIComponent(a)}/document`);
        const grades = d.type === 'transcript' ? await get('/api/grades') : null;
        root.innerHTML = docView(d, grades);
        el.querySelector('[data-print]').onclick = () => window.print();
      } catch (e) { fail(e); }
      return null;
    }

    // Карточка заявки: #/requests/:id — сервер вернёт 404 для чужой
    if (a && a !== 'all') {
      const load = async () => {
        try {
          const { request: r } = await get(`/api/requests/${encodeURIComponent(a)}`);
          if (!replaceKeepingFocus(root, head(esc(r.title), '', ['#/requests', 'Мои заявки']) + `<div data-body>${detailView(r)}</div>`, { fallback: '[data-focus-key="request-back"]' })) return true;
          if (['issued', 'approved', 'rejected', 'cancelled'].includes(r.status) || (r.status === 'ready' && r.delivery !== 'paper')) { clearInterval(timer); timer = null; return false; }
          return true;
        } catch (e) { clearInterval(timer); timer = null; fail(e); return false; }
      };
      if (await load()) timer = setInterval(load, 8000);
      offNotif = on('notif', (n) => { if (n.kind === 'request') load(); });
      el.addEventListener('click', async (e) => {
        if (!e.target.closest('[data-cancel]')) return;
        const ok = await confirm({ title: 'Отменить заявку?', text: 'Её ещё не взяли в работу — отмена бесплатна и мгновенна', yes: 'Отменить заявку', no: 'Оставить', danger: true });
        if (!ok) return;
        try { await post(`/api/requests/${encodeURIComponent(a)}/cancel`, {}); toast('Заявка отменена', { icon: 'undo' }); load(); } catch (er) { toast(esc(er.message), { icon: 'alert' }); }
      });
      return () => { clearInterval(timer); if (offNotif) offNotif(); };
    }

    // Список: #/requests и #/requests/all
    const load = async () => {
      try { const { requests } = await get('/api/requests'); replaceKeepingFocus(box(), listView(requests, a), { fallback: '.seg .on' }); } catch (e) { fail(e); }
    };
    await load();
    timer = setInterval(load, 15000);
    offNotif = on('notif', (n) => { if (n.kind === 'request') load(); });
    return () => { clearInterval(timer); offNotif(); };
  },
};
