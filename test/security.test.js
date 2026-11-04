// Требования конкурса по безопасности — автоматической проверкой.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, client } from './helpers.js';

let app;
before(async () => { app = await startApp(); });
after(async () => { await app.close(); });

test('пароли хранятся только в виде хеша scrypt', () => {
  const rows = app.store.all('SELECT login, password_hash FROM users');
  assert.ok(rows.length >= 4);
  for (const r of rows) {
    assert.match(r.password_hash, /^scrypt\$\d+\$\d+\$\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    assert.ok(!r.password_hash.includes('mgimo2026'));
  }
  // Соль случайная: одинаковые пароли дают разные хеши
  assert.equal(new Set(rows.map((r) => r.password_hash)).size, rows.length);
});

test('без входа данные недоступны', async () => {
  const c = client(app.base);
  for (const p of ['/api/home', '/api/me', '/api/grades', '/api/requests', '/api/requests/1', '/api/notifications']) {
    assert.equal((await c.req('GET', p)).status, 401, p);
  }
});

test('неверный пароль не пускает, верный — пускает с безопасной cookie', async () => {
  const c = client(app.base);
  assert.equal((await c.login('a.morozova', 'wrong-password')).status, 401);
  const ok = await c.login('a.morozova');
  assert.equal(ok.status, 200);
  const cookie = ok.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.ok(ok.data.csrf);
});

test('студент не открывает чужую заявку даже по прямому адресу', async () => {
  const alina = client(app.base);
  const ksenia = client(app.base);
  await alina.login('a.morozova');
  await ksenia.login('k.lebedeva');
  const own = (await alina.req('GET', '/api/requests')).data.requests;
  assert.ok(own.length > 0);
  const id = own[0].id;
  assert.equal((await alina.req('GET', `/api/requests/${id}`)).status, 200);
  // Ксения подставляет id заявки Алины
  assert.equal((await ksenia.req('GET', `/api/requests/${id}`)).status, 404);
  assert.equal((await ksenia.req('POST', `/api/requests/${id}/cancel`, {})).status, 404);
  assert.equal((await ksenia.req('GET', `/api/requests/${id}/document`)).status, 404);
  // и не видит её в своём списке
  const list = (await ksenia.req('GET', '/api/requests')).data.requests;
  assert.ok(!list.some((r) => r.id === id));
});

test('профиль и оценки — только свои', async () => {
  const c = client(app.base);
  await c.login('t.aliev');
  const me = (await c.req('GET', '/api/me')).data.profile;
  assert.equal(me.lastName, 'Алиев');
  const g = (await c.req('GET', '/api/grades')).data;
  assert.ok(g.current.length > 0);
  // В API нет маршрута, который принимал бы id студента
  assert.equal((await c.req('GET', '/api/students/1')).status, 404);
});

test('деканат видит только свой факультет, студент не видит деканат', async () => {
  const dean = client(app.base);
  await dean.login('dekanat.mo');
  const list = (await dean.req('GET', '/api/dean/requests?status=all')).data.requests;
  assert.ok(list.length > 0);
  assert.ok(list.every((r) => r.student.group.startsWith('МО-')));
  const ksenia = client(app.base);
  await ksenia.login('k.lebedeva');
  const kReq = (await ksenia.req('GET', '/api/requests')).data.requests[0];
  assert.equal((await dean.req('PATCH', `/api/dean/requests/${kReq.id}`, { status: 'in_work' })).status, 404);
  assert.equal((await ksenia.req('GET', '/api/dean/requests')).status, 403);
  assert.equal((await dean.req('GET', '/api/home')).status, 403);
});

test('изменяющий запрос без CSRF-токена или с чужого сайта отклоняется', async () => {
  const c = client(app.base);
  await c.login('a.morozova');
  const noToken = await c.req('POST', '/api/requests', { type: 'study', fields: { place: 'Банк' } }, { 'X-CSRF-Token': '' });
  assert.equal(noToken.status, 403);
  const foreign = await c.req('POST', '/api/requests', { type: 'study', fields: { place: 'Банк' } }, { Origin: 'https://evil.example' });
  assert.equal(foreign.status, 403);
});

test('перебор паролей блокируется', async () => {
  const c = client(app.base);
  let last;
  for (let i = 0; i < 7; i++) last = await c.login('k.lebedeva', 'bad-password-' + i);
  assert.equal(last.status, 429);
  assert.ok(last.headers.get('retry-after'));
});

test('выход завершает сессию на сервере', async () => {
  const c = client(app.base);
  await c.login('a.morozova');
  const cookie = c.cookie;
  assert.equal((await c.req('POST', '/api/auth/logout', {})).status, 200);
  c.cookie = cookie; // старая cookie больше не действует
  assert.equal((await c.req('GET', '/api/home')).status, 401);
});

test('заголовки безопасности и защита статики', async () => {
  const r = await fetch(app.base + '/');
  assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  for (const p of ['/../server/config.js', '/%2e%2e/server/config.js', '/..%2fpackage.json']) {
    const x = await fetch(app.base + p);
    assert.notEqual(x.status, 200, p);
  }
});

test('счёт забега не подделать из браузера', async () => {
  const c = client(app.base);
  await c.login('a.morozova');
  const start = await c.req('POST', '/api/game/start', {});
  assert.equal(start.status, 200);
  const fin = await c.req('POST', '/api/game/finish', { run: start.data.run, score: 9999999, coins: 9999 });
  assert.equal(fin.status, 200);
  assert.ok(fin.data.result.score < 1000, 'счёт обрезан по времени забега');
  assert.ok(fin.data.result.coins <= 2);
});

