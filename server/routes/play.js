// Игровой слой: образ, питомец, прогулка по кампусу, Лавка и забег.
import { fail } from '../http/router.js';
import { str } from '../http/body.js';
import { requireStudent } from '../security/auth.js';
import { insertRequest, typeOf } from '../domain/requests.js';
import * as play from '../domain/play.js';
import { playCtx } from './student.js';

// Обёртка: загрузить состояние, выполнить действие, сохранить и вернуть свежий вид
function act(fn) {
  return (ctx) => {
    const s = play.load(ctx.store, ctx.student.id);
    const pc = playCtx(ctx.store, ctx.student);
    const result = fn(ctx, s, pc);
    play.save(ctx.store, ctx.student.id, s);
    return { result: result || null, play: play.view(ctx.store, ctx.student.id, s, playCtx(ctx.store, ctx.student)) };
  };
}

