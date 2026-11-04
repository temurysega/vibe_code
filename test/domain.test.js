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

test('сценарий: справка подана, деканат взял в работу, студент получил уведомление', async () => {
  const st = client(app.base);
  const dean = client(app.base);
  await st.login('a.morozova');
  await dean.login('dekanat.mo');
  const bad = await st.req('POST', '/api/requests', { type: 'visa', fields: {} });
  assert.equal(bad.status, 422);
  assert.ok(bad.data.fields.country);
  const r = await st.req('POST', '/api/requests', { type: 'visa', delivery: 'electronic', lang: 'en', fields: { country: 'Сербия', dates: '12–20 января' } });
  assert.equal(r.status, 201);
  const id = r.data.request.id;
  assert.equal(r.data.request.payload.country, 'Сербия');
  const dup = await st.req('POST', '/api/requests', { type: 'visa', delivery: 'electronic', lang: 'en', fields: { country: 'Сербия', dates: '12–20 января' } });
  assert.equal(dup.status, 409);
  assert.equal((await dean.req('PATCH', `/api/dean/requests/${id}`, { status: 'in_work', comment: 'Готовим' })).status, 200);
  assert.equal((await dean.req('PATCH', `/api/dean/requests/${id}`, { status: 'rejected', comment: 'коротко' })).status, 422);
  assert.equal((await dean.req('PATCH', `/api/dean/requests/${id}`, { status: 'ready' })).status, 200);
  const n = (await st.req('GET', '/api/notifications')).data.list;
  assert.ok(n.some((x) => x.kind === 'request' && x.link === `#/requests/${id}`));
  const doc = await st.req('GET', `/api/requests/${id}/document`);
  assert.equal(doc.status, 200);
  const v = await fetch(`${app.base}/api/verify/${doc.data.document.verifyCode}`).then((x) => x.json());
  assert.equal(v.valid, true);
  assert.equal(v.holder, 'А. Д. М.');
});

