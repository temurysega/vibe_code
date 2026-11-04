// Кто делает запрос: сессия из cookie → пользователь → студент или сотрудник деканата.
// Идентификатор студента берётся только из сессии, никогда — из адреса или тела запроса.
import { fail } from '../http/router.js';
import { parseCookies, cookieName, loadSession } from './session.js';
import { msk, semesterNumber } from '../domain/time.js';

export function loadUser(ctx) {
  const token = parseCookies(ctx.req.headers.cookie)[cookieName()];
  const session = loadSession(ctx.store, token);
  if (!session) return;
  const user = ctx.store.get('SELECT id, login, role, student_id, staff_id, created_at, last_login_at, password_changed_at FROM users WHERE id = ?', session.user_id);
  if (!user) return;
  ctx.session = session;
  ctx.user = user;
}

export function studentOf(store, id) {
  const s = store.get(
    `SELECT s.*, g.faculty_id, g.program, g.profile, g.curator, f.short AS f_short, f.name AS f_name, f.dean_office, f.hours AS f_hours, f.phone AS f_phone, f.email AS f_email
     FROM students s JOIN groups g ON g.code = s.group_code JOIN faculties f ON f.id = g.faculty_id WHERE s.id = ?`, id,
  );
  if (!s) return null;
  s.semester = semesterNumber(s.admission_year, msk().date);
  s.course = Math.max(1, Math.ceil(s.semester / 2));
  s.faculty = { id: s.faculty_id, short: s.f_short, name: s.f_name, dean_office: s.dean_office, hours: s.f_hours, phone: s.f_phone, email: s.f_email };
  return s;
}

export function staffOf(store, id) {
  const s = store.get('SELECT st.*, f.short AS f_short, f.name AS f_name FROM staff st JOIN faculties f ON f.id = st.faculty_id WHERE st.id = ?', id);
  if (s) s.faculty = { id: s.faculty_id, short: s.f_short, name: s.f_name };
  return s;
}

export const requireUser = (ctx) => { if (!ctx.user) fail(401, 'Войдите в кабинет'); };

export function requireStudent(ctx) {
  requireUser(ctx);
  if (ctx.user.role !== 'student') fail(403, 'Раздел доступен только студентам');
  ctx.student = studentOf(ctx.store, ctx.user.student_id);
  if (!ctx.student) fail(403, 'Профиль студента не найден');
}

export function requireDean(ctx) {
  requireUser(ctx);
  if (ctx.user.role !== 'dean') fail(403, 'Раздел доступен только сотрудникам деканата');
  ctx.staff = staffOf(ctx.store, ctx.user.staff_id);
  if (!ctx.staff) fail(403, 'Профиль сотрудника не найден');
}

