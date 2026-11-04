// Общая шина событий и данные текущего сеанса в памяти вкладки.
// Ничего личного не кладём в localStorage: после выхода в браузере не остаётся данных студента.
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
};

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
