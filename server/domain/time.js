// Время вуза: всё считается по Москве, даже если сервер живёт в UTC.
import { config } from '../config.js';

export const DAY = 864e5;

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: config.timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

// Дата и минуты от полуночи по Москве
export function msk(t = Date.now()) {
  const parts = Object.fromEntries(fmt.formatToParts(new Date(t)).map((p) => [p.type, p.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return { date, minutes: Number(parts.hour) * 60 + Number(parts.minute), weekday: weekday(date) };
}

// Календарная арифметика на строках YYYY-MM-DD через полдень UTC — без сюрпризов с переводом часов
const noon = (d) => Date.parse(d + 'T12:00:00Z');
export const addDays = (d, n) => new Date(noon(d) + n * DAY).toISOString().slice(0, 10);
export const weekday = (d) => { const w = new Date(noon(d)).getUTCDay(); return w === 0 ? 7 : w; };
export const mondayOf = (d) => addDays(d, 1 - weekday(d));
export const daysBetween = (a, b) => Math.round((noon(b) - noon(a)) / DAY);

// Момент времени (мс) для даты и времени по Москве (UTC+3, без перехода на летнее время)
export const mskTime = (date, hhmm = '00:00') => Date.parse(`${date}T${hhmm}:00+03:00`);

// ISO-неделя вида 2026-W45 и обратно — понедельник этой недели
export function isoWeek(d) {
  const thursday = addDays(d, 4 - weekday(d));
  const year = thursday.slice(0, 4);
  const first = mondayOf(addDays(`${year}-01-04`, 0));
  return `${year}-W${String(Math.floor(daysBetween(first, mondayOf(d)) / 7) + 1).padStart(2, '0')}`;
}
export function weekMonday(id) {
  const m = /^(\d{4})-W(\d{2})$/.exec(id || '');
  if (!m) return null;
  const n = Number(m[2]);
  if (n < 1 || n > 53) return null;
  return addDays(mondayOf(`${m[1]}-01-04`), (n - 1) * 7);
}

// Звонки: пары МГИМО в концепте
export const BELLS = [
  null,
  ['09:00', '10:20'],
  ['10:30', '11:50'],
  ['12:20', '13:40'],
  ['13:50', '15:10'],
  ['15:20', '16:40'],
  ['16:50', '18:10'],
  ['18:20', '19:40'],
];
export const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

// Учебный год: осенний семестр — с 1 сентября, весенний — с 9 февраля
export function semesterOf(date) {
  const y = Number(date.slice(0, 4));
  const md = date.slice(5);
  if (md >= '09-01') return { year: y, part: 1, start: `${y}-09-01`, end: `${y}-12-30`, sessionStart: `${y + 1}-01-11`, sessionEnd: `${y + 1}-01-31` };
  if (md < '02-09') return { year: y - 1, part: 1, start: `${y - 1}-09-01`, end: `${y - 1}-12-30`, sessionStart: `${y}-01-11`, sessionEnd: `${y}-01-31` };
  return { year: y - 1, part: 2, start: `${y}-02-09`, end: `${y}-06-06`, sessionStart: `${y}-06-08`, sessionEnd: `${y}-06-30` };
}

// Номер семестра студента по году поступления: 1 — осень первого курса
export function semesterNumber(admissionYear, date) {
  const s = semesterOf(date);
  return (s.year - admissionYear) * 2 + s.part;
}
export const courseOf = (admissionYear, date) => Math.max(1, Math.ceil(semesterNumber(admissionYear, date) / 2));

// Чётность недели считается от недели начала семестра: первая неделя — нечётная
export function parityOf(date) {
  const s = semesterOf(date);
  const n = Math.floor(daysBetween(mondayOf(s.start), mondayOf(date)) / 7) + 1;
  return { n: Math.max(1, n), parity: n % 2 ? 'odd' : 'even' };
}

// Праздничные и выходные дни: пар нет
const HOLIDAYS = {
  '01-01': 'Новогодние каникулы', '01-02': 'Новогодние каникулы', '01-03': 'Новогодние каникулы', '01-04': 'Новогодние каникулы',
  '01-05': 'Новогодние каникулы', '01-06': 'Новогодние каникулы', '01-07': 'Рождество Христово', '01-08': 'Новогодние каникулы',
  '02-23': 'День защитника Отечества', '03-08': 'Международный женский день', '05-01': 'Праздник Весны и Труда',
  '05-09': 'День Победы', '06-12': 'День России', '11-04': 'День народного единства', '12-31': 'Новогодние каникулы',
};
export const holidayOf = (date) => HOLIDAYS[date.slice(5)] || null;
