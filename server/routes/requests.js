// Заявки студента. Каждый запрос к конкретной заявке проверяет владельца:
// чужая заявка по прямой ссылке отвечает «не найдено» — даже факт её существования не раскрывается.
import { fail } from '../http/router.js';
import { int, str } from '../http/body.js';
import { requireStudent } from '../security/auth.js';
import { catalogFor, createRequest, setStatus, applyPlans, publicRequest, typeOf } from '../domain/requests.js';
import { semesterOf, msk } from '../domain/time.js';
import * as play from '../domain/play.js';

function own(ctx) {
  const id = int(ctx.params.id, 1, 1e9);
  if (!id) fail(404, 'Заявка не найдена');
  applyPlans(ctx.store, ctx.student.id);
  const r = ctx.store.get('SELECT * FROM requests WHERE id = ? AND student_id = ?', id, ctx.student.id);
  if (!r) fail(404, 'Заявка не найдена');
  return r;
}

export default function (router) {
  router.get('/api/requests/types', requireStudent, (ctx) => ({ types: catalogFor(ctx.store, ctx.student) }));

  router.get('/api/requests', requireStudent, (ctx) => {
    applyPlans(ctx.store, ctx.student.id);
    const rows = ctx.store.all('SELECT * FROM requests WHERE student_id = ? ORDER BY created_at DESC', ctx.student.id);
    return { requests: rows.map((r) => publicRequest(ctx.store, r, ctx.student.faculty)) };
  });

  router.post('/api/requests', requireStudent, (ctx) => {
    const id = createRequest(ctx.store, ctx.student, ctx.student.faculty, ctx.body);
    const s = play.load(ctx.store, ctx.student.id);
    s.pet.growth += 1;
    play.save(ctx.store, ctx.student.id, s);
    const r = ctx.store.get('SELECT * FROM requests WHERE id = ?', id);
    ctx.status = 201;
    return { request: publicRequest(ctx.store, r, ctx.student.faculty) };
  });

  router.get('/api/requests/:id', requireStudent, (ctx) => ({ request: publicRequest(ctx.store, own(ctx), ctx.student.faculty) }));

  router.post('/api/requests/:id/cancel', requireStudent, (ctx) => {
    const r = own(ctx);
    if (r.status !== 'submitted') fail(409, 'Заявку уже взяли в работу — отменить можно через деканат');
    setStatus(ctx.store, r, 'cancelled', str(ctx.body.reason, 200) || 'Отменена студентом', 'Вы');
    ctx.store.run('UPDATE requests SET plan = NULL WHERE id = ?', r.id);
    return { request: publicRequest(ctx.store, ctx.store.get('SELECT * FROM requests WHERE id = ?', r.id), ctx.student.faculty) };
  });

