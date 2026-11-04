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

