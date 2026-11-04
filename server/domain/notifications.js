// Уведомления: новости деканата, изменения расписания, дедлайны, статусы заявок и новые оценки.
import { DAY, msk, daysBetween } from './time.js';
import { plural } from './grades.js';

export const KINDS = {
  news: 'Деканат',
  schedule: 'Расписание',
  deadline: 'Дедлайн',
  request: 'Заявка',
  grade: 'Оценка',
  system: 'Кабинет',
};

export function notify(store, n) {
  const sql = `INSERT INTO notifications (audience, audience_id, kind, title, body, link, important, author, ref, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const args = [n.audience, n.audienceId == null ? null : String(n.audienceId), n.kind, n.title, n.body || '', n.link || null, n.important ? 1 : 0, n.author || null, n.ref || null, n.at || Date.now()];
  if (n.ref) {
    // Напоминание с тем же ключом создаётся один раз
    const has = store.get('SELECT id FROM notifications WHERE ref = ?', n.ref);
    if (has) return has.id;
  }
  return store.insert(sql, ...args);
}

