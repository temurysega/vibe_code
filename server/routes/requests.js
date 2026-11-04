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

