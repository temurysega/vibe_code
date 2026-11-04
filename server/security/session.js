// Сессии на сервере: случайный токен в httpOnly-cookie, в базе — только его SHA-256.
// К каждой сессии привязан CSRF-токен для изменяющих запросов.
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

const HOUR = 36e5;
const MAX_SESSIONS = 10;

export const sha256 = (s) => createHash('sha256').update(String(s)).digest('hex');

export function safeEqual(a, b) {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b ?? ''));
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

// Префикс __Host- запрещает подмену cookie с поддоменов, но требует HTTPS
export const cookieName = () => (config.cookieSecure ? '__Host-mm_sid' : 'mm_sid');

export function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i < 0) return;
    const k = part.slice(0, i).trim();
    if (k && !(k in out)) out[k] = part.slice(i + 1).trim();
  });
  return out;
}

export function sessionCookie(token) {
  const maxAge = Math.round(config.sessionTtlHours * 3600);
  return `${cookieName()}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${config.cookieSecure ? '; Secure' : ''}`;
}

export function clearSessionCookie() {
  return `${cookieName()}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${config.cookieSecure ? '; Secure' : ''}`;
}

export function createSession(store, userId, meta) {
  const token = randomBytes(32).toString('base64url');
  const csrf = randomBytes(24).toString('base64url');
  const now = Date.now();
  store.run(
    'INSERT INTO sessions (id, user_id, csrf, created_at, last_seen, expires_at, ip, ua) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    sha256(token), userId, csrf, now, now, now + config.sessionTtlHours * HOUR, meta.ip || null, String(meta.ua || '').slice(0, 200),
  );
  // Старые сессии сверх лимита закрываются сами
  store.run(
    'DELETE FROM sessions WHERE user_id = ? AND id NOT IN (SELECT id FROM sessions WHERE user_id = ? ORDER BY last_seen DESC LIMIT ?)',
    userId, userId, MAX_SESSIONS,
  );
  return { token, csrf };
}

