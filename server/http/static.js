// Раздача фронтенда. Путь нормализуется и обязан остаться внутри public/ — обход каталогов невозможен.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fail } from './router.js';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

export async function serveStatic(req, res, pathname, publicDir) {
  if (req.method !== 'GET' && req.method !== 'HEAD') fail(405, 'Метод не поддерживается');
  let rel;
  try { rel = decodeURIComponent(pathname); } catch (e) { fail(400, 'Некорректный адрес'); }
  if (rel.includes('\0') || rel.includes('\\')) fail(400, 'Некорректный адрес');
  if (rel === '/' || rel === '') rel = '/index.html';

  let file = resolve(publicDir, '.' + rel);
  if (!file.startsWith(publicDir + sep)) fail(404, 'Не найдено');
  let info = await stat(file).catch(() => null);
  // Маршруты приложения без расширения отдают index.html
  if ((!info || !info.isFile()) && !extname(rel)) {
    file = resolve(publicDir, 'index.html');
    info = await stat(file).catch(() => null);
  }
  if (!info || !info.isFile()) fail(404, 'Не найдено');

  const type = TYPES[extname(file).toLowerCase()] || 'application/octet-stream';
  const etag = `W/"${info.size.toString(16)}-${Math.round(info.mtimeMs).toString(16)}"`;
  const headers = {
    'Content-Type': type,
    ETag: etag,
    // Браузер хранит копию, но каждый раз сверяет ETag: после обновления стенда старый код не залипает
    'Cache-Control': 'no-cache',
  };
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers);
    res.end();
    return;
  }
  res.writeHead(200, Object.assign(headers, { 'Content-Length': info.size }));
  if (req.method === 'HEAD') { res.end(); return; }
  createReadStream(file).on('error', () => res.destroy()).pipe(res);
}
