// Справка содержит персональный, неизменяемый снимок вымышленных начислений.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename, resolve } from 'node:path';
import { startApp, client } from './helpers.js';
import { studentOf } from '../server/security/auth.js';
import { buildStipendStatement, setStatus } from '../server/domain/requests.js';

const student = (app, login) => studentOf(app.store, app.store.get('SELECT student_id FROM users WHERE login = ?', login).student_id);
const stamp = (date) => Date.parse(`${date}T12:00:00+03:00`);
const ready = (app, id) => {
  const row = app.store.get('SELECT * FROM requests WHERE id = ?', id);
  app.store.run('UPDATE requests SET plan = NULL WHERE id = ?', id);
  setStatus(app.store, row, 'ready', 'Тестовая справка готова', 'Деканат');
};

test('справка: шесть полных месяцев по Москве, переход года и отсутствие начислений до зачисления', async () => {
  const app = await startApp();
  try {
    const person = { ...student(app, 't.aliev'), admission_year: 2026, funding: 'бюджет' };
    const statement = buildStipendStatement(app.store, person, Date.parse('2026-12-31T21:30:00Z'));
    assert.equal(statement.asOf, '2027-01-01');
    assert.deepEqual(statement.months.map((r) => r.month), ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12']);
    assert.deepEqual(statement.months.map((r) => r.amount), [0, 0, 3500, 3500, 3500, 3500]);
    assert.equal(statement.months[0].reason, 'До зачисления');
    assert.equal(statement.total, 14000);
    assert.equal(statement.demo, true);
    assert.match(statement.note, /вымышлен/);
  } finally { await app.close(); }
});

test('справка: сессии владельца определяют сумму, договор и задолженность дают нулевые месяцы', async () => {
  const app = await startApp();
  try {
    const person = { ...student(app, 'a.morozova'), admission_year: 2025 };
    app.store.run('UPDATE enrollments SET final_points = 95, status = ? WHERE student_id = ? AND semester = 1', 'passed', person.id);
    app.store.run('UPDATE enrollments SET final_points = 80, status = ? WHERE student_id = ? AND semester = 2', 'passed', person.id);
    const statement = buildStipendStatement(app.store, person, stamp('2026-11-08'));
    assert.deepEqual(statement.months.map((r) => r.month), ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    assert.deepEqual(statement.months.map((r) => r.amount), [5200, 5200, 3500, 3500, 3500, 3500]);
    assert.equal(statement.total, 24400);

    const contract = buildStipendStatement(app.store, { ...person, funding: 'контракт' }, stamp('2026-11-08'));
    assert.equal(contract.total, 0);
    assert.ok(contract.months.every((r) => r.reason === 'Обучение по договору'));

    const enrollment = app.store.get('SELECT discipline_id FROM enrollments WHERE student_id = ? AND semester = 2 LIMIT 1', person.id);
    app.store.run('UPDATE enrollments SET final_points = 48, status = ? WHERE student_id = ? AND semester = 2 AND discipline_id = ?', 'debt', person.id, enrollment.discipline_id);
    const debt = buildStipendStatement(app.store, person, stamp('2026-11-08'));
    assert.deepEqual(debt.months.map((r) => r.amount), [5200, 5200, 0, 0, 0, 0]);
    assert.equal(debt.total, 10400);
    assert.equal(debt.months[2].reason, 'Есть академическая задолженность');
  } finally { await app.close(); }
});

test('справка: API игнорирует чужой student_id и суммы клиента, сохраняет снимок и запрещает чужое чтение', async () => {
  const app = await startApp();
  try {
    const alina = client(app.base);
    const timur = client(app.base);
    await alina.login('a.morozova');
    await timur.login('t.aliev');
    const owner = student(app, 'a.morozova');
    const foreign = student(app, 't.aliev');
    const body = { type: 'stipend', delivery: 'electronic', student_id: foreign.id, fields: { _stipend: { total: 99999999 } }, _stipend: { total: 99999999 } };
    const created = await alina.req('POST', '/api/requests', body);
    assert.equal(created.status, 201);
    const id = created.data.request.id;
    assert.equal(created.data.request.payload._stipend, undefined);
    assert.equal(app.store.get('SELECT student_id FROM requests WHERE id = ?', id).student_id, owner.id);
    const duplicate = await alina.req('POST', '/api/requests', body);
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.data.id, id);
    ready(app, id);
    const document = (await alina.req('GET', `/api/requests/${id}/document`)).data.document;
    assert.equal(document.student.lastName, 'Морозова');
    assert.equal(document.stipend.months.length, 6);
    assert.notEqual(document.stipend.total, 99999999);
    assert.equal(document.payload._stipend, undefined);
    assert.equal((await timur.req('GET', `/api/requests/${id}/document`)).status, 404);

    app.store.run('UPDATE students SET funding = ? WHERE id = ?', 'контракт', owner.id);
    app.store.run('UPDATE enrollments SET final_points = 40, status = ? WHERE student_id = ?', 'debt', owner.id);
    assert.deepEqual((await alina.req('GET', `/api/requests/${id}/document`)).data.document.stipend, document.stipend);

    const own = await timur.req('POST', '/api/requests', { type: 'stipend', delivery: 'electronic' });
    assert.equal(own.status, 201);
    ready(app, own.data.request.id);
    const zero = (await timur.req('GET', `/api/requests/${own.data.request.id}/document`)).data.document;
    assert.equal(zero.student.lastName, 'Алиев');
    assert.equal(zero.stipend.total, 0);
    assert.ok(zero.stipend.months.every((r) => r.amount === 0));
  } finally { await app.close(); }
});

test('справка: старой заявке добавляется снимок за её период, который переживает повторное открытие БД', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'mgimo-stipend-'));
  const file = join(directory, 'test.db');
  let app;
  try {
    app = await startApp({ file });
    const c = client(app.base);
    await c.login('a.morozova');
    const created = await c.req('POST', '/api/requests', { type: 'stipend', delivery: 'electronic' });
    const id = created.data.request.id;
    // Имитируем заявку предыдущей версии без снимка: дата подачи намеренно в прошлом.
    app.store.run('UPDATE requests SET payload = ?, created_at = ? WHERE id = ?', '{"lang":"ru"}', stamp('2026-04-10'), id);
    ready(app, id);
    const statement = (await c.req('GET', `/api/requests/${id}/document`)).data.document.stipend;
    assert.equal(statement.from, '2025-10');
    assert.equal(statement.to, '2026-03');
    assert.equal(statement.asOf, '2026-04-10');
    assert.deepEqual(JSON.parse(app.store.get('SELECT payload FROM requests WHERE id = ?', id).payload)._stipend, statement);
    const cookie = c.cookie;
    await app.close();
    app = null;
    app = await startApp({ file, seedData: false });
    const restored = client(app.base);
    restored.cookie = cookie;
    const read = await restored.req('GET', `/api/requests/${id}/document`);
    assert.equal(read.status, 200);
    assert.deepEqual(read.data.document.stipend, statement);
  } finally {
    if (app) await app.close();
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('mgimo-stipend-'));
    rmSync(directory, { recursive: true, force: true });
  }
});
