// Общий демо-стенд для жюри. Объявления деканата видят все студенты факультета, поэтому
// массовые публикации ограничены, а ошибочные формы лимит не расходуют. Демо-автоматика
// заявок оставляет время на ручное решение сотрудника.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, client } from './helpers.js';
import { broadcasts } from '../server/routes/dean.js';

let app;
before(async () => { app = await startApp(); });
after(async () => { await app.close(); });

const announcement = (n) => ({ title: `Объявление для проверки ${n}`, body: 'Текст объявления для проверки ограничения', audience: 'faculty' });

test('деканат публикует не больше 10 объявлений за 10 минут, ошибки формы лимит не тратят', async () => {
  broadcasts.hits.clear();
  const dean = client(app.base);
  await dean.login('dekanat.mo');

  const invalid = await dean.req('POST', '/api/dean/announcements', { title: 'Мало', body: 'коротко', audience: 'faculty' });
  assert.equal(invalid.status, 422);

  for (let i = 1; i <= 10; i++) {
    const r = await dean.req('POST', '/api/dean/announcements', announcement(i));
    assert.equal(r.status, 200, `объявление ${i} должно пройти`);
  }
  const blocked = await dean.req('POST', '/api/dean/announcements', announcement(11));
  assert.equal(blocked.status, 429);
  assert.match(blocked.data.error, /Слишком много публикаций/);
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);

  // Изменение расписания расходует тот же лимит: отметить отмену пары тоже нельзя
  const change = await dean.req('POST', '/api/dean/changes', { group: 'МО-25-03', date: '2099-01-01', type: 'cancel', reason: 'Проверка лимита', lesson: 1, pair: 1 });
  assert.equal(change.status, 429);

  // Студент видит опубликованные объявления своего факультета, лишних нет
  const alina = client(app.base);
  await alina.login('a.morozova');
  const list = (await alina.req('GET', '/api/notifications')).data.list;
  assert.equal(list.filter((n) => n.title.startsWith('Объявление для проверки')).length, 10);
});

test('демо-автоматика оставляет время на ручное решение деканата и отключается его действием', async () => {
  const alina = client(app.base);
  await alina.login('a.morozova');
  const created = await alina.req('POST', '/api/requests', { type: 'study', delivery: 'electronic', lang: 'ru', fields: { place: 'Проверка автоматики', copies: 1 } });
  assert.equal(created.status, 201);
  const id = created.data.request.id;
  const row = app.store.get('SELECT created_at, plan FROM requests WHERE id = ?', id);
  const ready = JSON.parse(row.plan).find((step) => step.status === 'ready');
  assert.ok(ready.at - row.created_at >= 7 * 60e3, 'электронная справка не становится готовой раньше чем через 7 минут');

  const dean = client(app.base);
  await dean.login('dekanat.mo');
  const taken = await dean.req('PATCH', `/api/dean/requests/${id}`, { status: 'in_work', comment: 'Беру в работу' });
  assert.equal(taken.status, 200);
  assert.equal(app.store.get('SELECT plan FROM requests WHERE id = ?', id).plan, null);
});
