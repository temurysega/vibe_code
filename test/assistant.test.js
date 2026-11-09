import { test, before, after, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, client } from './helpers.js';
import { config } from '../server/config.js';
import { snapshot, contextText, aiAnswer, extractLink, ruleAnswer } from '../server/domain/assistant.js';
import { studentOf } from '../server/security/auth.js';

let app;
const original = { openrouterKey: config.openrouterKey, anthropicKey: config.anthropicKey, openrouterModel: config.openrouterModel };
before(async () => { app = await startApp(); });
after(async () => { await app.close(); });
afterEach(() => { mock.restoreAll(); Object.assign(config, original); });

function studentSnapshot(login = 'a.morozova') {
  const user = app.store.get('SELECT * FROM users WHERE login = ?', login);
  return snapshot(app.store, user, studentOf(app.store, user.student_id));
}

test('OpenRouter получает только снимок текущего студента, ключ не возвращается клиенту', async () => {
  config.openrouterKey = 'test-secret-never-return';
  config.openrouterModel = 'test/model';
  config.anthropicKey = 'must-not-be-used';
  let payload;
  mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer test-secret-never-return');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    payload = JSON.parse(options.body);
    return Response.json({ choices: [{ message: { content: 'Откройте расписание. [[#/schedule]]' } }] });
  });
  const answer = await aiAnswer(studentSnapshot(), 'Мои пары?', []);
  assert.equal(answer.provider, 'openrouter');
  assert.equal(answer.link.href, '#/schedule');
  assert.equal(payload.model, 'test/model');
  assert.ok(payload.max_tokens <= 1200);
  const context = payload.messages[1].content;
  assert.match(context, /Алина Морозова/);
  assert.doesNotMatch(context, /Тимур Алиев|Ксения Лебедева|password_hash|test-secret/);
  assert.doesNotMatch(JSON.stringify(answer), /test-secret/);
});

test('ошибка, лимит, пустой ответ и сетевой сбой OpenRouter возвращают управление локальным правилам', async () => {
  config.openrouterKey = 'test-key';
  const snap = studentSnapshot();
  for (const response of [
    () => Response.json({ error: 'private provider details' }, { status: 401 }),
    () => Response.json({}, { status: 429 }),
    () => Response.json({ error: { code: 502 } }),
    () => Response.json({ choices: [{ message: { content: '' } }] }),
    () => Response.json({ choices: [{ message: { content: 'blocked', refusal: 'refused' } }] }),
    () => { throw new DOMException('Timed out', 'TimeoutError'); },
  ]) {
    mock.method(globalThis, 'fetch', async () => response());
    assert.equal(await aiAnswer(snap, 'Расписание?', []), null);
    mock.restoreAll();
  }
});

test('без ключей помощник работает по персональным данным и распознаёт слово «пара»', async () => {
  config.openrouterKey = '';
  config.anthropicKey = '';
  const c = client(app.base);
  await c.login('t.aliev');
  const r = await c.req('POST', '/api/assistant', { message: 'Где моя пара?' });
  assert.equal(r.status, 200);
  assert.equal(r.data.source, 'rules');
  assert.equal(r.data.link.href, '#/schedule');
  assert.doesNotMatch(r.data.text, /Морозова|Лебедева/);
});

test('ответ модели может ссылаться только на разрешённые разделы', () => {
  assert.equal(extractLink('Ссылка [[#/admin]]').link, null);
  assert.equal(extractLink('Справка [[#/requests/new/study]]').link.href, '#/requests/new/study');
});

test('помощник не включает личный дедлайн другого студента из той же группы', () => {
  const snap = studentSnapshot();
  const other = studentSnapshot('t.aliev');
  app.store.run("INSERT INTO deadlines (group_code, student_id, title, due_at, kind) VALUES (?, ?, ?, ?, 'task')",
    snap.student.group_code, other.student.id, 'PRIVATE-DEADLINE-MARKER', Date.now() + 86400000);
  const fresh = studentSnapshot();
  assert.ok(!fresh.deadlines.some((d) => d.title === 'PRIVATE-DEADLINE-MARKER'));
  assert.doesNotMatch(ruleAnswer(fresh, 'Какие дедлайны?').text, /PRIVATE-DEADLINE-MARKER/);
});

test('в субботу вопрос о завтрашних парах учитывает воскресенье и в ответе, и в контексте ИИ', () => {
  mock.method(Date, 'now', () => Date.parse('2026-11-14T09:00:00+03:00'));
  const snap = studentSnapshot();
  assert.deepEqual(snap.days.map((d) => d.date), ['2026-11-14', '2026-11-15', '2026-11-16']);
  const answer = ruleAnswer(snap, 'Какие завтра пары?');
  assert.match(answer.text, /^Завтра пар нет — воскресенье\./);
  assert.equal(answer.link.href, '#/schedule');
  assert.match(contextText(snap), /вс, 15 ноября — выходной \(Воскресенье\)/);
});

test('в воскресенье сегодня остаётся выходным, а завтра содержит пары понедельника', () => {
  mock.method(Date, 'now', () => Date.parse('2026-11-15T09:00:00+03:00'));
  const snap = studentSnapshot();
  assert.deepEqual(snap.days.map((d) => d.date), ['2026-11-15', '2026-11-16', '2026-11-17']);
  assert.match(ruleAnswer(snap, 'Какие сегодня пары?').text, /^вс, 15 ноября пар нет — воскресенье\./);
  const monday = snap.days.find((d) => d.date === '2026-11-16');
  assert.ok(monday.items.length > 0, 'в примере студента есть пары в понедельник');
  const answer = ruleAnswer(snap, 'Какие завтра пары?');
  assert.match(answer.text, /^Завтра:\n/);
  for (const lesson of monday.items) assert.ok(answer.text.includes(lesson.discipline));
});

test('праздник не подменяется следующим учебным днём', () => {
  mock.method(Date, 'now', () => Date.parse('2026-11-03T09:00:00+03:00'));
  const snap = studentSnapshot();
  assert.match(ruleAnswer(snap, 'Какие завтра пары?').text, /^Завтра пар нет — день народного единства\./);
  assert.match(contextText(snap), /ср, 4 ноября — выходной \(День народного единства\)/);
});

test('известный пустой день и отсутствующие данные дают разные понятные ответы', () => {
  mock.method(Date, 'now', () => Date.parse('2026-11-09T09:00:00+03:00'));
  const snap = studentSnapshot();
  // У группы может не быть занятий в обычный будний день.
  const empty = { ...snap, days: [{ date: snap.now.date, holiday: null, items: [] }], upcoming: null };
  assert.match(ruleAnswer(empty, 'Какие сегодня пары?').text, /^пн, 9 ноября пар нет\.$/);
  // Неполный снимок не является доказательством отсутствия занятий и не должен
  // заставлять ответ выбирать первый имеющийся день вместо запрошенного.
  const missing = { ...snap, days: snap.days.slice(1) };
  const answer = ruleAnswer(missing, 'Какие сегодня пары?');
  assert.match(answer.text, /^На пн, 9 ноября расписание недоступно\./);
  assert.doesNotMatch(answer.text, /пар нет/);
  assert.equal(answer.link.href, '#/schedule');
});
