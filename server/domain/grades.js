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

  // Подсказка простыми словами: цель — та оценка, к которой студент идёт по прогнозу
  const goal = targets.slice().reverse().find((t) => t.reachable && (forecast == null || t.min <= forecast + 3)) || targets.find((t) => t.reachable);
  const goalName = (min) => (min === 90 ? '«отлично»' : min === 75 ? '«хорошо»' : d.control === 'credit' ? 'зачёта' : '«удовлетворительно»');
  const nextItem = left.filter((a) => a.kind !== 'attendance').sort((a, b) => String(a.date || '9').localeCompare(String(b.date || '9')))[0];
  let advice;
  if (status === 'risk') advice = `Чтобы получить ${d.control === 'credit' ? 'зачёт' : '«удовлетворительно»'}, нужно ещё ${Math.max(0, 60 - earned)} из ${remaining} оставшихся баллов`;
  else if (goal && goal.need > 0) advice = `До ${goalName(goal.min)} — ${goal.need} ${plural(goal.need, ['балл', 'балла', 'баллов'])} из ${remaining} возможных`;
  else if (goal) advice = `Баллов на ${goalName(goal.min).replace('зачёта', 'зачёт')} уже достаточно — держите темп`;
  else if (!remaining) advice = 'Все контрольные точки пройдены';
  else advice = 'Держите темп — впереди ещё контрольные точки';

  return {
    id: d.discipline_id, name: d.name, short: d.short, color: d.color, control: d.control, controlLabel: CONTROL[d.control], credits: d.credits,
    teacher: d.t_name ? { name: d.t_name, short: d.t_short, email: d.t_email, hours: d.t_hours } : null,
    earned, gradedMax, remaining, pace, forecast, forecastVerdict: forecast == null ? null : verdictOf(forecast, d.control),
    targets, status, advice,
    attendance: att.length ? Math.round((sum(att, (a) => a.points) / sum(att, (a) => a.max_points)) * 100) : null,
    next: nextItem ? { title: nextItem.title, date: nextItem.date, max: nextItem.max_points } : null,
    items: items.map((a) => ({ id: a.id, title: a.title, kind: a.kind, max: a.max_points, points: a.points, date: a.date })),
  };
}

export function plural(n, forms) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

// Синтетический рейтинг группы: распределение баллов однокурсников без персональных данных
function groupRank(groupCode, myAvg) {
  let seed = [...groupCode].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const others = Array.from({ length: 22 }, () => 3.2 + rnd() * 1.75);
  const place = 1 + others.filter((x) => x > myAvg).length;
  return { place, of: others.length + 1, top: Math.round((place / (others.length + 1)) * 100) };
}

