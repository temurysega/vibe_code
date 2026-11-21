// Демо-кабинеты проверяющих: два человека входят под одинаковыми логинами в разные кабинеты.
// Заявки, объявления, прочитанные уведомления и выход в одном кабинете не влияют на другой;
// кабинет открывается по ссылке на втором устройстве и переживает перезапуск сервера.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startApp, client } from './helpers.js';
import { Store } from '../server/db.js';
import { seed } from '../server/seed/seed.js';
import { createApp } from '../server/app.js';
import { Sandboxes } from '../server/demo/sandboxes.js';

const dir = mkdtempSync(join(tmpdir(), 'mm-sandboxes-'));
let main;
let stand;

async function startStand() {
  const sandboxes = new Sandboxes({ dir });
  const server = createServer(createApp(main, { sandboxes }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${server.address().port}`, sandboxes, close: () => new Promise((r) => server.close(() => { sandboxes.closeAll(); r(); })) };
}

// Клиент с полноценной банкой cookie: сеанс и демо-кабинет приходят разными cookie
function browser(base) {
  const c = { jar: new Map(), csrf: '' };
  c.req = async (method, path, body) => {
    const headers = { Accept: 'application/json' };
    if (c.jar.size) headers.Cookie = [...c.jar].map(([k, v]) => `${k}=${v}`).join('; ');
    if (method !== 'GET' && c.csrf) headers['X-CSRF-Token'] = c.csrf;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(c.base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
    for (const line of res.headers.getSetCookie()) {
      const pair = line.split(';')[0];
      const i = pair.indexOf('=');
      if (/Max-Age=0/i.test(line)) c.jar.delete(pair.slice(0, i)); else c.jar.set(pair.slice(0, i), pair.slice(i + 1));
    }
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    return { status: res.status, data, headers: res.headers };
  };
  c.login = async (login) => {
    const r = await c.req('POST', '/api/auth/login', { login, password: 'mgimo2026' });
    if (r.data && r.data.csrf) c.csrf = r.data.csrf;
    return r;
  };
  c.base = base;
  return c;
}

before(async () => {
  main = new Store(':memory:');
  await seed(main);
  stand = await startStand();
});
after(async () => {
  await stand.close();
  main.close();
  rmSync(dir, { recursive: true, force: true });
});

const study = (place) => ({ type: 'study', delivery: 'electronic', lang: 'ru', fields: { place, copies: 1 } });
const places = async (c) => (await c.req('GET', '/api/requests')).data.requests.map((r) => r.payload.place);

let A;
let B;

test('каждый новый вход без кабинета получает свой демо-кабинет', async () => {
  A = browser(stand.base);
  B = browser(stand.base);
  assert.equal((await A.login('a.morozova')).status, 200);
  assert.equal((await B.login('a.morozova')).status, 200);
  assert.match(A.jar.get('mm_demo'), /^[a-z2-7]{16}$/);
  assert.notEqual(A.jar.get('mm_demo'), B.jar.get('mm_demo'));
  assert.deepEqual((await A.req('GET', '/api/demo')).data, { sandboxes: true, id: A.jar.get('mm_demo') });
});

test('заявки, объявления, прочитанное и выход одного кабинета не влияют на другой', async () => {
  assert.equal((await A.req('POST', '/api/requests', study('Кабинет A'))).status, 201);
  assert.ok((await places(A)).includes('Кабинет A'));
  assert.ok(!(await places(B)).includes('Кабинет A'), 'заявка другого проверяющего не видна');

  // Сотрудник открывает кабинет A по ссылке во втором окне
  const deanA = browser(stand.base);
  const link = await deanA.req('GET', `/?demo=${A.jar.get('mm_demo')}`);
  assert.equal(link.status, 302);
  assert.equal(deanA.jar.get('mm_demo'), A.jar.get('mm_demo'));
  await deanA.login('dekanat.mo');
  const deanB = browser(stand.base);
  deanB.jar.set('mm_demo', B.jar.get('mm_demo'));
  await deanB.login('dekanat.mo');
  const queue = async (d) => (await d.req('GET', '/api/dean/requests?status=all')).data.requests.map((r) => r.payload.place);
  assert.ok((await queue(deanA)).includes('Кабинет A'));
  assert.ok(!(await queue(deanB)).includes('Кабинет A'));

  const ann = await deanA.req('POST', '/api/dean/announcements', { title: 'Объявление кабинета A', body: 'Видно только в кабинете A', audience: 'faculty' });
  assert.equal(ann.status, 200);
  const titles = async (c) => (await c.req('GET', '/api/notifications')).data.list.map((n) => n.title);
  assert.ok((await titles(A)).includes('Объявление кабинета A'));
  assert.ok(!(await titles(B)).includes('Объявление кабинета A'));

  const unreadB = (await B.req('GET', '/api/notifications')).data.unread;
  assert.equal((await A.req('POST', '/api/notifications/read', { all: true })).status, 200);
  assert.equal((await A.req('GET', '/api/notifications')).data.unread, 0);
  assert.equal((await B.req('GET', '/api/notifications')).data.unread, unreadB, 'прочитанное в A не меняет B');

  // В своём кабинете видны все свои устройства, а чужих посетителей там нет
  const sessions = (await A.req('GET', '/api/auth/sessions')).data;
  assert.equal(sessions.shared, false);
  assert.equal(sessions.sessions.length, 1);

  assert.equal((await A.req('POST', '/api/auth/logout', {})).status, 200);
  assert.equal((await B.req('GET', '/api/auth/session')).status, 200, 'выход в A не завершает сеанс в B');
  assert.equal(A.jar.get('mm_demo') !== undefined, true, 'после выхода кабинет остаётся тем же');
});

test('неверный код в ссылке не открывает чужой кабинет', async () => {
  const x = browser(stand.base);
  const r = await x.req('GET', '/?demo=aaaaaaaaaaaaaaaa');
  assert.equal(r.status, 302);
  assert.equal(x.jar.get('mm_demo'), undefined);
});

test('кабинет и сеанс переживают перезапуск сервера', async () => {
  await A.login('a.morozova');
  await stand.close();
  stand = await startStand();
  A.base = stand.base;
  B.base = stand.base;
  assert.ok((await places(A)).includes('Кабинет A'));
  assert.equal((await B.req('GET', '/api/auth/session')).status, 200);
});

test('«Начать с чистого кабинета» создаёт новый кабинет и завершает сеанс', async () => {
  const before = A.jar.get('mm_demo');
  const r = await A.req('POST', '/api/demo/new', {});
  assert.equal(r.status, 200);
  assert.notEqual(A.jar.get('mm_demo'), before);
  assert.equal((await A.req('GET', '/api/auth/session')).status, 401);
  await A.login('a.morozova');
  assert.ok(!(await places(A)).includes('Кабинет A'));
});

test('проверка готовности: наполненная база — 200, пустая — 503', async () => {
  const ok = await browser(stand.base).req('GET', '/api/health');
  assert.equal(ok.status, 200);
  assert.equal(ok.data.ok, true);
  const empty = await startApp({ seedData: false });
  try {
    assert.equal((await client(empty.base).req('GET', '/api/health')).status, 503);
  } finally {
    await empty.close();
  }
});

test('в общем демо без кабинетов чужие сеансы скрыты и не закрываются', async () => {
  const shared = await startApp();
  try {
    const one = client(shared.base);
    const two = client(shared.base);
    await one.login('a.morozova');
    await two.login('a.morozova');
    const list = (await one.req('GET', '/api/auth/sessions')).data;
    assert.equal(list.shared, true);
    assert.equal(list.sessions.length, 1);
    assert.ok(list.sessions[0].current);
    assert.ok(list.hidden >= 1);
    assert.equal((await one.req('POST', '/api/auth/sessions/revoke-others', {})).status, 403);
    assert.equal((await two.req('GET', '/api/auth/session')).status, 200);
  } finally {
    await shared.close();
  }
});
