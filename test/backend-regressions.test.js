// Дополнительные проверки конкурса: приватность, устойчивость и сохранение данных.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startApp, client } from './helpers.js';
import { isDate } from '../server/http/body.js';
import { weekMonday } from '../server/domain/time.js';
import { notify } from '../server/domain/notifications.js';

let app;
before(async () => { app = await startApp(); });
after(async () => { await app.close(); });

test('невозможные даты и несуществующая ISO-неделя отклоняются', async () => {
  assert.equal(isDate('2027-02-31'), false);
  assert.equal(isDate('2027-02-29'), false);
  assert.equal(isDate('2028-02-29'), true);
  assert.equal(weekMonday('2025-W53'), null);
  assert.equal(weekMonday('2026-W53'), '2026-12-28');
  const c = client(app.base);
  await c.login('t.aliev');
  const r = await c.req('POST', '/api/requests', {
    type: 'absence', fields: { from: '2027-02-31', to: '2027-03-05', reason: 'Болезнь' },
  });
  assert.equal(r.status, 422);
  assert.ok(r.data.fields.from);
  assert.equal((await c.req('GET', '/api/schedule?week=2025-W53')).status, 400);
});

test('личный дедлайн с указанной группой не раскрывается другому студенту', async () => {
  const owner = app.store.get("SELECT student_id FROM users WHERE login = 't.aliev'").student_id;
  const other = app.store.get("SELECT s.* FROM students s JOIN users u ON u.student_id = s.id WHERE u.login = 'a.morozova'");
  const title = 'Личная встреча с куратором — проверка изоляции';
  app.store.run('INSERT INTO deadlines (group_code, student_id, title, due_at, kind) VALUES (?, ?, ?, ?, ?)',
    other.group_code, owner, title, Date.now() + 864e5, 'personal');
  const alina = client(app.base);
  const timur = client(app.base);
  await alina.login('a.morozova');
  await timur.login('t.aliev');
  assert.ok(!(await alina.req('GET', '/api/deadlines')).data.deadlines.some((d) => d.title === title));
  assert.ok(!(await alina.req('GET', '/api/home')).data.deadlines.some((d) => d.title === title));
  assert.ok(!(await alina.req('GET', '/api/notifications')).data.list.some((n) => n.title.includes(title)));
  assert.ok((await timur.req('GET', '/api/deadlines')).data.deadlines.some((d) => d.title === title));
  assert.ok((await timur.req('GET', '/api/notifications')).data.list.some((n) => n.title.includes(title)));
});

test('прочитать все очищает длинную историю и не меняет чужие уведомления', async () => {
  const alina = app.store.get("SELECT id, student_id FROM users WHERE login = 'a.morozova'");
  const timur = app.store.get("SELECT student_id FROM users WHERE login = 't.aliev'");
  app.store.tx(() => {
    for (let i = 0; i < 510; i++) notify(app.store, {
      audience: 'student', audienceId: alina.student_id, kind: 'system', title: `Уведомление ${i}`,
    });
  });
  const foreignId = notify(app.store, { audience: 'student', audienceId: timur.student_id, kind: 'system', title: 'Личное уведомление Тимура' });
  const c = client(app.base);
  await c.login('a.morozova');
  assert.equal((await c.req('POST', '/api/notifications/read', { ids: [foreignId] })).data.marked, 0);
  const result = await c.req('POST', '/api/notifications/read', { all: true });
  assert.equal(result.status, 200);
  assert.ok(result.data.marked >= 510);
  assert.equal(result.data.unread, 0);
  assert.equal((await c.req('POST', '/api/notifications/read', { all: true })).data.marked, 0);
  assert.equal(app.store.get('SELECT 1 FROM notification_reads WHERE user_id = ? AND notification_id = ?', alina.id, foreignId), null);
});

test('параллельные попытки входа не обходят ограничение перебора', async () => {
  const results = await Promise.all(Array.from({ length: 12 }, (_, i) => client(app.base).login('missing.concurrent', `bad-password-${i}`)));
  assert.equal(results.filter((r) => r.status === 401).length, 5);
  assert.equal(results.filter((r) => r.status === 429).length, 7);
});

test('сеанс можно отозвать только у себя; просроченная cookie не авторизует', async () => {
  // Режим без демо: в общем демо-стенде сеансы других посетителей закрывать нельзя (sandboxes.test.js)
  const mode = process.env.DEMO_MODE;
  process.env.DEMO_MODE = '0';
  try {
  const first = client(app.base);
  const second = client(app.base);
  const foreign = client(app.base);
  await first.login('a.morozova');
  await second.login('a.morozova');
  await foreign.login('t.aliev');
  const sessions = (await second.req('GET', '/api/auth/sessions')).data.sessions;
  const secondId = sessions.find((s) => s.current).id;
  assert.equal((await foreign.req('DELETE', `/api/auth/sessions/${secondId}`, {})).status, 404);
  assert.equal((await first.req('DELETE', `/api/auth/sessions/${secondId}`, {})).status, 200);
  assert.equal((await second.req('GET', '/api/me')).status, 401);
  const user = app.store.get("SELECT id FROM users WHERE login = 't.aliev'");
  app.store.run('UPDATE sessions SET expires_at = ? WHERE user_id = ?', Date.now() - 1, user.id);
  assert.equal((await foreign.req('GET', '/api/me')).status, 401);
  } finally {
    if (mode === undefined) delete process.env.DEMO_MODE; else process.env.DEMO_MODE = mode;
  }
});

test('профиль знает время предыдущего входа: на телефоне сообщения о входе нет', async () => {
  const user = app.store.get("SELECT id FROM users WHERE login = 'k.lebedeva'");
  app.store.run("DELETE FROM audit_log WHERE user_id = ? AND action = 'login'", user.id);
  const first = client(app.base);
  await first.login('k.lebedeva');
  assert.equal((await first.req('GET', '/api/auth/sessions')).data.prevLogin, null, 'первый вход — предыдущего нет');
  const loggedAt = app.store.get("SELECT created_at FROM audit_log WHERE user_id = ? AND action = 'login' ORDER BY id DESC LIMIT 1", user.id).created_at;
  const second = client(app.base);
  await second.login('k.lebedeva');
  const data = (await second.req('GET', '/api/auth/sessions')).data;
  assert.equal(data.prevLogin, loggedAt, 'предыдущий — время первого входа');
  assert.ok(data.lastLogin >= data.prevLogin);
});

test('сбой игрового слоя не мешает отправить заявку: номер и статус приходят сразу', async () => {
  const c = client(app.base);
  await c.login('a.morozova');
  const u = app.store.get("SELECT student_id FROM users WHERE login = 'a.morozova'");
  // Игровой профиль недоступен: запись прогресса после заявки падает
  const saved = app.store.get('SELECT * FROM play_state WHERE student_id = ?', u.student_id);
  app.store.run('DELETE FROM play_state WHERE student_id = ?', u.student_id);
  try {
    const r = await c.req('POST', '/api/requests', { type: 'study', delivery: 'electronic', lang: 'ru', fields: { place: 'Проверка без игры', copies: 1 } });
    assert.equal(r.status, 201);
    assert.match(r.data.request.number, /^\d{4}\/\d{5}$/);
    assert.equal(r.data.request.status, 'submitted');
    const list = (await c.req('GET', '/api/requests')).data.requests;
    assert.equal(list.filter((x) => x.payload.place === 'Проверка без игры').length, 1, 'заявка сохранена один раз');
  } finally {
    app.store.run('INSERT INTO play_state (student_id, state, updated_at) VALUES (?, ?, ?)', saved.student_id, saved.state, saved.updated_at);
  }
});

test('подстановка student_id в теле и query не меняет владельца заявки', async () => {
  const c = client(app.base);
  await c.login('t.aliev');
  const alina = app.store.get("SELECT student_id FROM users WHERE login = 'a.morozova'");
  const timur = app.store.get("SELECT student_id FROM users WHERE login = 't.aliev'");
  const r = await c.req('POST', `/api/requests?student_id=${alina.student_id}`, {
    type: 'study', student_id: alina.student_id, fields: { place: 'Проверка владельца', copies: 1 },
  });
  assert.equal(r.status, 201);
  assert.equal(app.store.get('SELECT student_id FROM requests WHERE id = ?', r.data.request.id).student_id, timur.student_id);
  assert.equal((await c.req('GET', `/api/me?student_id=${alina.student_id}`)).data.profile.lastName, 'Алиев');
});

test('заявка, история, уведомления и сессия сохраняются после открытия БД заново', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'mgimo-persistence-'));
  const file = join(directory, 'test.db');
  let persistent;
  try {
    persistent = await startApp({ file });
    const c = client(persistent.base);
    await c.login('t.aliev');
    const request = await c.req('POST', '/api/requests', { type: 'study', fields: { place: 'Проверка сохранения', copies: 1 } });
    assert.equal(request.status, 201);
    const id = request.data.request.id;
    const cookie = c.cookie;
    await persistent.close();
    persistent = null;
    persistent = await startApp({ file, seedData: false });
    const restored = client(persistent.base);
    restored.cookie = cookie;
    const read = await restored.req('GET', `/api/requests/${id}`);
    assert.equal(read.status, 200);
    assert.equal(read.data.request.payload.place, 'Проверка сохранения');
    assert.equal(read.data.request.status, 'submitted');
    assert.equal(read.data.request.events[0].status, 'submitted');
    assert.ok((await restored.req('GET', '/api/notifications')).data.list.length > 0);
  } finally {
    if (persistent) await persistent.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
