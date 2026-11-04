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

const AUDIENCE = `(n.audience = 'all' OR (n.audience = 'faculty' AND n.audience_id = ?) OR (n.audience = 'group' AND n.audience_id = ?) OR (n.audience = 'student' AND n.audience_id = ?))`;

// Напоминания о дедлайнах за 3 дня: материализуются при чтении, по одному на дедлайн
export function remindDeadlines(store, student, faculty) {
  const now = Date.now();
  const list = store.all(
    `SELECT dl.*, d.name AS d_name FROM deadlines dl LEFT JOIN disciplines d ON d.id = dl.discipline_id
     WHERE (dl.group_code = ? OR dl.student_id = ?) AND dl.due_at > ? AND dl.due_at < ?`,
    student.group_code, student.id, now, now + 3 * DAY,
  );
  list.forEach((dl) => {
    // Считаем календарные дни по Москве: «послезавтра» понятнее, чем «через 2,1 дня»
    const days = daysBetween(msk(now).date, msk(dl.due_at).date);
    const when = days <= 0 ? 'сегодня' : days === 1 ? 'уже завтра' : days === 2 ? 'послезавтра' : `через ${days} ${plural(days, ['день', 'дня', 'дней'])}`;
    notify(store, {
      audience: 'student', audienceId: student.id, kind: 'deadline', important: days <= 1 ? 1 : 0, ref: `deadline:${dl.id}:${student.id}`,
      title: `${dl.title} — ${when}`, body: dl.d_name ? `${dl.d_name}. Срок — ${new Date(dl.due_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}` : 'Не пропустите срок',
      link: dl.link || '#/home',
    });
  });
}

export function listFor(store, userId, student, limit = 60) {
  return store.all(
    `SELECT n.id, n.kind, n.title, n.body, n.link, n.important, n.author, n.created_at, n.audience, r.read_at
     FROM notifications n LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.user_id = ?
     WHERE ${AUDIENCE} ORDER BY n.created_at DESC, n.id DESC LIMIT ?`,
    userId, student.faculty_id, student.group_code, String(student.id), limit,
  ).map((n) => ({
    id: n.id, kind: n.kind, kindLabel: KINDS[n.kind] || 'Кабинет', title: n.title, body: n.body, link: n.link,
    important: !!n.important, author: n.author, at: n.created_at, read: !!n.read_at,
    scope: { all: 'Весь МГИМО', faculty: 'Факультет', group: 'Группа', student: 'Лично вам' }[n.audience],
  }));
}

