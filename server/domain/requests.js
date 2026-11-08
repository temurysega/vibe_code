// Заявки и справки: каталог, проверка полей, статусы и история изменений.
// Студент видит и меняет только свои заявки, деканат — заявки своего факультета.
import { randomBytes } from 'node:crypto';
import { str, int, isDate } from '../http/body.js';
import { fail } from '../http/router.js';
import { msk, addDays, DAY } from './time.js';
import { notify } from './notifications.js';

export const STATUS = {
  submitted: 'Подана',
  in_work: 'В работе',
  ready: 'Готова',
  issued: 'Выдана',
  approved: 'Одобрена',
  rejected: 'Отклонена',
  cancelled: 'Отменена',
};
export const FINAL = ['issued', 'approved', 'rejected', 'cancelled'];

// Каталог: справки готовятся сами, заявления решает деканат
export const TYPES = [
  { id: 'study', group: 'cert', icon: 'doc', title: 'Справка об обучении', short: 'По месту требования: работа родителей, соцзащита, банк', days: 1, delivery: ['electronic', 'paper'], langs: ['ru', 'en'],
    fields: [
      { id: 'place', label: 'Куда нужна справка', type: 'text', required: true, max: 120, placeholder: 'Например, по месту работы мамы' },
      { id: 'copies', label: 'Экземпляров', type: 'number', min: 1, max: 5, default: 1 },
    ] },
  { id: 'visa', group: 'cert', icon: 'globe', title: 'Справка для посольства', short: 'На английском — для визы, стажировки или конференции', days: 2, delivery: ['electronic', 'paper'], langs: ['en'],
    fields: [
      { id: 'country', label: 'Страна поездки', type: 'text', required: true, max: 60, placeholder: 'Например, Сербия' },
      { id: 'dates', label: 'Даты поездки', type: 'text', required: true, max: 60, placeholder: '12–20 января' },
    ] },
  { id: 'military', group: 'cert', icon: 'shield', title: 'Справка для военкомата', short: 'Для отсрочки от призыва, оригинал с печатью', days: 3, delivery: ['paper'], langs: ['ru'],
    fields: [{ id: 'office', label: 'Военный комиссариат', type: 'text', required: true, max: 120, placeholder: 'Например, Гагаринского района' }] },
  { id: 'transcript', group: 'cert', icon: 'table', title: 'Выписка оценок', short: 'Баллы и оценки за все семестры, можно на английском', days: 4, delivery: ['electronic', 'paper'], langs: ['ru', 'en'],
    fields: [{ id: 'purpose', label: 'Для чего', type: 'select', required: true, options: ['Программа обмена', 'Стажировка', 'Летняя школа', 'Поступление в магистратуру', 'Другое'] }] },
  { id: 'stipend', group: 'cert', icon: 'coins', title: 'Справка о стипендии', short: 'Размер выплат за последние шесть месяцев', days: 2, delivery: ['electronic', 'paper'], langs: ['ru'], fields: [] },
  { id: 'absence', group: 'app', icon: 'calendar', title: 'Пропуск по уважительной причине', short: 'Деканат предупредит преподавателей, пропуски не сгорят', days: 2, delivery: ['none'], decision: true,
    fields: [
      { id: 'from', label: 'С', type: 'date', required: true },
      { id: 'to', label: 'По', type: 'date', required: true },
      { id: 'reason', label: 'Причина', type: 'select', required: true, options: ['Болезнь', 'Олимпиада или конференция', 'Спортивные соревнования', 'Семейные обстоятельства', 'Другое'] },
      { id: 'note', label: 'Комментарий', type: 'textarea', max: 500, placeholder: 'Справку из поликлиники можно донести позже' },
    ] },
  { id: 'aid', group: 'app', icon: 'heart', title: 'Материальная помощь', short: 'Единовременная выплата студентам на бюджете', days: 10, delivery: ['none'], decision: true, budgetOnly: true,
    fields: [
      { id: 'reason', label: 'Основание', type: 'select', required: true, options: ['Сложная жизненная ситуация', 'Лечение', 'Рождение ребёнка', 'Студенческая семья', 'Другое'] },
      { id: 'details', label: 'Коротко о ситуации', type: 'textarea', required: true, min: 20, max: 1000 },
    ] },
  { id: 'individual', group: 'app', icon: 'clock', title: 'Индивидуальный график сессии', short: 'Перенос экзаменов при уважительной причине', days: 5, delivery: ['none'], decision: true,
    fields: [
      { id: 'disciplines', label: 'Какие экзамены перенести', type: 'text', required: true, max: 200 },
      { id: 'reason', label: 'Причина', type: 'textarea', required: true, min: 20, max: 800 },
    ] },
  { id: 'exchange', group: 'app', icon: 'plane', title: 'Программа обмена', short: 'Семестр в вузе-партнёре: заявка в отдел мобильности', days: 14, delivery: ['none'], decision: true, manual: true,
    fields: [
      { id: 'partner', label: 'Направление', type: 'select', required: true, options: ['Китай · Пекин', 'Франция · Париж', 'ОАЭ · Абу-Даби', 'Сербия · Белград', 'Бразилия · Сан-Паулу', 'Индия · Нью-Дели'] },
      { id: 'term', label: 'Семестр', type: 'select', required: true, options: ['Весна 2027', 'Осень 2027'] },
      { id: 'motivation', label: 'Мотивация', type: 'textarea', required: true, min: 40, max: 1500, placeholder: 'Почему именно этот вуз и чему хотите научиться' },
    ] },
  { id: 'retake', group: 'app', icon: 'refresh', title: 'Запись на пересдачу', short: 'Для академической задолженности', days: 3, delivery: ['none'], decision: true, needsDebt: true,
    fields: [
      { id: 'discipline', label: 'Дисциплина', type: 'debt', required: true },
      { id: 'slot', label: 'Удобная дата', type: 'slot', required: true },
    ] },
];
const SHOP_TYPE = { id: 'merch', group: 'shop', icon: 'bag', title: 'Мерч из Лавки', days: 1, delivery: ['paper'], fields: [] };
export const typeOf = (id) => TYPES.find((t) => t.id === id) || (id === 'merch' ? SHOP_TYPE : null);

const PICKUP = (f) => `Деканат ${f.short}, ауд. ${f.dean_office}, ${f.hours}`;

// Даты пересдач: ближайшие будни через неделю
function slots() {
  const out = [];
  let d = addDays(msk().date, 7);
  while (out.length < 3) {
    const w = new Date(d + 'T12:00:00Z').getUTCDay();
    if (w !== 0 && w !== 6) out.push(d);
    d = addDays(d, 2);
  }
  return out;
}

// Каталог для конкретного студента: подставляем его долги и даты, скрываем неподходящее
export function catalogFor(store, student) {
  const debts = store.all("SELECT e.discipline_id AS id, d.name FROM enrollments e JOIN disciplines d ON d.id = e.discipline_id WHERE e.student_id = ? AND e.status = 'debt'", student.id);
  return TYPES.filter((t) => !(t.budgetOnly && student.funding !== 'бюджет')).map((t) => Object.assign({}, t, {
    available: !t.needsDebt || debts.length > 0,
    hint: t.needsDebt && !debts.length ? 'Долгов нет — пересдача не нужна' : '',
    fields: t.fields.map((f) => f.type === 'debt' ? Object.assign({}, f, { type: 'select', options: debts.map((d) => d.name) })
      : f.type === 'slot' ? Object.assign({}, f, { type: 'select', options: slots() }) : f),
  }));
}

// Проверка полей формы по описанию в каталоге
function validate(type, body, catalog) {
  const t = catalog.find((x) => x.id === type.id);
  const data = {};
  const errors = {};
  (t ? t.fields : type.fields).forEach((f) => {
    const raw = body[f.id];
    if (f.type === 'number') {
      const n = raw === '' || raw == null ? f.default ?? null : int(raw, f.min, f.max);
      if (n == null) errors[f.id] = `От ${f.min} до ${f.max}`;
      else data[f.id] = n;
      return;
    }
    const v = str(raw, f.max || 200);
    if (f.required && !v) { errors[f.id] = 'Заполните поле'; return; }
    if (v && f.min && v.length < f.min) { errors[f.id] = `Не короче ${f.min} символов`; return; }
    if (v && f.type === 'select' && !f.options.includes(v)) { errors[f.id] = 'Выберите вариант из списка'; return; }
    if (v && f.type === 'date' && !isDate(v)) { errors[f.id] = 'Укажите дату'; return; }
    if (v) data[f.id] = v;
  });
  if (type.id === 'absence' && data.from && data.to && data.to < data.from) errors.to = 'Дата окончания раньше начала';
  return { data, errors };
}

function nextNumber(store) {
  const seq = Number(store.meta('seq_requests') || 1200) + 1;
  store.meta('seq_requests', seq);
  return `${msk().date.slice(0, 4)}/${String(seq).padStart(5, '0')}`;
}

// План автоматической обработки для демо: заявка сама проходит статусы, пока деканат не вмешается
function planFor(type, delivery) {
  const s = (sec) => Date.now() + sec * 1000;
  if (type.group === 'shop') return [{ at: s(25), status: 'ready', comment: 'Комплект собран — заберите в Лавке МГИМО, 1 этаж' }];
  if (type.group === 'cert') {
    return delivery === 'electronic'
      ? [{ at: s(20), status: 'in_work', comment: 'Специалист деканата взял заявку в работу' }, { at: s(70), status: 'ready', comment: 'Демонстрационная справка готова — можно скачать и проверить по коду' }]
      : [{ at: s(30), status: 'in_work', comment: 'Специалист деканата взял заявку в работу' }, { at: s(150), status: 'ready', comment: 'Справка готова — заберите оригинал в деканате' }];
  }
  if (type.manual) return [{ at: s(40), status: 'in_work', comment: 'Заявка передана в отдел академической мобильности. Решение комиссии — до 1 декабря' }];
  return [{ at: s(40), status: 'in_work', comment: 'Заявление зарегистрировано и передано на рассмотрение' }, { at: s(180), status: 'approved', comment: type.id === 'absence' ? 'Согласовано. Преподаватели предупреждены' : 'Заявление одобрено' }];
}

export function createRequest(store, student, faculty, body) {
  const type = typeOf(str(body.type, 30));
  if (!type || type.group === 'shop') fail(400, 'Неизвестный тип заявки');
  const catalog = catalogFor(store, student);
  const entry = catalog.find((t) => t.id === type.id);
  if (!entry) fail(400, 'Эта заявка вам недоступна');
  if (!entry.available) fail(400, entry.hint || 'Заявка сейчас недоступна');
  const delivery = type.delivery.includes(body.delivery) ? body.delivery : type.delivery[0];
  const lang = type.langs && type.langs.includes(body.lang) ? body.lang : (type.langs || ['ru'])[0];
  const { data, errors } = validate(type, body.fields || {}, catalog);
  if (Object.keys(errors).length) fail(422, 'Проверьте поля формы', { fields: errors });

  // Защита от дублей: та же справка в работе — не создаём вторую
  const open = store.get(`SELECT id, number FROM requests WHERE student_id = ? AND type = ? AND status IN ('submitted', 'in_work') AND payload = ?`, student.id, type.id, JSON.stringify(Object.assign({ lang }, data)));
  if (open) fail(409, `Такая заявка уже в работе: № ${open.number}`, { id: open.id });

  return insertRequest(store, student, faculty, type, Object.assign({ lang }, data), delivery);
}

export function insertRequest(store, student, faculty, type, payload, delivery, title) {
  return store.tx(() => {
    const now = Date.now();
    const number = nextNumber(store);
    const plan = planFor(type, delivery);
    const id = store.insert(
      `INSERT INTO requests (number, student_id, type, title, payload, delivery, status, created_at, updated_at, due_at, plan, verify_code)
       VALUES (?, ?, ?, ?, ?, ?, 'submitted', ?, ?, ?, ?, ?)`,
      number, student.id, type.id, title || type.title, JSON.stringify(payload), delivery, now, now, now + type.days * DAY,
      JSON.stringify(plan), type.group === 'cert' ? randomBytes(4).toString('hex').toUpperCase() : null,
    );
    store.run('INSERT INTO request_events (request_id, status, comment, actor, created_at) VALUES (?, ?, ?, ?, ?)', id, 'submitted',
      delivery === 'electronic' ? 'Электронная справка придёт сюда — с кодом для проверки' : delivery === 'paper' ? `Оригинал можно будет забрать: ${PICKUP(faculty)}` : 'Заявление отправлено в деканат', 'Вы', now);
    return id;
  });
}

// Переход статуса с записью в историю и уведомлением студенту
export function setStatus(store, req, status, comment, actor) {
  const now = Date.now();
  store.run('UPDATE requests SET status = ?, updated_at = ?, dean_comment = COALESCE(?, dean_comment) WHERE id = ?', status, now, actor === 'system' ? null : comment || null, req.id);
  store.run('INSERT INTO request_events (request_id, status, comment, actor, created_at) VALUES (?, ?, ?, ?, ?)', req.id, status, comment || null, actor === 'system' ? 'Деканат' : actor, now);
  if (status === 'cancelled') return;
  const text = {
    in_work: 'взята в работу', ready: req.delivery === 'electronic' ? 'готова — можно скачать' : 'готова — можно забрать', issued: 'выдана',
    approved: 'одобрена', rejected: 'отклонена',
  }[status] || STATUS[status].toLowerCase();
  notify(store, {
    audience: 'student', audienceId: req.student_id, kind: 'request', important: ['ready', 'approved', 'rejected'].includes(status) ? 1 : 0,
    title: `${req.title}: ${text}`, body: comment || `Заявка № ${req.number} — ${STATUS[status].toLowerCase()}`, link: `#/requests/${req.id}`,
  });
}

// Статусы только движутся вперёд: автоматика не откатит решение, которое уже принял деканат
export const RANK = { submitted: 0, in_work: 1, ready: 2, approved: 2, issued: 3, rejected: 9, cancelled: 9 };

// Автоматические шаги демо, срок которых наступил
export function applyPlans(store, studentId) {
  const rows = studentId
    ? store.all("SELECT * FROM requests WHERE student_id = ? AND plan IS NOT NULL AND plan != '[]'", studentId)
    : store.all("SELECT * FROM requests WHERE plan IS NOT NULL AND plan != '[]'");
  const now = Date.now();
  rows.forEach((r) => {
    let plan = JSON.parse(r.plan || '[]');
    let changed = false;
    while (plan.length && plan[0].at <= now) {
      const step = plan.shift();
      changed = true;
      if (FINAL.includes(r.status)) { plan = []; break; }
      if (RANK[step.status] <= RANK[r.status]) continue;
      setStatus(store, r, step.status, step.comment, 'system');
      r.status = step.status;
    }
    if (changed) store.run('UPDATE requests SET plan = ? WHERE id = ?', JSON.stringify(plan), r.id);
  });
}

export function publicRequest(store, r, faculty) {
  const type = typeOf(r.type);
  const events = store.all('SELECT status, comment, actor, created_at FROM request_events WHERE request_id = ? ORDER BY created_at, id', r.id);
  const steps = type && type.group === 'cert'
    ? (r.delivery === 'paper' ? ['submitted', 'in_work', 'ready', 'issued'] : ['submitted', 'in_work', 'ready'])
    : type && type.group === 'shop' ? ['submitted', 'ready', 'issued'] : ['submitted', 'in_work', 'approved'];
  return {
    id: r.id, number: r.number, type: r.type, group: type ? type.group : 'app', icon: type ? type.icon : 'doc', title: r.title,
    payload: JSON.parse(r.payload || '{}'), delivery: r.delivery, status: r.status, statusLabel: STATUS[r.status],
    createdAt: r.created_at, updatedAt: r.updated_at, dueAt: r.due_at, deanComment: r.dean_comment,
    steps, events,
    pickup: r.delivery === 'paper' && faculty ? (r.type === 'merch' ? 'Лавка МГИМО, 1 этаж, пн–сб 10:00–19:00' : PICKUP(faculty)) : null,
    downloadable: r.delivery === 'electronic' && ['ready', 'issued'].includes(r.status),
    cancellable: r.status === 'submitted',
  };
}
