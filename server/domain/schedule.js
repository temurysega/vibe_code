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

