// Кабинет деканата: очередь заявок факультета, решения, объявления и изменения расписания.
// Сотрудник видит только студентов своего факультета — проверка в каждом запросе.
import { fail } from '../http/router.js';
import { str, int, oneOf, isDate } from '../http/body.js';
import { requireDean, audit } from '../security/auth.js';
import { applyPlans, publicRequest, setStatus, typeOf, RANK, STATUS } from '../domain/requests.js';
import { notify } from '../domain/notifications.js';
import { dayOf } from '../domain/schedule.js';
import { msk, DAY } from '../domain/time.js';

const facultyRow = (store, id) => store.get('SELECT * FROM faculties WHERE id = ?', id);

function scoped(ctx, id) {
  const r = ctx.store.get(
    `SELECT r.*, s.last_name, s.first_name, s.middle_name, s.group_code, g.faculty_id FROM requests r
     JOIN students s ON s.id = r.student_id JOIN groups g ON g.code = s.group_code WHERE r.id = ? AND g.faculty_id = ?`,
    id, ctx.staff.faculty_id,
  );
  if (!r) fail(404, 'Заявка не найдена');
  return r;
}

const withStudent = (store, r, fac) => Object.assign(publicRequest(store, r, fac), {
  student: { name: `${r.last_name} ${r.first_name} ${r.middle_name || ''}`.trim(), group: r.group_code },
});

// Какие решения доступны на текущем шаге
function actionsFor(r) {
  const t = typeOf(r.type);
  const group = t ? t.group : 'app';
  const out = [];
  if (r.status === 'submitted') out.push('in_work', 'rejected');
  if (r.status === 'in_work') out.push(...(group === 'cert' ? ['ready'] : ['approved']), 'rejected');
  if (r.status === 'ready' && r.delivery === 'paper') out.push('issued');
  return out;
}

