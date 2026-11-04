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

