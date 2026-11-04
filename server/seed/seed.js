// Наполнение демо-стенда. Даты строятся от «сегодня» по Москве, поэтому стенд всегда выглядит живым:
// ближайшие переносы, дедлайны через пару дней, справка, которая только что стала готова.
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../security/password.js';
import { FACULTIES, GROUPS, TEACHERS, PALETTE, PLAN, PAST, STUDENTS, EXTRA_STUDENTS, STAFF } from './data.js';
import { msk, addDays, semesterOf, semesterNumber, mskTime, daysBetween, weekday, parityOf, holidayOf, DAY } from '../domain/time.js';
import { defaults as playDefaults } from '../domain/play.js';
import { notify } from '../domain/notifications.js';

