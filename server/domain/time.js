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

