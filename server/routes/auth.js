// Вход, выход, смена пароля и управление сеансами.
import { fail } from '../http/router.js';
import { str } from '../http/body.js';
import { verifyPassword, dummyVerify, hashPassword, passwordProblems } from '../security/password.js';
import { createSession, destroySession, sessionCookie, clearSessionCookie, deviceName, maskIp } from '../security/session.js';
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

export default function (router) {
  router.post('/api/auth/login', async (ctx) => {
    const login = str(ctx.body.login, 64).toLowerCase();
    const password = typeof ctx.body.password === 'string' ? ctx.body.password.slice(0, 200) : '';
    if (!login || !password) fail(400, 'Введите логин и пароль');
    const keyA = `${ctx.ip}|${login}`;
    limited(ctx, [[perAccount, keyA], [perIp, ctx.ip]]);
    const user = ctx.store.get('SELECT * FROM users WHERE login = ?', login);
    const ok = user ? await verifyPassword(password, user.password_hash) : await dummyVerify(password);
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
    ctx.res.setHeader('Set-Cookie', sessionCookie(token));
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
    ctx.res.setHeader('Set-Cookie', clearSessionCookie());
    return { ok: true };
  });

