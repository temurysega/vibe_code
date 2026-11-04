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

