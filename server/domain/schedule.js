// Расписание группы: регулярные пары + изменения (отмена, перенос, аудитория, замена, доп. пара).
import { BELLS, addDays, holidayOf, parityOf, mondayOf, msk, isoWeek, toMin } from './time.js';

export const KIND = {
  lecture: 'Лекция',
  seminar: 'Семинар',
  language: 'Иностранный язык',
  practice: 'Практикум',
  sport: 'Физкультура',
  consult: 'Консультация',
};

const LESSON_SQL = `SELECT l.*, d.name AS discipline, d.short, d.color, d.control,
    t.full_name AS t_name, t.short_name AS t_short, t.title AS t_title, t.department AS t_dept, t.email AS t_email, t.office_hours AS t_hours
  FROM lessons l JOIN disciplines d ON d.id = l.discipline_id JOIN teachers t ON t.id = l.teacher_id
  WHERE l.group_code = ?`;

const teacherOf = (row, p = 't_') => (row[p + 'name'] ? {
  name: row[p + 'name'], short: row[p + 'short'], title: row[p + 'title'] || '', department: row[p + 'dept'] || '', email: row[p + 'email'] || '', hours: row[p + 'hours'] || '',
} : null);

// Этаж и корпус по номеру аудитории: первая цифра — этаж
export function placeOf(room) {
  const m = /^(\d)(\d{3})$/.exec(String(room));
  if (m) return `${m[1]} этаж`;
  return '';
}

function item(l, date, pair) {
  const [start, end] = BELLS[pair];
  return {
    key: `${date}:${pair}:${l.id}`,
    date, pair, start, end,
    lessonId: l.id,
    disciplineId: l.discipline_id,
    discipline: l.discipline, short: l.short, color: l.color,
    kind: l.kind, kindLabel: KIND[l.kind] || l.kind,
    room: l.room, place: placeOf(l.room),
    teacher: teacherOf(l),
    subgroup: l.subgroup || null,
    status: 'normal',
    change: null,
  };
}

export function buildWeek(store, group, monday) {
  monday = mondayOf(monday);
  const sunday = addDays(monday, 6);
  const base = store.all(LESSON_SQL, group);
  const byId = new Map(base.map((l) => [l.id, l]));
  const teachers = new Map(store.all('SELECT * FROM teachers').map((t) => [t.id, t]));
  const tInfo = (id) => { const t = teachers.get(id); return t ? { name: t.full_name, short: t.short_name, title: t.title || '', department: t.department, email: t.email, hours: t.office_hours || '' } : null; };
  const changes = store.all(
    `SELECT c.*, d.name AS d_name, d.short AS d_short, d.color AS d_color FROM schedule_changes c LEFT JOIN disciplines d ON d.id = c.discipline_id
     WHERE c.group_code = ? AND ((c.date BETWEEN ? AND ?) OR (c.new_date BETWEEN ? AND ?)) ORDER BY c.created_at`,
    group, monday, sunday, monday, sunday,
  );
  const { parity, n } = parityOf(monday);
  const days = [];
  const notes = [];

