// Предметная логика: время по Москве, шкала оценок, пароли и сценарий заявки.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, client } from './helpers.js';
import { addDays, weekday, isoWeek, weekMonday, holidayOf, semesterOf } from '../server/domain/time.js';
import { gradeOf, verdictOf } from '../server/domain/grades.js';
import { hashPassword, verifyPassword, passwordProblems } from '../server/security/password.js';

let app;
before(async () => { app = await startApp(); });
after(async () => { await app.close(); });

test('календарь: недели, праздники и семестры', () => {
  assert.equal(weekday('2026-11-04'), 3);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(weekMonday(isoWeek('2026-11-04')), '2026-11-02');
  assert.equal(holidayOf('2026-11-04'), 'День народного единства');
  assert.equal(semesterOf('2026-11-04').part, 1);
  assert.equal(semesterOf('2027-03-10').part, 2);
});

test('100-балльная шкала', () => {
  assert.equal(gradeOf(95).letter, 'A');
  assert.equal(gradeOf(82).letter, 'B');
  assert.equal(gradeOf(60).grade, 3);
  assert.equal(gradeOf(59).letter, 'F');
  assert.equal(verdictOf(61, 'credit').label, 'зачтено');
  assert.equal(verdictOf(48, 'exam').passed, false);
});

test('хеширование паролей и требования к новому паролю', async () => {
  const h = await hashPassword('Секрет-12345');
  assert.ok(await verifyPassword('Секрет-12345', h));
  assert.ok(!(await verifyPassword('секрет-12345', h)));
  assert.ok(passwordProblems('short').length > 0);
  assert.equal(passwordProblems('Длинный-пароль-2026', 'a.morozova').length, 0);
});

