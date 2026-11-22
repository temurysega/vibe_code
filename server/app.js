// Сборка приложения: заголовки безопасности, CSRF, разбор тела, маршруты API и раздача фронтенда.
import { Router, HttpError, sendJson, fail } from './http/router.js';
import { readJson } from './http/body.js';
import { serveStatic } from './http/static.js';
import { securityHeaders } from './security/headers.js';
import { safeEqual, parseCookies } from './security/session.js';
import { demoCookieName, demoCookie, validSandboxId } from './demo/sandboxes.js';
import { appendCookie } from './security/session.js';
import { loadUser } from './security/auth.js';
import { config } from './config.js';
import auth from './routes/auth.js';
import student from './routes/student.js';
import requests from './routes/requests.js';
import play from './routes/play.js';
import dean from './routes/dean.js';
import assistant from './routes/assistant.js';
import demo from './routes/demo.js';

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

export function clientIp(req) {
  if (config.trustProxy) {
    const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (xff) return xff;
  }
  return req.socket.remoteAddress || '';
}

// Запрос с чужого сайта отсекается: Origin должен совпадать с хостом
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch (e) { return false; }
}

export function createApp(store, hooks = {}) {
  // Демо-кабинеты проверяющих: у каждого своя база (DEMO_SANDBOXES=1 на стенде)
  const sandboxes = hooks.sandboxes || null;
  const router = new Router();
  [auth, student, requests, play, dean, assistant, demo].forEach((register) => register(router));

  return async function handler(req, res) {
    try {
      securityHeaders(res, config.cookieSecure);
      const url = new URL(req.url, 'http://local');
      const fromCookie = sandboxes ? parseCookies(req.headers.cookie)[demoCookieName()] || null : null;
      const sandbox = fromCookie && sandboxes.exists(fromCookie) ? fromCookie : null;
      // Код без готовой базы — заготовка кабинета со страницы входа: база появится после верного пароля
      const reservedSandbox = !sandbox && validSandboxId(fromCookie) ? fromCookie : null;
      if (!url.pathname.startsWith('/api/')) {
        // Ссылка /?demo=<код> открывает тот же демо-кабинет на телефоне или в приватном окне
        if (sandboxes && url.searchParams.has('demo')) {
          const want = url.searchParams.get('demo');
          if (sandboxes.exists(want)) appendCookie(res, demoCookie(want));
          url.searchParams.delete('demo');
          res.writeHead(302, { Location: url.pathname + url.search });
          res.end();
          return;
        }
        await serveStatic(req, res, url.pathname, config.publicDir);
        return;
      }
      res.setHeader('Cache-Control', 'no-store');
      const m = router.match(req.method, url.pathname);
      if (!m) fail(404, 'Не найдено');
      if (m.wrongMethod) fail(405, 'Метод не поддерживается');

      const ctx = { req, res, url, query: url.searchParams, params: m.params, body: {}, store: sandbox ? sandboxes.get(sandbox) : store, sandbox, reservedSandbox, sandboxes, ip: clientIp(req), status: 200 };
      loadUser(ctx);
      // Cookie общая для вкладок. Старый CSRF также связывает чтение с аккаунтом,
      // для которого открыт интерфейс: не возвращаем профиль нового владельца cookie.
      if (ctx.session && req.headers['x-csrf-token'] && !safeEqual(req.headers['x-csrf-token'], ctx.session.csrf)) {
        fail(403, 'Сеанс изменился — обновите страницу', { code: 'SESSION_CHANGED' });
      }
      if (MUTATING.has(req.method)) {
        if (!sameOrigin(req)) fail(403, 'Запрос с чужого сайта отклонён');
        // CSRF: изменяющий запрос должен нести токен своей сессии
        if (ctx.session && !safeEqual(req.headers['x-csrf-token'], ctx.session.csrf)) fail(403, 'Сессия устарела — обновите страницу', { code: 'SESSION_CHANGED' });
        ctx.body = await readJson(req);
      }
      if (ctx.user && hooks.onActivity) hooks.onActivity();

      let out;
      for (const h of m.route.handlers) {
        out = await h(ctx);
        if (out !== undefined || res.writableEnded) break;
      }
      if (!res.writableEnded) sendJson(res, ctx.status || 200, out === undefined ? { ok: true } : out);
    } catch (e) {
      if (e instanceof HttpError) {
        if (e.status === 429 && e.extra && e.extra.retryAfter) res.setHeader('Retry-After', String(e.extra.retryAfter));
        sendJson(res, e.status, Object.assign({ error: e.message }, e.extra || {}));
      } else {
        // Подробности ошибки — только в журнал сервера, клиенту — общее сообщение
        console.error(e);
        if (!res.headersSent) sendJson(res, 500, { error: 'Что-то пошло не так. Попробуйте ещё раз' });
        else res.destroy();
      }
    }
  };
}
