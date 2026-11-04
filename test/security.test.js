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

