// Время вуза: всё считается по Москве, даже если сервер живёт в UTC.
import { config } from '../config.js';

export const DAY = 864e5;

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: config.timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

