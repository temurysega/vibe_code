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

// Детерминированный генератор: у каждого студента одни и те же баллы при каждом пересоздании
function rng(seedStr) {
  let h = 2166136261;
  for (const c of seedStr) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h += 0x6D2B79F5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Контрольные точки семестра: [название, вид, максимум, доля семестра; null — в сессию]
const TPL = {
  exam: [['Посещаемость · сентябрь', 'attendance', 3, 0.2], ['Посещаемость · октябрь', 'attendance', 3, 0.45], ['Посещаемость · ноябрь', 'attendance', 2, 0.7], ['Посещаемость · декабрь', 'attendance', 2, 0.95],
    ['Контрольная работа', 'test', 15, 0.36], ['Работа на семинарах · I половина', 'seminar', 10, 0.48], ['Эссе', 'essay', 15, 0.62], ['Работа на семинарах · II половина', 'seminar', 10, 0.96], ['Экзамен', 'exam', 40, null]],
  credit: [['Посещаемость · сентябрь', 'attendance', 5, 0.2], ['Посещаемость · октябрь', 'attendance', 5, 0.45], ['Посещаемость · ноябрь', 'attendance', 5, 0.7], ['Посещаемость · декабрь', 'attendance', 5, 0.95],
    ['Тест', 'test', 20, 0.4], ['Работа на семинарах · I половина', 'seminar', 15, 0.5], ['Проект', 'project', 30, 0.8], ['Работа на семинарах · II половина', 'seminar', 15, 0.96]],
  graded: [['Посещаемость · сентябрь', 'attendance', 3, 0.2], ['Посещаемость · октябрь', 'attendance', 3, 0.45], ['Посещаемость · ноябрь', 'attendance', 2, 0.7], ['Посещаемость · декабрь', 'attendance', 2, 0.95],
    ['Лексико-грамматический тест', 'test', 15, 0.33], ['Домашние задания · I половина', 'homework', 10, 0.48], ['Письменная работа', 'essay', 15, 0.66], ['Домашние задания · II половина', 'homework', 10, 0.96], ['Устный зачёт с оценкой', 'oral', 40, null]],
};

// Ближайший день, когда у группы стоит эта пара (с учётом чётности и праздников)
function nextOccurrence(lesson, from) {
  for (let i = 0; i < 21; i++) {
    const d = addDays(from, i);
    if (weekday(d) !== lesson.weekday || holidayOf(d)) continue;
    if (lesson.parity !== 'all' && parityOf(d).parity !== lesson.parity) continue;
    return d;
  }
  return null;
}

