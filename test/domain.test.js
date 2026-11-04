// Предметная логика: время по Москве, шкала оценок, пароли и сценарий заявки.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, client } from './helpers.js';
import { addDays, weekday, isoWeek, weekMonday, holidayOf, semesterOf } from '../server/domain/time.js';
import { gradeOf, verdictOf } from '../server/domain/grades.js';
import { hashPassword, verifyPassword, passwordProblems } from '../server/security/password.js';

