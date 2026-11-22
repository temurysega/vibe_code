// Что расписание говорит про сегодня — общий модуль для экрана и тестов (node:test).
// day — сегодняшний день из текущей недели или null (воскресенье), now — { date: 'ГГГГ-ММ-ДД', minutes } по Москве.
// «Сегодня пар нет» и «Сегодня занятия закончились» — разные ответы: в первом случае занятий не было.
const toMin = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m; };
const held = (it) => !['cancelled', 'moved'].includes(it.status);

export function todayState(day, now) {
  if (!day || day.date !== now.date) return { state: 'none' };
  if (day.holiday) return { state: 'holiday', holiday: day.holiday };
  const lessons = day.items.filter(held);
  if (!lessons.length) return { state: day.items.length ? 'cancelled' : 'none' };
  if (lessons.some((it) => toMin(it.end) > now.minutes)) return { state: 'ahead' };
  return { state: 'ended', last: lessons.reduce((a, b) => (toMin(b.end) > toMin(a.end) ? b : a)).end };
}

// Заголовок отметки «Сегодня»; пустая строка — пары ещё впереди, отметка не нужна
export function todayHead(t) {
  if (t.state === 'holiday') return `Сегодня пар нет — ${t.holiday.toLowerCase()}`;
  if (t.state === 'cancelled') return 'Сегодня пар нет — занятия отменены или перенесены';
  if (t.state === 'none') return 'Сегодня пар нет';
  if (t.state === 'ended') return `Сегодня занятия закончились в ${t.last}`;
  return '';
}
