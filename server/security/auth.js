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

