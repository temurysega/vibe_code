// Вход, выход, смена пароля и управление сеансами.
import { fail } from '../http/router.js';
import { str } from '../http/body.js';
import { verifyPassword, dummyVerify, hashPassword, passwordProblems } from '../security/password.js';
import { createSession, destroySession, sessionCookie, clearSessionCookie, appendCookie, deviceName, maskIp } from '../security/session.js';
import { RateLimiter } from '../security/rateLimit.js';
import { requireUser, publicUser, audit } from '../security/auth.js';

// Пять неудачных попыток на логин и тридцать на адрес за 15 минут
export const perAccount = new RateLimiter({ windowMs: 15 * 60e3, max: 5 });
export const perIp = new RateLimiter({ windowMs: 15 * 60e3, max: 30 });

function limited(ctx, keys) {
  for (const [lim, key] of keys) {
    const c = lim.check(key);
    if (!c.ok) fail(429, `Слишком много попыток. Попробуйте через ${Math.max(1, Math.ceil(c.retryAfter / 60))} мин.`, { retryAfter: c.retryAfter });
  }
}

// Общий демо-стенд без отдельных кабинетов: один аккаунт открывают разные проверяющие.
// Их сеансы не показываются и не закрываются друг у друга; в своём демо-кабинете видны все свои устройства.
const sharedDemo = (ctx) => process.env.DEMO_MODE !== '0' && !ctx.sandbox;

export default function (router) {
  router.post('/api/auth/login', async (ctx) => {
    const login = str(ctx.body.login, 64).toLowerCase();
    const password = typeof ctx.body.password === 'string' ? ctx.body.password.slice(0, 200) : '';
    if (!login || !password) fail(400, 'Введите логин и пароль');
    const keyA = `${ctx.ip}|${login}`;
    limited(ctx, [[perAccount, keyA], [perIp, ctx.ip]]);
    const user = ctx.store.get('SELECT * FROM users WHERE login = ?', login);
    const releaseAccount = perAccount.reserve(keyA);
    const releaseIp = perIp.reserve(ctx.ip);
    let ok;
    try {
      ok = user ? await verifyPassword(password, user.password_hash) : await dummyVerify(password);
    } finally {
      releaseAccount();
      releaseIp();
    }
    if (!ok) {
      perAccount.hit(keyA);
      perIp.hit(ctx.ip);
      audit(ctx.store, user && user.id, 'login_failed', login, ctx.ip);
      const left = perAccount.check(keyA);
      fail(401, left.ok && left.left <= 2 ? `Неверный логин или пароль. Осталось попыток: ${left.left}` : 'Неверный логин или пароль');
    }
    perAccount.reset(keyA);
    const { token, csrf } = createSession(ctx.store, user.id, { ip: ctx.ip, ua: ctx.req.headers['user-agent'] });
    const prev = user.last_login_at;
    ctx.store.run('UPDATE users SET last_login_at = ? WHERE id = ?', Date.now(), user.id);
    audit(ctx.store, user.id, 'login', null, ctx.ip);
    appendCookie(ctx.res, sessionCookie(token));
    return { user: Object.assign(publicUser(ctx.store, user), { lastLogin: prev }), csrf };
  });

  router.get('/api/auth/session', (ctx) => {
    requireUser(ctx);
    return { user: publicUser(ctx.store, ctx.user), csrf: ctx.session.csrf };
  });

  router.post('/api/auth/logout', (ctx) => {
    if (ctx.session) {
      destroySession(ctx.store, ctx.session.id);
      audit(ctx.store, ctx.user.id, 'logout', null, ctx.ip);
    }
    appendCookie(ctx.res, clearSessionCookie());
    return { ok: true };
  });

  // Активные сеансы: видно, откуда входили, и можно закрыть чужой компьютер
  router.get('/api/auth/sessions', (ctx) => {
    requireUser(ctx);
    const all = ctx.store.all('SELECT id, created_at, last_seen, ip, ua FROM sessions WHERE user_id = ? ORDER BY last_seen DESC', ctx.user.id);
    const shared = sharedDemo(ctx);
    const rows = shared ? all.filter((s) => s.id === ctx.session.id) : all;
    return {
      shared, hidden: all.length - rows.length,
      sessions: rows.map((s) => ({ id: s.id.slice(0, 16), current: s.id === ctx.session.id, device: deviceName(s.ua), ip: maskIp(s.ip), createdAt: s.created_at, lastSeen: s.last_seen })),
      lastLogin: ctx.user.last_login_at,
      passwordChanged: ctx.user.password_changed_at,
    };
  });

  router.delete('/api/auth/sessions/:id', (ctx) => {
    requireUser(ctx);
    if (sharedDemo(ctx)) fail(403, 'В общем демо нельзя закрывать сеансы других проверяющих');
    const prefix = String(ctx.params.id);
    if (!/^[0-9a-f]{16}$/.test(prefix)) fail(400, 'Некорректный сеанс');
    // Закрыть можно только свой сеанс: условие по user_id не даёт тронуть чужие
    const s = ctx.store.get('SELECT id FROM sessions WHERE user_id = ? AND substr(id, 1, 16) = ?', ctx.user.id, prefix);
    if (!s) fail(404, 'Сеанс не найден');
    if (s.id === ctx.session.id) fail(400, 'Чтобы закрыть текущий сеанс, нажмите «Выйти»');
    destroySession(ctx.store, s.id);
    audit(ctx.store, ctx.user.id, 'session_revoked', prefix, ctx.ip);
    return { ok: true };
  });

  router.post('/api/auth/sessions/revoke-others', (ctx) => {
    requireUser(ctx);
    if (sharedDemo(ctx)) fail(403, 'В общем демо нельзя закрывать сеансы других проверяющих');
    const r = ctx.store.run('DELETE FROM sessions WHERE user_id = ? AND id != ?', ctx.user.id, ctx.session.id);
    audit(ctx.store, ctx.user.id, 'sessions_revoked', String(r.changes), ctx.ip);
    return { closed: Number(r.changes) };
  });

  router.post('/api/auth/password', async (ctx) => {
    requireUser(ctx);
    const current = typeof ctx.body.current === 'string' ? ctx.body.current.slice(0, 200) : '';
    const next = typeof ctx.body.next === 'string' ? ctx.body.next : '';
    const key = `pw|${ctx.sandbox || ''}|${ctx.user.id}`;
    limited(ctx, [[perAccount, key]]);
    const row = ctx.store.get('SELECT password_hash FROM users WHERE id = ?', ctx.user.id);
    const release = perAccount.reserve(key);
    let valid;
    try { valid = await verifyPassword(current, row.password_hash); } finally { release(); }
    if (!valid) { perAccount.hit(key); fail(400, 'Текущий пароль указан неверно', { fields: { current: 'Неверный пароль' } }); }
    const problems = passwordProblems(next, ctx.user.login);
    if (problems.length) fail(422, 'Пароль слишком простой', { fields: { next: 'Нужно: ' + problems.join(', ') } });
    if (await verifyPassword(next, row.password_hash)) fail(422, 'Новый пароль совпадает со старым', { fields: { next: 'Придумайте другой пароль' } });
    // Демо-стенд общий для всего жюри: новый пароль проверяется, но не сохраняется
    if (process.env.DEMO_MODE !== '0') {
      perAccount.reset(key);
      audit(ctx.store, ctx.user.id, 'password_change_demo', null, ctx.ip);
      return { ok: true, demo: true };
    }
    ctx.store.run('UPDATE users SET password_hash = ?, password_changed_at = ? WHERE id = ?', await hashPassword(next), Date.now(), ctx.user.id);
    // После смены пароля все остальные сеансы закрываются
    ctx.store.run('DELETE FROM sessions WHERE user_id = ? AND id != ?', ctx.user.id, ctx.session.id);
    perAccount.reset(key);
    audit(ctx.store, ctx.user.id, 'password_changed', null, ctx.ip);
    return { ok: true };
  });
}
