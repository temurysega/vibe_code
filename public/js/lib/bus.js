// Общая шина событий и данные текущего сеанса в памяти вкладки.
// Ничего личного не кладём в localStorage: после выхода в браузере не остаётся данных студента.
const handlers = {};

export function on(ev, fn) {
  (handlers[ev] = handlers[ev] || []).push(fn);
  return () => { handlers[ev] = (handlers[ev] || []).filter((f) => f !== fn); };
}

