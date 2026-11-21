// Демо-кабинет проверяющего: код для второго устройства, новый кабинет с чистыми данными
// и проверка готовности стенда для хостинга.
import { fail } from '../http/router.js';
import { appendCookie, clearSessionCookie } from '../security/session.js';
import { enterNewSandbox } from '../demo/sandboxes.js';

export default function (router) {
  // Код кабинета хранится в HttpOnly-cookie; браузеру он нужен, чтобы показать ссылку для второго окна
  router.get('/api/demo', (ctx) => ({ sandboxes: !!ctx.sandboxes, id: ctx.sandbox || null }));

  router.post('/api/demo/new', async (ctx) => {
    if (!ctx.sandboxes) fail(404, 'Не найдено');
    await enterNewSandbox(ctx);
    appendCookie(ctx.res, clearSessionCookie());
    return { id: ctx.sandbox };
  });

  // Готовность для хостинга: база открыта и наполнена; без данных стенд отвечает 503
  router.get('/api/health', (ctx) => {
    let users = 0;
    try { users = ctx.store.get('SELECT COUNT(*) AS c FROM users').c; } catch (e) { users = 0; }
    if (!users) fail(503, 'База не готова');
    return { ok: true, db: 'ok', sandboxes: ctx.sandboxes ? ctx.sandboxes.count() : null };
  });
}
