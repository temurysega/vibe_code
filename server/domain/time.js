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

