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

