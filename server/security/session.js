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

export function loadSession(store, token) {
  if (!token || token.length > 128) return null;
  const s = store.get('SELECT * FROM sessions WHERE id = ?', sha256(token));
  if (!s) return null;
  const now = Date.now();
  if (s.expires_at < now || now - s.last_seen > config.sessionIdleHours * HOUR) {
    store.run('DELETE FROM sessions WHERE id = ?', s.id);
    return null;
  }
  if (now - s.last_seen > 60e3) store.run('UPDATE sessions SET last_seen = ? WHERE id = ?', now, s.id);
  return s;
}

export function destroySession(store, sessionId) {
  store.run('DELETE FROM sessions WHERE id = ?', sessionId);
}

// Описание устройства для списка «Активные сеансы» — без полного User-Agent
export function deviceName(ua) {
  ua = String(ua || '');
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Устройство';
  const br = /Edg\//.test(ua) ? 'Edge' : /YaBrowser/.test(ua) ? 'Яндекс Браузер' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /node|curl/i.test(ua) ? 'API-клиент' : 'браузер';
  return `${br} · ${os}`;
}

// IP скрывается наполовину: в кабинете видно, откуда вход, но адрес целиком не раскрывается
export function maskIp(ip) {
  ip = String(ip || '').replace(/^::ffff:/, '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return ip.split('.').slice(0, 2).join('.') + '.*.*';
  if (ip.includes(':')) return ip.split(':').slice(0, 2).join(':') + ':…';
  return ip || '—';
}
