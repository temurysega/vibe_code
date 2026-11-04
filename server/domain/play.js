// Игровой слой на сервере: аватар, питомец, М-коины, маршрут по кампусу и забег.
// Клиент только просит — начисления и проверки делает сервер, подделать баланс из браузера нельзя.
import { randomBytes } from 'node:crypto';
import { APPEARANCE, ITEMS, ROOMS, KITS, TITLES, EMOJIS, FIRST_STEPS, RULES, itemOf, itemState, keyOf } from '../../public/js/shared/catalog.js';
import { fail } from '../http/router.js';
import { str, int } from '../http/body.js';
import { msk } from './time.js';

const AV_KEYS = ['body', 'skin', 'hair', 'hairColor', 'eyes', 'mouth', 'cheeks', 'facial'];
const ITEM_SLOTS = ['top', 'bottom', 'shoes', 'hat', 'glasses', 'extra', 'pet'];
const PROF_SLOTS = ['backdrop', 'pattern', 'frame'];
const MAX_SCORE_PER_SEC = 120;

export function defaults(seed) {
  return {
    v: 1,
    av: Object.assign({ body: 'f', skin: 's2', hair: 'short', hairColor: 'dark', eyes: 'round', mouth: 'smile', cheeks: 'none', facial: 'none', top: 'tee', topColor: 'white', bottom: 'jeans', bottomColor: 'denim', shoes: 'sneakers', shoesColor: 'gray', hat: 'none', glasses: 'none', extra: 'none', pet: 'none' }, seed.av || {}),
    prof: Object.assign({ backdrop: 'navy', pattern: 'globes', frame: 'none', emoji: '📚', title: 'none' }, seed.prof || {}),
    petName: seed.petName || 'Пиксель',
    pet: { growth: seed.growth || 0, sessions: seed.sessions || 0, focusStart: 0, focusEnd: 0, focusDay: '', focusToday: 0 },
    coins: seed.coins || 0,
    owned: (seed.owned || []).slice(),
    visited: (seed.visited || []).slice(),
    game: { best: seed.best || 0, plays: seed.plays || 0 },
    steps: Object.assign({ onboarded: false, schedule: false, quiz: 0, claimed: false }, seed.steps || {}),
    prefs: { quiet: false, noConfetti: false, email: true, telegram: false, push: true, quietHours: true },
    history: (seed.history || []).slice(),
  };
}

export function load(store, studentId) {
  const row = store.get('SELECT state FROM play_state WHERE student_id = ?', studentId);
  if (!row) fail(404, 'Игровой профиль не найден');
  return JSON.parse(row.state);
}

export function save(store, studentId, s) {
  s.history = s.history.slice(0, 40);
  store.run('UPDATE play_state SET state = ?, updated_at = ? WHERE student_id = ?', JSON.stringify(s), Date.now(), studentId);
}

const earn = (s, amt, title) => {
  if (!amt) return;
  s.coins += amt;
  s.history.unshift({ t: Date.now(), title, amt });
};

// Сколько секунд забега осталось сегодня: учитываются и незавершённые забеги
export function gameLeft(store, studentId) {
  const day = msk().date;
  const now = Date.now();
  const runs = store.all('SELECT * FROM game_runs WHERE student_id = ? AND day = ?', studentId, day);
  const used = runs.reduce((a, r) => a + (r.finished_at ? r.played_ms : Math.min(now - r.started_at, r.allowed_ms)), 0);
  return Math.max(0, Math.floor((RULES.gameDailySec * 1000 - used) / 1000));
}

// Титулы открываются за действия, купить их нельзя
export function titlesOf(s, ctx) {
  return TITLES.map((t) => Object.assign({}, t, { unlocked: t.id === 'none'
    || (t.id === 'newbie' && !!s.steps.claimed) || (t.id === 'explorer' && ROOMS.every((r) => s.visited.includes(r.id)))
    || (t.id === 'focus' && s.pet.sessions >= 10) || (t.id === 'runner' && s.game.best >= 2000) || (t.id === 'excellent' && !!ctx.excellent) }));
}

export function view(store, studentId, s, ctx) {
  const today = msk().date;
  const steps = [
    { id: 'avatar', title: 'Собрать аватар', done: !!s.steps.onboarded, act: 'onboarding', cta: 'Собрать' },
    { id: 'schedule', title: 'Посмотреть расписание на неделю', done: !!s.steps.schedule, link: '#/schedule', cta: 'Открыть' },
    { id: 'request', title: 'Заказать первую справку онлайн', done: !!ctx.hasRequest, link: '#/requests/new/study', cta: 'Заказать' },
    { id: 'quiz', title: 'Квиз «Как устроен кабинет»', done: s.steps.quiz >= 4, act: 'quiz', cta: 'Пройти' },
    { id: 'campus', title: 'Заглянуть в три зоны кампуса', done: s.visited.length >= 3, link: '#/campus', cta: 'В кампус' },
  ];
  const titles = titlesOf(s, ctx);
  return Object.assign({}, s, {
    level: 1 + Math.floor(s.pet.growth / 10),
    focusLeftToday: Math.max(0, RULES.focusPerDay - (s.pet.focusDay === today ? s.pet.focusToday : 0)),
    stepsList: steps, stepsDone: steps.filter((x) => x.done).length, newcomer: ctx.newcomer,
    titles, excellent: !!ctx.excellent,
    gameLeft: gameLeft(store, studentId), gameDaily: RULES.gameDailySec,
    stock: Object.fromEntries(KITS.map((k) => [k.id, Number(store.meta('stock:' + k.id) ?? k.stock)])),
  });
}

// Сохранение образа: каждая вещь проверяется по каталогу и по тому, открыта ли она
export function saveLook(s, body, ctx) {
  const av = Object.assign({}, s.av);
  const src = body.av && typeof body.av === 'object' ? body.av : {};
  AV_KEYS.forEach((k) => {
    if (src[k] == null) return;
    if (!APPEARANCE[k].some(([id]) => id === src[k])) fail(400, 'Неизвестный вариант внешности');
    av[k] = src[k];
  });
  ITEM_SLOTS.forEach((slot) => {
    if (src[slot] == null) return;
    const it = itemOf(slot, src[slot]);
    if (!it) fail(400, 'Неизвестная вещь');
    if (!itemState(it, s, ctx).owned) fail(403, `Вещь «${it.name}» ещё не открыта`);
    av[slot] = it.id;
    // Цвет допустим только из палитры этой вещи; у вещей без палитры цвет фиксированный
    const c = src[slot + 'Color'];
    if (!it.colors) delete av[slot + 'Color'];
    else if (c != null && c !== '') {
      if (!it.colors.includes(c)) fail(400, 'Неизвестный цвет');
      av[slot + 'Color'] = c;
    } else if (!it.colors.includes(av[slot + 'Color'])) av[slot + 'Color'] = it.colors[0];
  });
  const prof = Object.assign({}, s.prof);
  const p = body.prof && typeof body.prof === 'object' ? body.prof : {};
  PROF_SLOTS.forEach((slot) => {
    if (p[slot] == null) return;
    const it = itemOf(slot, p[slot]);
    if (!it) fail(400, 'Неизвестное оформление');
    if (!itemState(it, s, ctx).owned) fail(403, `Оформление «${it.name}» ещё не открыто`);
    prof[slot] = it.id;
  });
  if (p.emoji != null) {
    if (p.emoji !== '' && !EMOJIS.includes(p.emoji)) fail(400, 'Выберите эмодзи из списка');
    prof.emoji = p.emoji;
  }
  if (p.title != null) {
    const t = titlesOf(s, ctx).find((x) => x.id === p.title);
    if (!t) fail(400, 'Неизвестный титул');
    if (!t.unlocked) fail(403, `Титул «${t.name}» ещё не открыт`);
    prof.title = t.id;
  }
  s.av = av;
  s.prof = prof;
  if (body.petName != null) {
    const name = str(body.petName, 24);
    if (name.length < 2) fail(400, 'Имя питомца — от 2 символов');
    s.petName = name;
  }
  if (body.onboarded) s.steps.onboarded = true;
}

export function visit(s, zone) {
  const room = ROOMS.find((r) => r.id === zone);
  if (!room) fail(400, 'Нет такой зоны');
  if (s.visited.includes(zone)) return { first: false };
  s.visited.push(zone);
  s.pet.growth += RULES.growth.visit;
  earn(s, RULES.visitCoins, `Кампус: ${room.name}`);
  const unlocked = ITEMS.filter((i) => (i.src === 'route' && i.zone === zone) || (i.src === 'routeAll' && ROOMS.every((r) => s.visited.includes(r.id)))).map((i) => i.name);
  return { first: true, coins: RULES.visitCoins, unlocked, all: ROOMS.every((r) => s.visited.includes(r.id)) };
}

// Фокус-сессия «Посиди со мной»: награда только если прошло 25 минут
export function focus(s, action) {
  const now = Date.now();
  const today = msk().date;
  if (s.pet.focusDay !== today) { s.pet.focusDay = today; s.pet.focusToday = 0; }
  if (action === 'start') {
    if (s.pet.focusEnd > now) return { active: true };
    s.pet.focusStart = now;
    s.pet.focusEnd = now + RULES.focusMinutes * 60e3;
    return { active: true };
  }
  if (action === 'stop') { s.pet.focusStart = 0; s.pet.focusEnd = 0; return { active: false }; }
  if (action === 'done') {
    if (!s.pet.focusEnd || now < s.pet.focusEnd - 5000) fail(400, 'Сессия ещё не закончилась');
    s.pet.focusStart = 0; s.pet.focusEnd = 0;
    s.pet.sessions += 1;
    s.pet.growth += RULES.growth.focus;
    const paid = s.pet.focusToday < RULES.focusPerDay;
    s.pet.focusToday += 1;
    if (paid) earn(s, RULES.focusCoins, 'Фокус-сессия 25 минут');
    return { active: false, coins: paid ? RULES.focusCoins : 0, sessions: s.pet.sessions };
  }
  fail(400, 'Неизвестное действие');
}

export function buy(s, slot, id) {
  const it = itemOf(slot, id);
  if (!it || it.src !== 'digital') fail(400, 'Эту вещь нельзя купить');
  if (s.owned.includes(keyOf(it))) return { already: true };
  if (s.coins < it.price) fail(400, 'Не хватает М-коинов');
  s.owned.push(keyOf(it));
  earn(s, -it.price, `${it.name} — вещь для аватара`);
  return { ok: true };
}

export function takeKit(store, s, kitId, size) {
  const kit = KITS.find((k) => k.id === kitId);
  if (!kit) fail(400, 'Нет такого комплекта');
  if (!kit.sizes.includes(size)) fail(400, 'Выберите размер');
  if (s.owned.includes(kit.twin)) fail(409, 'Этот комплект у вас уже есть');
  const left = Number(store.meta('stock:' + kit.id) ?? kit.stock);
  if (left <= 0) fail(409, 'Комплекты закончились — следующая партия в декабре');
  if (s.coins < kit.price) fail(400, 'Не хватает М-коинов');
  store.meta('stock:' + kit.id, left - 1);
  s.owned.push(kit.twin);
  earn(s, -kit.price, `${kit.name} + цифровая копия`);
  return kit;
}

export function quiz(s, answers) {
  if (!Array.isArray(answers) || answers.length !== FIRST_STEPS.quiz.length) fail(400, 'Ответьте на все вопросы');
  const score = FIRST_STEPS.quiz.reduce((a, q, i) => a + (Number(answers[i]) === q.ok ? 1 : 0), 0);
  s.steps.quiz = Math.max(s.steps.quiz, score);
  return { score, total: FIRST_STEPS.quiz.length, passed: score >= 4 };
}

export function claimSteps(s, ctx) {
  if (s.steps.claimed) fail(409, 'Награда уже получена');
  const all = s.steps.onboarded && s.steps.schedule && ctx.hasRequest && s.steps.quiz >= 4 && s.visited.length >= 3;
  if (!all) fail(400, 'Сначала пройдите все шаги');
  s.steps.claimed = true;
  s.pet.growth += RULES.growth.steps;
  earn(s, FIRST_STEPS.coins, 'Первые шаги: чек-лист первокурсника');
  return { coins: FIRST_STEPS.coins };
}

export function setPrefs(s, body) {
  ['quiet', 'noConfetti', 'email', 'telegram', 'push', 'quietHours'].forEach((k) => { if (typeof body[k] === 'boolean') s.prefs[k] = body[k]; });
}

// ---------- забег «Бегом на пару»: время считает сервер ----------
export function gameStart(store, studentId) {
  const left = gameLeft(store, studentId);
  if (left < 2) fail(429, 'На сегодня 5 минут забега закончились — возвращайтесь завтра', { left: 0 });
  const now = Date.now();
  // Незавершённые забеги закрываются: время уже засчитано
  store.run('UPDATE game_runs SET finished_at = ?, played_ms = MIN(? - started_at, allowed_ms), score = 0, coins = 0 WHERE student_id = ? AND finished_at IS NULL', now, now, studentId);
  const id = randomBytes(16).toString('hex');
  store.run('INSERT INTO game_runs (id, student_id, day, started_at, allowed_ms) VALUES (?, ?, ?, ?, ?)', id, studentId, msk().date, now, left * 1000);
  return { run: id, left };
}

