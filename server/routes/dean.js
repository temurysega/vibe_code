// Кабинет деканата: очередь заявок факультета, решения, объявления и изменения расписания.
// Сотрудник видит только студентов своего факультета — проверка в каждом запросе.
import { fail } from '../http/router.js';
import { str, int, oneOf, isDate } from '../http/body.js';
import { requireDean, audit } from '../security/auth.js';
import { RateLimiter } from '../security/rateLimit.js';
import { applyPlans, publicRequest, setStatus, typeOf, RANK, STATUS } from '../domain/requests.js';
import { notify } from '../domain/notifications.js';
import { dayOf } from '../domain/schedule.js';
import { msk, DAY } from '../domain/time.js';

const facultyRow = (store, id) => store.get('SELECT * FROM faculties WHERE id = ?', id);

// Объявления и изменения расписания видят все студенты факультета. Демо-аккаунт деканата
// открыт жюри, поэтому массовые публикации ограничены: 10 за 10 минут на сотрудника.
export const broadcasts = new RateLimiter({ windowMs: 10 * 60e3, max: 10 });
function limitBroadcast(ctx) {
  const key = 'dean|' + ctx.user.id;
  const c = broadcasts.check(key);
  if (!c.ok) fail(429, `Слишком много публикаций подряд. Попробуйте через ${Math.max(1, Math.ceil(c.retryAfter / 60))} мин.`, { retryAfter: c.retryAfter });
  return () => broadcasts.hit(key);
}

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
    // Готовая электронная справка уже у студента — она в «Завершённых»; бумажная ждёт выдачи
    let where = filter === 'active' ? "AND (r.status IN ('submitted', 'in_work') OR (r.status = 'ready' AND r.delivery = 'paper'))"
      : filter === 'done' ? "AND (r.status IN ('issued', 'approved', 'rejected', 'cancelled') OR (r.status = 'ready' AND r.delivery != 'paper'))" : '';
    const args = [ctx.staff.faculty_id];
    // Поиск по номеру: «2026/01212» или последние цифры «1212»; ищем во всех статусах
    const q = str(ctx.query.get('q'), 20).replace(/\s/g, '');
    if (q) {
      const m = /^(?:(\d{4})\/)?(\d{1,5})$/.exec(q);
      if (!m) fail(400, 'Введите номер заявки, например 2026/01212');
      where = m[1] ? 'AND r.number = ?' : 'AND substr(r.number, 6) = ?';
      args.push(m[1] ? `${m[1]}/${m[2].padStart(5, '0')}` : m[2].padStart(5, '0'));
    }
    const fac = facultyRow(ctx.store, ctx.staff.faculty_id);
    const rows = ctx.store.all(
      `SELECT r.*, s.last_name, s.first_name, s.middle_name, s.group_code FROM requests r JOIN students s ON s.id = r.student_id JOIN groups g ON g.code = s.group_code
       WHERE g.faculty_id = ? ${where} ORDER BY CASE r.status WHEN 'submitted' THEN 0 WHEN 'in_work' THEN 1 WHEN 'ready' THEN 2 ELSE 3 END, r.created_at DESC LIMIT 200`,
      ...args,
    );
    return { requests: rows.map((r) => Object.assign(withStudent(ctx.store, r, fac), { actions: actionsFor(r), overdue: ['submitted', 'in_work'].includes(r.status) && r.due_at < Date.now() })) };
  });

  // Прямая ссылка на заявку для сотрудника: только своего факультета
  router.get('/api/dean/requests/:id', requireDean, (ctx) => {
    const id = int(ctx.params.id, 1, 1e9);
    if (!id) fail(404, 'Заявка не найдена');
    applyPlans(ctx.store);
    const r = scoped(ctx, id);
    return { request: Object.assign(withStudent(ctx.store, r, facultyRow(ctx.store, ctx.staff.faculty_id)), { actions: actionsFor(r), overdue: ['submitted', 'in_work'].includes(r.status) && r.due_at < Date.now() }) };
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
    const counted = limitBroadcast(ctx);
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
    counted();
    audit(ctx.store, ctx.user.id, 'announcement', `${audience}:${target}`, ctx.ip);
    return { id };
  });

  // Пары группы на дату — чтобы отметить отмену или новую аудиторию
  router.get('/api/dean/day', requireDean, (ctx) => {
    const g = ctx.store.get('SELECT code FROM groups WHERE code = ? AND faculty_id = ?', str(ctx.query.get('group'), 20), ctx.staff.faculty_id);
    if (!g) fail(404, 'Группа не найдена');
    const date = ctx.query.get('date');
    if (!isDate(date)) fail(400, 'Укажите дату');
    return { day: dayOf(ctx.store, g.code, date) };
  });

  router.post('/api/dean/changes', requireDean, (ctx) => {
    const counted = limitBroadcast(ctx);
    const g = ctx.store.get('SELECT code FROM groups WHERE code = ? AND faculty_id = ?', str(ctx.body.group, 20), ctx.staff.faculty_id);
    if (!g) fail(404, 'Группа не найдена');
    const date = ctx.body.date;
    const type = oneOf(ctx.body.type, ['cancel', 'room']);
    const reason = str(ctx.body.reason, 300);
    const room = str(ctx.body.room, 20);
    if (!isDate(date) || date < msk().date) fail(422, 'Укажите сегодняшнюю или будущую дату', { fields: { date: 'Дата в прошлом' } });
    if (!type) fail(422, 'Выберите тип изменения');
    if (type === 'room' && !/^\d{4}$/.test(room)) fail(422, 'Номер аудитории — четыре цифры', { fields: { room: 'Например, 2014' } });
    if (reason.length < 5) fail(422, 'Укажите причину', { fields: { reason: 'Не короче 5 символов' } });
    const day = dayOf(ctx.store, g.code, date);
    const it = day.items.find((x) => x.lessonId === int(ctx.body.lesson, 1, 1e9) && x.pair === int(ctx.body.pair, 1, 7) && x.status === 'normal');
    if (!it) fail(404, 'Пара не найдена или уже изменена');
    ctx.store.run(
      `INSERT INTO schedule_changes (group_code, date, pair, type, lesson_id, room, reason, author, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      g.code, date, it.pair, type, it.lessonId, type === 'room' ? room : null, reason, `Деканат ${ctx.staff.faculty.short}`, Date.now(),
    );
    const d = new Date(date + 'T12:00:00Z').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short', timeZone: 'UTC' });
    notify(ctx.store, {
      audience: 'group', audienceId: g.code, kind: 'schedule', important: type === 'cancel' ? 1 : 0, link: `#/schedule/${date}/${it.pair}`, author: `Деканат ${ctx.staff.faculty.short}`,
      title: type === 'cancel' ? `${it.short}, ${d}: пара отменена` : `${it.short}, ${d}: аудитория ${room} вместо ${it.room}`, body: reason,
    });
    counted();
    audit(ctx.store, ctx.user.id, 'schedule_' + type, `${g.code}:${date}:${it.pair}`, ctx.ip);
    return { ok: true };
  });

  router.get('/api/dean/audit', requireDean, (ctx) => ({
    log: ctx.store.all("SELECT action, target, created_at FROM audit_log WHERE user_id = ? AND created_at > ? ORDER BY created_at DESC LIMIT 30", ctx.user.id, Date.now() - 7 * DAY),
  }));
}
