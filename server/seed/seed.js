// Наполнение демо-стенда. Даты строятся от «сегодня» по Москве, поэтому стенд всегда выглядит живым:
// ближайшие переносы, дедлайны через пару дней, справка, которая только что стала готова.
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../security/password.js';
import { FACULTIES, GROUPS, TEACHERS, PALETTE, PLAN, PAST, STUDENTS, EXTRA_STUDENTS, STAFF } from './data.js';
import { msk, addDays, semesterOf, semesterNumber, mskTime, daysBetween, weekday, parityOf, holidayOf, DAY } from '../domain/time.js';
import { defaults as playDefaults } from '../domain/play.js';
import { notify } from '../domain/notifications.js';

// Публичный тестовый пароль демо-аккаунтов. В базу попадает только его хеш scrypt
export const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'mgimo2026';
export const DEMO_ACCOUNTS = [
  { login: 'a.morozova', role: 'student', who: 'Алина Морозова', note: '2 курс МО · отличница, одна дисциплина в зоне риска' },
  { login: 't.aliev', role: 'student', who: 'Тимур Алиев', note: '1 курс МЭО · первокурсник, «Первые шаги»' },
  { login: 'k.lebedeva', role: 'student', who: 'Ксения Лебедева', note: '4 курс МП · долг и заявка на обмен' },
  { login: 'dekanat.mo', role: 'dean', who: 'Ирина Белова', note: 'Деканат МО · обработка заявок' },
];

