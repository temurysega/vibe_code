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

export default function (router) {
  router.get('/api/dean/overview', requireDean, (ctx) => {
    applyPlans(ctx.store);
    const f = ctx.staff.faculty_id;
    const counts = Object.fromEntries(ctx.store.all(
      'SELECT r.status, COUNT(*) AS c FROM requests r JOIN students s ON s.id = r.student_id JOIN groups g ON g.code = s.group_code WHERE g.faculty_id = ? GROUP BY r.status', f,
    ).map((x) => [x.status, x.c]));
    const done = ctx.store.all(
      `SELECT r.created_at, MIN(e.created_at) AS done_at FROM requests r JOIN students s ON s.id = r.student_id JOIN groups g ON g.code = s.group_code
       JOIN request_events e ON e.request_id = r.id AND e.status IN ('ready', 'approved', 'rejected') WHERE g.faculty_id = ? GROUP BY r.id`, f,
    );
    const avgHours = done.length ? Math.round((done.reduce((a, x) => a + (x.done_at - x.created_at), 0) / done.length / 36e5) * 10) / 10 : null;
    const overdue = ctx.store.get(
      `SELECT COUNT(*) AS c FROM requests r JOIN students s ON s.id = r.student_id JOIN groups g ON g.code = s.group_code
       WHERE g.faculty_id = ? AND r.status IN ('submitted', 'in_work') AND r.due_at < ?`, f, Date.now(),
    ).c;
    return {
      staff: { name: ctx.staff.full_name, position: ctx.staff.position, faculty: ctx.staff.faculty },
      counts, avgHours, overdue, statusLabels: STATUS,
      groups: ctx.store.all('SELECT code, course, program, profile FROM groups WHERE faculty_id = ? ORDER BY code', f),
    };
  });

  router.get('/api/dean/requests', requireDean, (ctx) => {
    applyPlans(ctx.store);
    const filter = oneOf(ctx.query.get('status') || 'active', ['active', 'done', 'all']);
    if (!filter) fail(400, 'Неизвестный фильтр');
    const where = filter === 'active' ? "AND r.status IN ('submitted', 'in_work', 'ready')" : filter === 'done' ? "AND r.status IN ('issued', 'approved', 'rejected', 'cancelled')" : '';
    const fac = facultyRow(ctx.store, ctx.staff.faculty_id);
    const rows = ctx.store.all(
      `SELECT r.*, s.last_name, s.first_name, s.middle_name, s.group_code FROM requests r JOIN students s ON s.id = r.student_id JOIN groups g ON g.code = s.group_code
       WHERE g.faculty_id = ? ${where} ORDER BY CASE r.status WHEN 'submitted' THEN 0 WHEN 'in_work' THEN 1 WHEN 'ready' THEN 2 ELSE 3 END, r.created_at DESC LIMIT 200`,
      ctx.staff.faculty_id,
    );
    return { requests: rows.map((r) => Object.assign(withStudent(ctx.store, r, fac), { actions: actionsFor(r), overdue: ['submitted', 'in_work'].includes(r.status) && r.due_at < Date.now() })) };
  });

  router.patch('/api/dean/requests/:id', requireDean, (ctx) => {
    const id = int(ctx.params.id, 1, 1e9);
    if (!id) fail(404, 'Заявка не найдена');
    applyPlans(ctx.store);
    const r = scoped(ctx, id);
    const status = str(ctx.body.status, 20);
    if (!actionsFor(r).includes(status)) fail(409, 'Такой переход сейчас недоступен');
    if (RANK[status] < RANK[r.status]) fail(409, 'Статус не может вернуться назад');
    const comment = str(ctx.body.comment, 500);
    if (status === 'rejected' && comment.length < 10) fail(422, 'Объясните причину отказа студенту', { fields: { comment: 'Не короче 10 символов' } });
    const [last, first, middle] = ctx.staff.full_name.split(' ');
    // Сотрудник взял заявку на себя — автоматика демо больше не вмешивается
    ctx.store.run('UPDATE requests SET plan = NULL WHERE id = ?', r.id);
    setStatus(ctx.store, r, status, comment || null, `${last} ${first[0]}. ${middle ? middle[0] + '.' : ''}`.trim());
    audit(ctx.store, ctx.user.id, 'request_' + status, r.number, ctx.ip);
    const fresh = scoped(ctx, id);
    return { request: Object.assign(withStudent(ctx.store, fresh, facultyRow(ctx.store, ctx.staff.faculty_id)), { actions: actionsFor(fresh) }) };
  });

  // Объявление факультету или группе — сразу появляется в уведомлениях студентов
  router.post('/api/dean/announcements', requireDean, (ctx) => {
    const title = str(ctx.body.title, 120);
    const body = str(ctx.body.body, 1000);
    const audience = oneOf(ctx.body.audience, ['faculty', 'group']);
    const errors = {};
    if (title.length < 5) errors.title = 'Не короче 5 символов';
    if (body.length < 10) errors.body = 'Не короче 10 символов';
    if (!audience) errors.audience = 'Выберите адресатов';
    let target = ctx.staff.faculty_id;
    if (audience === 'group') {
      const g = ctx.store.get('SELECT code FROM groups WHERE code = ? AND faculty_id = ?', str(ctx.body.group, 20), ctx.staff.faculty_id);
      if (!g) errors.group = 'Выберите группу своего факультета';
      else target = g.code;
    }
    if (Object.keys(errors).length) fail(422, 'Проверьте поля', { fields: errors });
    const id = notify(ctx.store, { audience, audienceId: target, kind: 'news', title, body, link: '#/notifications', important: ctx.body.important === true, author: `Деканат ${ctx.staff.faculty.short}` });
    audit(ctx.store, ctx.user.id, 'announcement', `${audience}:${target}`, ctx.ip);
    return { id };
  });

