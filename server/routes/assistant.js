// Помощник «Спросить деканат» и служебные маршруты демо-стенда.
import { fail } from '../http/router.js';
import { str } from '../http/body.js';
import { requireStudent } from '../security/auth.js';
import { RateLimiter } from '../security/rateLimit.js';
import { snapshot, ruleAnswer, aiAnswer } from '../domain/assistant.js';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../seed/seed.js';
import { config } from '../config.js';

// 20 вопросов за 10 минут на студента: защищает и бюджет ИИ, и сервер
const perUser = new RateLimiter({ windowMs: 10 * 60e3, max: 20 });

export default function (router) {
  router.post('/api/assistant', requireStudent, async (ctx) => {
    const question = str(ctx.body.message, 500);
    if (question.length < 2) fail(400, 'Напишите вопрос');
    const key = `ai|${ctx.sandbox || ''}|${ctx.user.id}`;
    const c = perUser.check(key);
    if (!c.ok) fail(429, `Слишком много вопросов подряд. Попробуйте через ${Math.ceil(c.retryAfter / 60)} мин.`);
    perUser.hit(key);
    // История — только последние реплики этого же разговора, обрезанные по длине
    const history = (Array.isArray(ctx.body.history) ? ctx.body.history : []).slice(-6)
      .filter((h) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.text === 'string')
      .map((h) => ({ role: h.role, text: h.text.slice(0, 1000) }));
    while (history.length && history[0].role !== 'user') history.shift();
    const snap = snapshot(ctx.store, ctx.user, ctx.student);
    const ai = await aiAnswer(snap, question, history);
    if (ai) return ai;
    return Object.assign(ruleAnswer(snap, question), { source: 'rules' });
  });

  // Подсказки для жюри: в демо-режиме страница входа показывает тестовые учётки
  router.get('/api/demo/accounts', (ctx) => (process.env.DEMO_MODE === '0'
    ? { accounts: [] }
    : { password: DEMO_PASSWORD, accounts: DEMO_ACCOUNTS, ai: !!(config.openrouterKey || config.anthropicKey), sandboxes: !!ctx.sandboxes, sandbox: !!ctx.sandbox }));
}
