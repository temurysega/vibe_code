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

