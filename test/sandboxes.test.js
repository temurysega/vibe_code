// Демо-кабинеты проверяющих: два человека входят под одинаковыми логинами в разные кабинеты.
// Заявки, объявления, прочитанные уведомления и выход в одном кабинете не влияют на другой;
// кабинет открывается по ссылке на втором устройстве и переживает перезапуск сервера.
// Рецензия 22 ноября: база создаётся только после верного пароля, одновременные входы из одного
// браузера дают один кабинет, сброс — только из сеанса, проверка справки не открывает кабинет.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, readdirSync, existsSync } from 'node:fs';
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
  // Ответ без разбора JSON — для PDF
  c.raw = async (path) => {
    const res = await fetch(c.base + path, { headers: { Cookie: [...c.jar].map(([k, v]) => `${k}=${v}`).join('; ') } });
    return { status: res.status, bytes: Buffer.from(await res.arrayBuffer()), cookies: res.headers.getSetCookie() };
  };
  c.login = async (login, password = 'mgimo2026') => {
    const r = await c.req('POST', '/api/auth/login', { login, password });
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

test('неверный пароль не создаёт кабинет: ни базы, ни cookie кабинета', async () => {
  const before = stand.sandboxes.count();
  const x = browser(stand.base);
  const r = await x.login('a.morozova', 'не тот пароль');
  assert.equal(r.status, 401);
  assert.equal(x.jar.get('mm_demo'), undefined, 'без заготовки cookie кабинета не появляется');
  // С заготовкой со страницы входа: неверный пароль тоже не создаёт базу
  await x.req('GET', '/api/demo/accounts');
  const reserved = x.jar.get('mm_demo');
  assert.match(reserved, /^[a-z2-7]{16}$/);
  assert.equal((await x.login('a.morozova', 'снова не тот')).status, 401);
  assert.equal(stand.sandboxes.count(), before, 'после неудачных входов кабинетов не прибавилось');
  assert.equal(stand.sandboxes.exists(reserved), false);
  assert.deepEqual((await x.req('GET', '/api/demo')).data, { sandboxes: true, id: null });
});

test('одновременные входы из одного браузера попадают в один кабинет', async () => {
  const before = stand.sandboxes.count();
  const x = browser(stand.base);
  await x.req('GET', '/api/demo/accounts');
  const reserved = x.jar.get('mm_demo');
  // Две вкладки и двойное нажатие: три входа уходят одновременно с одной заготовкой
  const all = await Promise.all([x.login('a.morozova'), x.login('a.morozova'), x.login('dekanat.mo')]);
  assert.deepEqual(all.map((r) => r.status), [200, 200, 200]);
  assert.equal(stand.sandboxes.count(), before + 1, 'создан ровно один кабинет');
  assert.equal(x.jar.get('mm_demo'), reserved, 'кабинет получил код заготовки');
  assert.ok(stand.sandboxes.exists(reserved));
  assert.equal(readdirSync(dir).filter((f) => f.includes('.db.new')).length, 0, 'черновиков не осталось');
});

// Справка Алины из её кабинета: готовая электронная справка об обучении из стартовых данных
async function readyCertificate(c) {
  const list = (await c.req('GET', '/api/requests')).data.requests;
  const r = list.find((x) => x.type === 'study' && x.delivery === 'electronic' && x.status === 'ready');
  const doc = (await c.req('GET', `/api/requests/${r.id}/document`)).data.document;
  return { id: r.id, number: r.number, code: doc.verifyCode };
}

let certA;

test('проверка справки не открывает кабинет: в ссылке из PDF нет кода кабинета, cookie не выдаётся', async () => {
  await A.login('a.morozova');
  certA = await readyCertificate(A);
  const pdf = await A.raw(`/api/requests/${certA.id}/document.pdf`);
  assert.equal(pdf.status, 200);
  const text = pdf.bytes.toString('latin1');
  const groups = certA.code.match(/.{4}/g).join('-');
  assert.ok(text.includes(`(${stand.base}/#/verify/${groups})`), 'в PDF ссылка вида /#/verify/<код>');
  assert.ok(!text.includes('?demo='), 'кода демо-кабинета в PDF нет');

  // Человек без кабинета и без входа проверяет код — справка действительна, кабинет ему не выдан
  const stranger = browser(stand.base);
  const v = await stranger.req('GET', `/api/verify/${groups}`);
  assert.equal(v.status, 200);
  assert.equal(v.data.valid, true);
  assert.equal(v.data.number, certA.number);
  assert.equal(v.headers.getSetCookie().length, 0, 'проверка не ставит cookie');
  assert.equal(stranger.jar.size, 0);
  assert.deepEqual((await stranger.req('GET', '/api/demo')).data, { sandboxes: true, id: null });
  // Проверяющий из другого кабинета тоже видит справку действительной и остаётся в своём кабинете
  const ownB = B.jar.get('mm_demo');
  assert.equal((await B.req('GET', `/api/verify/${certA.code}`)).data.valid, true);
  assert.equal(B.jar.get('mm_demo'), ownB);
  // Несуществующий код — «не найден»
  assert.equal((await stranger.req('GET', '/api/verify/0000-0000-0000-0000')).status, 404);
});

test('кабинет, сеанс и проверка справки переживают перезапуск сервера', async () => {
  await A.login('a.morozova');
  await stand.close();
  stand = await startStand();
  A.base = stand.base;
  B.base = stand.base;
  assert.ok((await places(A)).includes('Кабинет A'));
  assert.equal((await B.req('GET', '/api/auth/session')).status, 200);
  assert.equal((await browser(stand.base).req('GET', `/api/verify/${certA.code}`)).data.valid, true);
});

test('«Начать с чистого кабинета» — только из открытого сеанса', async () => {
  const x = browser(stand.base);
  x.jar.set('mm_demo', A.jar.get('mm_demo'));
  const before = stand.sandboxes.count();
  const r = await x.req('POST', '/api/demo/new', {});
  assert.equal(r.status, 401);
  assert.equal(x.jar.get('mm_demo'), A.jar.get('mm_demo'), 'cookie кабинета не изменилась');
  assert.equal(stand.sandboxes.count(), before);
});

test('«Начать с чистого кабинета» завершает сеанс; новый кабинет появляется при входе', async () => {
  const before = A.jar.get('mm_demo');
  const count = stand.sandboxes.count();
  const r = await A.req('POST', '/api/demo/new', {});
  assert.equal(r.status, 200);
  const next = A.jar.get('mm_demo');
  assert.notEqual(next, before);
  assert.equal(stand.sandboxes.exists(next), false, 'до входа это только заготовка');
  assert.equal(stand.sandboxes.count(), count);
  assert.equal((await A.req('GET', '/api/auth/session')).status, 401);
  await A.login('a.morozova');
  assert.equal(A.jar.get('mm_demo'), next);
  assert.equal(stand.sandboxes.count(), count + 1);
  assert.ok(!(await places(A)).includes('Кабинет A'));
  // Прежний кабинет остался по старой ссылке
  const back = browser(stand.base);
  back.jar.set('mm_demo', before);
  await back.login('a.morozova');
  assert.ok((await places(back)).includes('Кабинет A'));
});

test('параллельные входы с одного адреса не обходят лимит новых кабинетов', async () => {
  const limitedDir = mkdtempSync(join(tmpdir(), 'mm-sandboxes-limit-'));
  const boxes = new Sandboxes({ dir: limitedDir, perIpPerHour: 2 });
  const server = createServer(createApp(main, { sandboxes: boxes }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const all = await Promise.all(Array.from({ length: 5 }, () => browser(base).login('t.aliev')));
    const codes = all.map((r) => r.status).sort();
    assert.deepEqual(codes, [200, 200, 429, 429, 429]);
    assert.equal(boxes.count(), 2);
  } finally {
    await new Promise((r) => server.close(r));
    boxes.closeAll();
    rmSync(limitedDir, { recursive: true, force: true });
  }
});

test('кабинет виден только наполненным, а вытесненная база не закрывается под запросом', async () => {
  const d = mkdtempSync(join(tmpdir(), 'mm-sandboxes-unit-'));
  const boxes = new Sandboxes({ dir: d, maxOpen: 1 });
  try {
    const id = 'abcdefghijklmnop';
    const job = boxes.create(id);
    assert.equal(boxes.exists(id), false, 'пока база наполняется, кабинета нет');
    assert.equal(existsSync(join(d, `${id}.db`)), false);
    const same = boxes.create(id);
    assert.equal(boxes.creating.size, 1, 'второй вход ждёт то же создание');
    assert.deepEqual(await Promise.all([job, same]), [id, id]);
    assert.ok(boxes.exists(id));
    const first = boxes.get(id);
    const other = await boxes.create();
    boxes.get(other);
    // Первая база вытеснена из списка открытых, но запрос, который её держит, ещё может читать
    assert.equal(boxes.open.has(id), false);
    assert.ok(first.get('SELECT COUNT(*) AS c FROM users').c > 0);
    // Ожидающих закрытия баз не больше maxOpen: при наплыве старейшая закрывается сразу
    boxes.get(await boxes.create());
    assert.equal(boxes.retired.size, 1);
  } finally {
    boxes.closeAll();
    rmSync(d, { recursive: true, force: true });
  }
});

test('проверка готовности: наполненная база — 200 и версия выпуска, пустая — 503', async () => {
  const ok = await browser(stand.base).req('GET', '/api/health');
  assert.equal(ok.status, 200);
  assert.equal(ok.data.ok, true);
  assert.match(ok.data.version, /^\d+\.\d+\.\d+$/);
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
