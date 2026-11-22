// Демо-кабинет проверяющего: код для второго устройства, новый кабинет с чистыми данными
// и проверка готовности стенда для хостинга.
import { fail } from '../http/router.js';
import { appendCookie, clearSessionCookie, destroySession } from '../security/session.js';
import { requireUser, audit } from '../security/auth.js';
import { sandboxId, demoCookie } from '../demo/sandboxes.js';
import { RELEASE } from '../../public/js/shared/release.js';

export default function (router) {
  // Код кабинета хранится в HttpOnly-cookie; браузеру он нужен, чтобы показать ссылку для второго окна
  router.get('/api/demo', (ctx) => ({ sandboxes: !!ctx.sandboxes, id: ctx.sandbox || null }));

  // «Начать с чистого кабинета» — только из открытого сеанса. Запрос завершает сеанс и выдаёт браузеру
  // заготовку нового кабинета; сама база создаётся при следующем входе, после проверки пароля.
  // Прежний кабинет остаётся доступен по старой ссылке.
  router.post('/api/demo/new', (ctx) => {
    if (!ctx.sandboxes) fail(404, 'Не найдено');
    requireUser(ctx);
    destroySession(ctx.store, ctx.session.id);
    audit(ctx.store, ctx.user.id, 'logout', 'demo_new', ctx.ip);
    appendCookie(ctx.res, demoCookie(sandboxId(), 1));
    appendCookie(ctx.res, clearSessionCookie());
    return { ok: true };
  });

  // Готовность для хостинга: база открыта и наполнена; без данных стенд отвечает 503.
  // Версия выпуска совпадает с подписью в подвале кабинета, маршрутом жюри и PDF
  router.get('/api/health', (ctx) => {
    let users = 0;
    try { users = ctx.store.get('SELECT COUNT(*) AS c FROM users').c; } catch (e) { users = 0; }
    if (!users) fail(503, 'База не готова');
    return { ok: true, version: RELEASE.version, db: 'ok', sandboxes: ctx.sandboxes ? ctx.sandboxes.count() : null };
  });
}
