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

export default function (router) {
  router.get('/api/play', requireStudent, (ctx) => {
    const s = play.load(ctx.store, ctx.student.id);
    return { play: play.view(ctx.store, ctx.student.id, s, playCtx(ctx.store, ctx.student)) };
  });

  router.patch('/api/play/look', requireStudent, act((ctx, s, pc) => play.saveLook(s, ctx.body, pc)));
  router.post('/api/play/visit', requireStudent, act((ctx, s) => play.visit(s, str(ctx.body.zone, 20))));
  router.post('/api/play/focus', requireStudent, act((ctx, s) => play.focus(s, str(ctx.body.action, 10))));
  router.post('/api/play/buy', requireStudent, act((ctx, s) => play.buy(s, str(ctx.body.slot, 20), str(ctx.body.id, 30))));
  router.post('/api/play/quiz', requireStudent, act((ctx, s) => play.quiz(s, ctx.body.answers)));
  router.post('/api/play/steps/claim', requireStudent, act((ctx, s, pc) => play.claimSteps(s, pc)));

  router.post('/api/play/mark', requireStudent, act((ctx, s) => {
    if (ctx.body.step !== 'schedule') fail(400, 'Неизвестный шаг');
    s.steps.schedule = true;
  }));

