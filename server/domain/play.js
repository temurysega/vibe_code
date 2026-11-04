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

