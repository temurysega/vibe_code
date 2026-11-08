// Данные студента: профиль, главная, расписание, успеваемость и уведомления.
// Каждый маршрут берёт студента из сессии — подставить чужой id в адрес невозможно.
import { fail } from '../http/router.js';
import { requireStudent } from '../security/auth.js';
import { buildWeek, upcoming, dayOf, icsFor } from '../domain/schedule.js';
import { gradesFor } from '../domain/grades.js';
import { listFor, unreadCount, markRead, remindDeadlines } from '../domain/notifications.js';
import { applyPlans, publicRequest } from '../domain/requests.js';
import * as play from '../domain/play.js';
import { msk, addDays, weekMonday, mondayOf, parityOf, holidayOf, BELLS, semesterOf, DAY } from '../domain/time.js';

export function profileOf(s) {
  return {
    lastName: s.last_name, firstName: s.first_name, middleName: s.middle_name, gender: s.gender,
    group: s.group_code, course: s.course, semester: s.semester, faculty: s.faculty,
    program: s.program, profile: s.profile, curator: s.curator,
    recordBook: s.record_book, email: s.email, phone: s.phone,
    studyForm: s.study_form, funding: s.funding, languages: JSON.parse(s.languages || '[]'), admissionYear: s.admission_year,
  };
}

// Сессия без троек и долгов открывает знаки «за учёбу»
export function playCtx(store, s) {
  const last = store.get("SELECT MAX(semester) AS m FROM enrollments WHERE student_id = ? AND status != 'current'", s.id).m;
  const rows = last ? store.all('SELECT e.final_points, e.status, d.control FROM enrollments e JOIN disciplines d ON d.id = e.discipline_id WHERE e.student_id = ? AND e.semester = ?', s.id, last) : [];
  const debts = store.get("SELECT COUNT(*) AS c FROM enrollments WHERE student_id = ? AND status = 'debt'", s.id).c;
  const excellent = !!rows.length && !debts && rows.every((r) => (r.control === 'credit' ? r.final_points >= 60 : r.final_points >= 75));
  const hasRequest = !!store.get("SELECT 1 AS x FROM requests WHERE student_id = ? AND type != 'merch' LIMIT 1", s.id);
  return { excellent, hasRequest, newcomer: s.semester === 1 };
}

function deadlinesOf(store, s, days = 14) {
  const now = Date.now();
  return store.all(
    `SELECT dl.id, dl.title, dl.due_at, dl.kind, dl.link, d.name AS discipline, d.color FROM deadlines dl LEFT JOIN disciplines d ON d.id = dl.discipline_id
     WHERE (dl.student_id = ? OR (dl.student_id IS NULL AND dl.group_code = ?)) AND dl.due_at > ? AND dl.due_at < ? ORDER BY dl.due_at`,
    s.id, s.group_code, now - 3600e3, now + days * DAY,
  ).map((d) => ({ id: d.id, title: d.title, dueAt: d.due_at, kind: d.kind, link: d.link, discipline: d.discipline, color: d.color, overdue: d.due_at < now }));
}

export default function (router) {
  router.get('/api/me', requireStudent, (ctx) => ({ profile: profileOf(ctx.student) }));

  // Главная собирается одним запросом — на мобильном интернете это заметно быстрее
  router.get('/api/home', requireStudent, (ctx) => {
    const { store, student: s, user } = ctx;
    applyPlans(store, s.id);
    remindDeadlines(store, s, s.faculty);
    const now = msk();
    const week = buildWeek(store, s.group_code, now.date);
    const today = week.days.find((d) => d.date === now.date) || dayOf(store, s.group_code, now.date);
    const tomorrowDate = addDays(now.date, 1);
    const tomorrow = week.days.find((d) => d.date === tomorrowDate) || dayOf(store, s.group_code, tomorrowDate);
    const changes = [...week.changes, ...buildWeek(store, s.group_code, addDays(now.date, 7)).changes].filter((c) => c.date >= now.date || (c.change.to && c.change.to.date >= now.date)).slice(0, 6);
    const grades = gradesFor(store, s);
    const requests = store.all("SELECT * FROM requests WHERE student_id = ? AND (status NOT IN ('issued', 'approved', 'rejected', 'cancelled') OR updated_at > ?) ORDER BY updated_at DESC LIMIT 4", s.id, Date.now() - 3 * DAY)
      .map((r) => publicRequest(store, r, s.faculty));
    const st = play.load(store, s.id);
    return {
      now, parity: parityOf(now.date), holiday: holidayOf(now.date),
      next: upcoming(store, s.group_code, now), today, tomorrow, changes,
      deadlines: deadlinesOf(store, s),
      requests,
      notifications: { unread: unreadCount(store, user.id, s), latest: listFor(store, user.id, s, 5) },
      grades: { summary: grades.summary, risk: grades.current.filter((c) => c.status === 'risk').map((c) => ({ id: c.id, name: c.name, earned: c.earned, forecast: c.forecast, advice: c.advice })), session: grades.session, semesterLabel: grades.semesterLabel },
      play: play.view(store, s.id, st, playCtx(store, s)),
    };
  });

  router.get('/api/schedule', requireStudent, (ctx) => {
    const q = ctx.query.get('week');
    let monday = q ? weekMonday(q) : mondayOf(msk().date);
    if (!monday) fail(400, 'Неделя указана неверно');
    // Не дальше семестра в обе стороны: на год вперёд расписания нет
    const sem = semesterOf(msk().date);
    if (monday < addDays(sem.start, -14) || monday > addDays(sem.sessionEnd, 7)) monday = mondayOf(msk().date);
    const week = buildWeek(ctx.store, ctx.student.group_code, monday);
    return Object.assign(week, { now: msk(), bells: BELLS.slice(1), semester: sem, prev: addDays(monday, -7), next: addDays(monday, 7) });
  });

  // Подписка на календарь: файл с парами на 4 недели
  router.get('/api/schedule.ics', requireStudent, (ctx) => {
    const body = icsFor(ctx.store, ctx.student.group_code, ctx.student.group_code);
    ctx.res.writeHead(200, {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="schedule-${encodeURIComponent(ctx.student.group_code)}.ics"`,
      'Cache-Control': 'no-store',
    });
    ctx.res.end(body);
  });

  router.get('/api/grades', requireStudent, (ctx) => gradesFor(ctx.store, ctx.student));

  router.get('/api/deadlines', requireStudent, (ctx) => ({ deadlines: deadlinesOf(ctx.store, ctx.student, 45) }));

  router.get('/api/notifications', requireStudent, (ctx) => {
    const { store, student: s, user } = ctx;
    applyPlans(store, s.id);
    remindDeadlines(store, s, s.faculty);
    return { list: listFor(store, user.id, s, 100), unread: unreadCount(store, user.id, s) };
  });

  // Лёгкий опрос для колокольчика: число непрочитанных и самое свежее уведомление
  router.get('/api/notifications/count', requireStudent, (ctx) => {
    const { store, student: s, user } = ctx;
    applyPlans(store, s.id);
    remindDeadlines(store, s, s.faculty);
    return { unread: unreadCount(store, user.id, s), latest: listFor(store, user.id, s, 1)[0] || null };
  });

  router.post('/api/notifications/read', requireStudent, (ctx) => {
    const ids = ctx.body.all === true ? 'all' : ctx.body.ids;
    const n = markRead(ctx.store, ctx.user.id, ctx.student, ids);
    return { marked: n, unread: unreadCount(ctx.store, ctx.user.id, ctx.student) };
  });

  router.patch('/api/me/prefs', requireStudent, (ctx) => {
    const s = play.load(ctx.store, ctx.student.id);
    play.setPrefs(s, ctx.body);
    play.save(ctx.store, ctx.student.id, s);
    return { prefs: s.prefs };
  });
}
