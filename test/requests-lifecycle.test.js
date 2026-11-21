// Жизненный цикл справки: срок в рабочих днях, дубли с учётом формата, очередь деканата,
// поиск и прямая ссылка для сотрудника, длинный код проверки и ограничение частоты.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, client } from './helpers.js';
import { addWorkdays, mskTime } from '../server/domain/time.js';
import { dueFor } from '../server/domain/requests.js';

let app;
before(async () => { app = await startApp(); });
after(async () => { await app.close(); });

const study = (place, delivery = 'electronic') => ({ type: 'study', delivery, lang: 'ru', fields: { place, copies: 1 } });

test('срок справки считается в рабочих днях, как обещает форма', () => {
  assert.equal(addWorkdays('2026-11-20', 1), '2026-11-23'); // пятница → понедельник
  assert.equal(addWorkdays('2026-11-21', 1), '2026-11-23'); // суббота → понедельник
  assert.equal(addWorkdays('2026-11-03', 1), '2026-11-05'); // 4 ноября — праздник
  assert.equal(addWorkdays('2026-11-23', 4), '2026-11-27');
  // Подали в пятницу в 15:10 — срок до понедельника, 18:00 по Москве
  assert.equal(dueFor(mskTime('2026-11-20', '15:10'), 1), mskTime('2026-11-23', '18:00'));
});

test('дубль определяется с учётом формата, повтор той же формы возвращает созданную заявку', async () => {
  const c = client(app.base);
  await c.login('a.morozova');
  const first = await c.req('POST', '/api/requests', study('Проверка дублей'));
  assert.equal(first.status, 201);
  const again = await c.req('POST', '/api/requests', study('Проверка дублей'));
  assert.equal(again.status, 409);
  assert.equal(again.data.id, first.data.request.id);
  const paper = await c.req('POST', '/api/requests', study('Проверка дублей', 'paper'));
  assert.equal(paper.status, 201, 'бумажная справка с тем же назначением — отдельная заявка');
});

test('готовая электронная справка уходит в «Завершённые», бумажная ждёт выдачи', async () => {
  const s = client(app.base);
  await s.login('a.morozova');
  const el = (await s.req('POST', '/api/requests', study('Очередь: электронная'))).data.request;
  const pa = (await s.req('POST', '/api/requests', study('Очередь: бумажная', 'paper'))).data.request;
  const d = client(app.base);
  await d.login('dekanat.mo');
  for (const r of [el, pa]) {
    assert.equal((await d.req('PATCH', `/api/dean/requests/${r.id}`, { status: 'in_work' })).status, 200);
    assert.equal((await d.req('PATCH', `/api/dean/requests/${r.id}`, { status: 'ready' })).status, 200);
  }
  const ids = async (status) => (await d.req('GET', `/api/dean/requests?status=${status}`)).data.requests.map((r) => r.id);
  const active = await ids('active');
  const done = await ids('done');
  assert.ok(!active.includes(el.id) && done.includes(el.id), 'электронная готовая — в завершённых');
  assert.ok(active.includes(pa.id) && !done.includes(pa.id), 'бумажная готовая — в активных до выдачи');
});

test('сотрудник находит заявку по номеру и открывает её по прямой ссылке только своего факультета', async () => {
  const s = client(app.base);
  await s.login('a.morozova');
  const mine = (await s.req('POST', '/api/requests', study('Поиск по номеру'))).data.request;
  const t = client(app.base);
  await t.login('t.aliev');
  const foreign = (await t.req('POST', '/api/requests', study('Заявка другого факультета'))).data.request;
  const d = client(app.base);
  await d.login('dekanat.mo');
  const full = await d.req('GET', `/api/dean/requests?q=${encodeURIComponent(mine.number)}`);
  assert.deepEqual(full.data.requests.map((r) => r.id), [mine.id]);
  const suffix = await d.req('GET', `/api/dean/requests?q=${Number(mine.number.slice(5))}`);
  assert.deepEqual(suffix.data.requests.map((r) => r.id), [mine.id]);
  assert.equal((await d.req('GET', `/api/dean/requests?q=${encodeURIComponent(foreign.number)}`)).data.requests.length, 0);
  assert.equal((await d.req('GET', '/api/dean/requests?q=abc')).status, 400);
  const direct = await d.req('GET', `/api/dean/requests/${mine.id}`);
  assert.equal(direct.status, 200);
  assert.equal(direct.data.request.number, mine.number);
  assert.ok(direct.data.request.actions.includes('in_work'));
  assert.equal((await d.req('GET', `/api/dean/requests/${foreign.id}`)).status, 404);
});

test('новая справка получает 16-значный код; проверка понимает дефисы, старые коды и ограничивает частоту', async () => {
  const s = client(app.base);
  await s.login('a.morozova');
  const r = (await s.req('POST', '/api/requests', study('Код проверки'))).data.request;
  const d = client(app.base);
  await d.login('dekanat.mo');
  await d.req('PATCH', `/api/dean/requests/${r.id}`, { status: 'in_work' });
  await d.req('PATCH', `/api/dean/requests/${r.id}`, { status: 'ready' });
  const doc = (await s.req('GET', `/api/requests/${r.id}/document`)).data.document;
  assert.match(doc.verifyCode, /^[0-9A-F]{16}$/);
  const dashed = doc.verifyCode.match(/.{4}/g).join('-');
  const v = client(app.base);
  const ok = await v.req('GET', `/api/verify/${dashed}`);
  assert.equal(ok.status, 200);
  assert.deepEqual(Object.keys(ok.data).sort(), ['holder', 'issuedAt', 'number', 'title', 'valid']);
  assert.equal(ok.data.holder, 'А. Д. М.');
  // Справки, выданные раньше, сохраняют 8-значный код и проверяются
  app.store.run('UPDATE requests SET verify_code = ? WHERE id = ?', 'ABCDEF12', r.id);
  assert.equal((await v.req('GET', '/api/verify/ABCDEF12')).status, 200);
  let limited = 0;
  for (let i = 0; i < 45; i++) if ((await v.req('GET', '/api/verify/0000000000000000')).status === 429) limited += 1;
  assert.ok(limited > 0, 'частые проверки упираются в лимит');
});
