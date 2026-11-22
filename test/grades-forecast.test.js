// Прогноз по учёбе: без оценок — «нет данных», обычный семестр и семестр с долгом.
// Прогноз допуска отличается от фактического, у дисциплины в риске есть ближайшее действие.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, client } from './helpers.js';
import { gradesFor } from '../server/domain/grades.js';
import { studentOf } from '../server/security/auth.js';

let app;
before(async () => { app = await startApp(); });
after(async () => { await app.close(); });

const gradesOf = (login) => {
  const u = app.store.get('SELECT * FROM users WHERE login = ?', login);
  return gradesFor(app.store, studentOf(app.store, u.student_id));
};

test('обычный семестр: прогноз считается, у дисциплины в риске — ближайшее действие с датой', () => {
  const g = gradesOf('a.morozova');
  const risk = g.current.find((c) => c.status === 'risk');
  assert.ok(risk, 'у Алины есть дисциплина в зоне риска');
  assert.equal(typeof risk.forecast, 'number');
  assert.ok(risk.next && risk.next.title && risk.next.date, 'есть ближайшая контрольная точка с датой');
  assert.equal(g.session.admission, 'forecast', 'допуск — прогноз, а не выставленный факт');
  assert.equal(g.session.admitted, false);
});

test('семестр с долгом: заголовок о долге, прогноз допуска под вопросом', () => {
  const g = gradesOf('k.lebedeva');
  assert.ok(g.debts.length > 0);
  assert.match(g.summary.headline, /долг/);
  assert.equal(g.session.admitted, false);
});

test('без оценок: «Пока нет данных для прогноза» вместо «стабильно»', () => {
  const u = app.store.get("SELECT student_id FROM users WHERE login = 't.aliev'");
  app.store.run('UPDATE assessments SET points = NULL, graded_at = NULL WHERE student_id = ?', u.student_id);
  const g = gradesOf('t.aliev');
  assert.ok(g.current.length > 0);
  for (const c of g.current) {
    assert.equal(c.status, 'nodata');
    assert.equal(c.forecast, null);
    assert.match(c.advice, /^Пока нет данных для прогноза/);
  }
  assert.equal(g.summary.nodata, g.current.length);
  assert.match(g.summary.headline, /оценок пока нет/);
});

test('главная называет причину риска без перехода в оценки: нужно ещё N из M баллов', async () => {
  const s = client(app.base);
  await s.login('a.morozova');
  const home = (await s.req('GET', '/api/home')).data;
  const risk = home.grades.risk[0];
  const full = gradesOf('a.morozova').current.find((c) => c.id === risk.id);
  assert.equal(risk.need, Math.max(0, 60 - full.earned));
  assert.equal(risk.remaining, full.remaining);
  assert.ok(risk.need > 0 && risk.need <= risk.remaining, 'до зачёта ещё можно добрать');
});

