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

