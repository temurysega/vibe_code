// Дедлайны и ссылки уведомлений: относительный срок считается при показе, в день срока —
// отдельное напоминание, изменение расписания ведёт на конкретную дату и пару.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, client } from './helpers.js';
import { dueLabel } from '../server/domain/notifications.js';
import { msk, addDays, mskTime } from '../server/domain/time.js';

let app;
before(async () => { app = await startApp(); });
after(async () => { await app.close(); });

test('относительный срок: сегодня, завтра, послезавтра, через N дней, срок прошёл', () => {
  const now = mskTime('2026-11-21', '10:00');
  assert.equal(dueLabel(now, mskTime('2026-11-21', '18:00')), 'сегодня до 18:00');
  assert.equal(dueLabel(now, mskTime('2026-11-22', '09:30')), 'завтра до 09:30');
  assert.equal(dueLabel(now, mskTime('2026-11-23', '23:59')), 'послезавтра');
  assert.equal(dueLabel(now, mskTime('2026-11-26', '12:00')), 'через 5 дней');
  assert.equal(dueLabel(now, mskTime('2026-11-20', '12:00')), 'срок прошёл');
});

test('старое напоминание «послезавтра» показывает актуальный срок, а в день срока приходит второе', async () => {
  const alina = app.store.get("SELECT s.id, s.group_code FROM students s JOIN users u ON u.student_id = s.id WHERE u.login = 'a.morozova'");
  const past = app.store.insert('INSERT INTO deadlines (group_code, title, due_at, kind, link) VALUES (?, ?, ?, ?, ?)', alina.group_code, 'Эссе из прошлого', Date.now() - 36e5, 'essay', '#/grades');
  // Запись, созданная за два дня до срока, хранит слово «послезавтра»
  app.store.run(`INSERT INTO notifications (audience, audience_id, kind, title, body, link, important, ref, created_at) VALUES ('student', ?, 'deadline', ?, '', '#/grades', 0, ?, ?)`,
    String(alina.id), 'Эссе из прошлого — послезавтра', `deadline:${past}:${alina.id}`, Date.now() - 3 * 864e5);
  const soon = Date.now() + 20 * 60e3;
  const today = msk(soon).date === msk().date;
  const due = app.store.insert('INSERT INTO deadlines (group_code, title, due_at, kind, link) VALUES (?, ?, ?, ?, ?)', alina.group_code, 'Тест до вечера', soon, 'test', '#/grades');
  const c = client(app.base);
  await c.login('a.morozova');
  const list = (await c.req('GET', '/api/notifications')).data.list;
  const stale = list.find((n) => n.title.startsWith('Эссе из прошлого'));
  assert.equal(stale.title, 'Эссе из прошлого — срок прошёл');
  assert.ok(!list.some((n) => /послезавтра/.test(n.title) && n.title.startsWith('Эссе из прошлого')));
  const reminder = list.find((n) => n.title.startsWith('Тест до вечера'));
  assert.ok(reminder, 'напоминание за 3 дня создано');
  if (today) {
    assert.match(reminder.title, /— сегодня до \d{2}:\d{2}$/);
    assert.ok(list.some((n) => n.title === 'Сегодня срок: Тест до вечера'), 'в день срока — отдельное напоминание');
  }
  assert.match(reminder.body, /по Москве$/);
  app.store.run('DELETE FROM deadlines WHERE id IN (?, ?)', past, due);
});

test('изменение расписания ведёт на конкретную дату и пару', async () => {
  const d = client(app.base);
  await d.login('dekanat.mo');
  let pick = null;
  for (let i = 0; i < 10 && !pick; i++) {
    const date = addDays(msk().date, i);
    const day = (await d.req('GET', `/api/dean/day?group=${encodeURIComponent('МО-25-03')}&date=${date}`)).data.day;
    const it = day.items.find((x) => x.status === 'normal' && x.lessonId);
    if (it) pick = { date, it };
  }
  assert.ok(pick, 'в ближайшие дни есть пара для изменения');
  const r = await d.req('POST', '/api/dean/changes', { group: 'МО-25-03', date: pick.date, lesson: pick.it.lessonId, pair: pick.it.pair, type: 'room', room: '2014', reason: 'Проверка ссылки на пару' });
  assert.equal(r.status, 200);
  const s = client(app.base);
  await s.login('a.morozova');
  const n = (await s.req('GET', '/api/notifications')).data.list.find((x) => x.body === 'Проверка ссылки на пару');
  assert.equal(n.link, `#/schedule/${pick.date}/${pick.it.pair}`);
  // Стартовые изменения расписания тоже ведут на дату и пару
  assert.ok((await s.req('GET', '/api/notifications')).data.list.filter((x) => x.kind === 'schedule' && x.author === 'Учебный офис').every((x) => /^#\/schedule\/\d{4}-\d{2}-\d{2}\/\d$/.test(x.link)));
});
