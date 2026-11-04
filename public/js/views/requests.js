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

async function loadTypes() {
  if (!types) types = (await get('/api/requests/types')).types;
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
      <div class="prefill"><div class="row space" style="margin-bottom:10px"><b style="font-weight:500">Данные подставлены из профиля</b><span class="badge badge-gray">${icon('lock', 12)} только для деканата</span></div>
        <dl class="kv"><dt>Студент</dt><dd>${esc(`${p.lastName} ${p.firstName} ${p.middleName || ''}`)}</dd><dt>Группа</dt><dd>${esc(p.group)}, ${p.course} курс</dd><dt>Факультет</dt><dd>${esc(p.faculty.name)}</dd></dl></div>
      ${t.delivery.length > 1 ? `<div class="field"><span class="field-label">Формат</span><div class="opt-cards">${t.delivery.map((d, i) => `<label class="opt-card"><input type="radio" name="delivery" value="${d}" ${i === 0 ? 'checked' : ''}><b>${icon(d === 'electronic' ? 'download' : 'doc', 18)} ${DELIVERY[d][0]}</b><span>${DELIVERY[d][1]}</span></label>`).join('')}</div></div>` : ''}
      ${t.langs && t.langs.length > 1 ? `<div class="field"><span class="field-label">Язык справки</span><div class="seg">${t.langs.map((l, i) => `<label style="display:contents"><input type="radio" name="lang" value="${l}" ${i === 0 ? 'checked' : ''} class="sr"><span class="lang-opt ${i === 0 ? 'on' : ''}" data-lang="${l}" style="height:36px;padding:0 16px;border-radius:100px;display:inline-flex;align-items:center;cursor:pointer">${LANG[l]}</span></label>`).join('')}</div></div>` : ''}
      ${t.fields.map(fieldHtml).join('')}
      <div data-form-error></div>
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
      ${r.downloadable ? `<div class="card card-navy"><div class="card-title">Справка готова</div><p class="muted mt-8">Подписана электронной подписью. Подлинность проверяется по QR-коду</p><a class="btn btn-gold btn-block mt-16" href="#/requests/${r.id}/doc">${icon('download', 18)} Открыть и скачать</a></div>` : ''}
      ${r.pickup && r.status === 'ready' ? `<div class="pickup">${icon('pin', 20)}<span><b style="font-weight:500">Готово — можно забирать</b><br>${esc(r.pickup)}<br><span class="small">Возьмите студенческий билет</span></span></div>` : ''}
      ${payloadRows ? `<div class="card"><div class="card-title">Что указано в заявке</div><dl class="kv mt-16" style="grid-template-columns:110px minmax(0,1fr);font-size:14px">${payloadRows}</dl></div>` : ''}
      ${r.cancellable ? `<button class="btn btn-danger btn-block" data-cancel>${icon('undo', 18)} Отменить заявку</button>` : ''}
      <a class="btn btn-secondary btn-block" href="#/requests">${icon('back', 18)} Все заявки</a>
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

// Узор в духе QR-кода из кода проверки (демо, не сканируется)
function qr(code) {
  let h = 2166136261;
  for (const c of code) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1000) / 1000; };
  const N = 25;
  let s = '';
  const finder = (x, y) => `<rect x="${x}" y="${y}" width="7" height="7" fill="#111"/><rect x="${x + 1}" y="${y + 1}" width="5" height="5" fill="#fff"/><rect x="${x + 2}" y="${y + 2}" width="3" height="3" fill="#111"/>`;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const inF = (x < 8 && y < 8) || (x > N - 9 && y < 8) || (x < 8 && y > N - 9);
    if (!inF && rnd() > 0.52) s += `<rect x="${x}" y="${y}" width="1" height="1" fill="#111"/>`;
  }
  return `<svg viewBox="-1 -1 ${N + 2} ${N + 2}" shape-rendering="crispEdges" aria-hidden="true"><rect x="-1" y="-1" width="${N + 2}" height="${N + 2}" fill="#fff"/>${s}${finder(0, 0)}${finder(N - 7, 0)}${finder(0, N - 7)}</svg>`;
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
      ${d.type === 'stipend' ? '<p>Справка подтверждает назначение академической стипендии в текущем семестре (демо-данные).</p>' : ''}
      ${d.payload.place ? `<p>Справка выдана для предоставления: ${esc(d.payload.place)}.</p>` : '<p>Справка выдана по месту требования.</p>'}`;
  }
  if (d.type === 'transcript' && grades) {
    text += `<table class="tbl" style="font-size:13px;margin-top:14px"><thead><tr><th>${en ? 'Course' : 'Дисциплина'}</th><th class="num">${en ? 'Term' : 'Семестр'}</th><th class="num">${en ? 'Points' : 'Баллы'}</th><th class="num">ECTS</th></tr></thead><tbody>${grades.history.flatMap((h) => h.list.map((x) => `<tr><td>${esc(en ? translit(x.name) : x.name)}</td><td class="num">${h.semester}</td><td class="num">${x.points}</td><td class="num">${x.verdict.letter}</td></tr>`)).join('')}</tbody></table>`;
  }
  return `<div class="doc-wrap">
    <div class="doc-actions"><button class="btn btn-primary" data-print>${icon('print', 18)} Скачать PDF или распечатать</button><a class="btn btn-secondary" href="#/requests/${location.hash.split('/')[2]}">${icon('back', 18)} К заявке</a></div>
    <article class="doc" aria-label="Электронная справка (демо)">
      <div class="doc-head">${logoMark()}<div class="doc-org"><b>МГИМО Мания — демонстрационный концепт</b><br>${en ? 'Sample of an electronic certificate · not an official document' : 'Образец электронной справки · не является официальным документом'}</div></div>
      <div class="doc-title">${en ? 'Certificate' : 'Справка'}</div>
      <div class="doc-no">№ ${esc(d.number)} ${en ? 'of' : 'от'} ${esc(en ? new Date(d.issuedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : dateLong(new Date(d.issuedAt).toISOString().slice(0, 10)))}</div>
      ${text}
      <div class="doc-foot"><div class="doc-sign">${en ? 'Dean’s office' : 'Специалист деканата'}<span class="line"></span><span class="small">${en ? 'e-signature' : 'электронная подпись'}</span></div>
        <div class="doc-qr">${qr(d.verifyCode)}<span>${en ? 'Verify' : 'Проверка подлинности'}:<br><b style="font-size:14px;letter-spacing:.08em">${esc(d.verifyCode)}</b><br>#/verify/${esc(d.verifyCode)}</span></div></div>
      <div class="doc-stamp">МГИМО Мания<br>демо<br>образец</div>
    </article></div>`;
}

