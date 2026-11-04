// Форматирование: числа, склонения, даты по Москве и экранирование.
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = (n) => Math.round(n).toLocaleString('ru-RU');
export const num = (n, digits = 1) => Number(n).toLocaleString('ru-RU', { maximumFractionDigits: digits });

export function plural(n, forms) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

// Москва — единый часовой пояс вуза, где бы ни открыли кабинет
const MSK = 'Europe/Moscow';
const partsFmt = new Intl.DateTimeFormat('en-CA', { timeZone: MSK, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export function mskNow(t = Date.now()) {
  const p = Object.fromEntries(partsFmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  const date = `${p.year}-${p.month}-${p.day}`;
  return { date, minutes: Number(p.hour) * 60 + Number(p.minute) };
}
export const toMin = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m; };
const noon = (d) => new Date(d + 'T12:00:00Z');
export const addDays = (d, n) => new Date(noon(d).getTime() + n * 864e5).toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((noon(b) - noon(a)) / 864e5);

