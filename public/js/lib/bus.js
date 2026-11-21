// Общая шина событий и данные текущего сеанса в памяти вкладки.
// Учебные данные не кладём в localStorage; при выходе очищаем общее состояние сеанса.
const handlers = {};

export function on(ev, fn) {
  (handlers[ev] = handlers[ev] || []).push(fn);
  return () => { handlers[ev] = (handlers[ev] || []).filter((f) => f !== fn); };
}

export function emit(ev, data) {
  (handlers[ev] || []).forEach((fn) => {
    try { fn(data); } catch (e) { console.error(e); }
  });
}

export const session = {
  user: null,
  play: null,
  unread: 0,
  demo: null,
  // Демо-кабинет проверяющего: { sandboxes, id } из /api/demo
  sandbox: null,
};

// Игровой слой необязателен: если его API недоступен, учебные разделы работают без него
export const NO_PLAY = Object.freeze({
  unavailable: true, coins: 0, visited: [], owned: [], titles: [], prefs: {}, av: {},
  steps: { onboarded: true, claimed: true }, stepsList: [], stepsDone: 0, newcomer: false,
  pet: { growth: 0, focusStart: 0, focusEnd: 0, sessions: 0 }, focusLeftToday: 0, gameLeft: 0, level: 1, petName: '',
});

export function setPlay(play) {
  const before = session.play ? session.play.coins : null;
  session.play = play;
  emit('play', { play, before });
}

export function setUnread(n) {
  if (session.unread === n) return;
  session.unread = n;
  emit('unread', n);
}

export function reset() {
  session.user = null;
  session.play = null;
  session.unread = 0;
}
