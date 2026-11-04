// Успеваемость по 100-балльной шкале: текущие баллы, прогноз, сессия, долги и история.
import { msk, semesterNumber, semesterOf, daysBetween } from './time.js';

export const SCALE = [
  { min: 90, letter: 'A', grade: 5, word: 'отлично' },
  { min: 82, letter: 'B', grade: 4, word: 'хорошо' },
  { min: 75, letter: 'C', grade: 4, word: 'хорошо' },
  { min: 67, letter: 'D', grade: 3, word: 'удовлетворительно' },
  { min: 60, letter: 'E', grade: 3, word: 'удовлетворительно' },
  { min: 0, letter: 'F', grade: 2, word: 'неудовлетворительно' },
];
export const CONTROL = { exam: 'Экзамен', credit: 'Зачёт', graded: 'Зачёт с оценкой' };

export const gradeOf = (points) => SCALE.find((s) => points >= s.min);

// Итог по дисциплине в словах: для зачёта — «зачтено», для экзамена — оценка
export function verdictOf(points, control) {
  const g = gradeOf(points);
  if (control === 'credit') return { passed: points >= 60, label: points >= 60 ? 'зачтено' : 'не зачтено', letter: g.letter, grade: null };
  return { passed: points >= 60, label: g.word, letter: g.letter, grade: g.grade };
}

const sum = (list, f) => list.reduce((a, x) => a + f(x), 0);

// Карточка дисциплины текущего семестра с прогнозом «что нужно, чтобы…»
function current(d, items) {
  const graded = items.filter((a) => a.points != null);
  const left = items.filter((a) => a.points == null);
  const earned = sum(graded, (a) => a.points);
  const gradedMax = sum(graded, (a) => a.max_points);
  const remaining = sum(left, (a) => a.max_points);
  const pace = gradedMax ? earned / gradedMax : null;
  const forecast = pace == null ? null : Math.min(100, Math.round(earned + pace * remaining));
  const targets = [60, 75, 90].map((min) => ({ min, need: Math.max(0, min - earned), reachable: min - earned <= remaining }));
  const att = items.filter((a) => a.kind === 'attendance' && a.points != null);
  let status = 'ok';
  if (forecast != null && forecast >= 90) status = 'excellent';
  else if (forecast != null && forecast >= 75) status = 'good';
  if (pace != null && (pace < 0.6 || forecast < 60)) status = 'risk';

