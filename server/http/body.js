// Тело запроса: только JSON и не больше 64 КБ — большие и битые запросы отсекаются сразу.
import { fail } from './router.js';

const LIMIT = 64 * 1024;

export function readJson(req) {
  return new Promise((resolve, reject) => {
    const type = String(req.headers['content-type'] || '');
    const len = Number(req.headers['content-length'] || 0);
    if (len > LIMIT) { req.resume(); reject(Object.assign(new Error('too large'), { tooLarge: true })); return; }
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > LIMIT) { req.destroy(); return; }
      chunks.push(c);
    });
    req.on('error', reject);
    req.on('close', () => { if (size > LIMIT) reject(Object.assign(new Error('too large'), { tooLarge: true })); });
    req.on('end', () => {
      if (!chunks.length) { resolve({}); return; }
      if (!type.includes('application/json')) { reject(Object.assign(new Error('type'), { badType: true })); return; }
      try {
        const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve(data && typeof data === 'object' && !Array.isArray(data) ? data : {});
      } catch (e) {
        reject(Object.assign(new Error('json'), { badJson: true }));
      }
    });
  }).catch((e) => {
    if (e.badType) fail(415, 'Ожидается JSON');
    if (e.badJson) fail(400, 'Некорректный JSON');
    fail(413, 'Слишком большой запрос');
  });
}

// Проверка входных данных: строки обрезаются и ограничиваются по длине
export function str(v, max = 500) {
  return typeof v === 'string' ? v.replace(/\u0000/g, '').trim().slice(0, max) : '';
}

export function int(v, min, max) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

export const oneOf = (v, list) => (list.includes(v) ? v : null);

export function isDate(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const time = Date.parse(v + 'T00:00:00Z');
  // Date.parse нормализует 31 февраля в март: форма должна отклонить такую дату.
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === v;
}
