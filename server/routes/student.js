// Данные студента: профиль, главная, расписание, успеваемость и уведомления.
// Каждый маршрут берёт студента из сессии — подставить чужой id в адрес невозможно.
import { fail } from '../http/router.js';
import { requireStudent } from '../security/auth.js';
import { buildWeek, upcoming, dayOf, icsFor } from '../domain/schedule.js';
import { gradesFor } from '../domain/grades.js';
import { listFor, unreadCount, markRead, remindDeadlines } from '../domain/notifications.js';
import { applyPlans, publicRequest } from '../domain/requests.js';
import * as play from '../domain/play.js';
import { msk, addDays, weekMonday, mondayOf, parityOf, holidayOf, BELLS, semesterOf, DAY } from '../domain/time.js';

export function profileOf(s) {
  return {
    lastName: s.last_name, firstName: s.first_name, middleName: s.middle_name, gender: s.gender,
    group: s.group_code, course: s.course, semester: s.semester, faculty: s.faculty,
    program: s.program, profile: s.profile, curator: s.curator,
    recordBook: s.record_book, email: s.email, phone: s.phone,
    studyForm: s.study_form, funding: s.funding, languages: JSON.parse(s.languages || '[]'), admissionYear: s.admission_year,
  };
}

// Сессия без троек и долгов открывает знаки «за учёбу»
export function playCtx(store, s) {
  const last = store.get("SELECT MAX(semester) AS m FROM enrollments WHERE student_id = ? AND status != 'current'", s.id).m;
  const rows = last ? store.all('SELECT e.final_points, e.status, d.control FROM enrollments e JOIN disciplines d ON d.id = e.discipline_id WHERE e.student_id = ? AND e.semester = ?', s.id, last) : [];
  const debts = store.get("SELECT COUNT(*) AS c FROM enrollments WHERE student_id = ? AND status = 'debt'", s.id).c;
  const excellent = !!rows.length && !debts && rows.every((r) => (r.control === 'credit' ? r.final_points >= 60 : r.final_points >= 75));
  const hasRequest = !!store.get("SELECT 1 AS x FROM requests WHERE student_id = ? AND type != 'merch' LIMIT 1", s.id);
  return { excellent, hasRequest, newcomer: s.semester === 1 };
}

function deadlinesOf(store, s, days = 14) {
  const now = Date.now();
  return store.all(
    `SELECT dl.id, dl.title, dl.due_at, dl.kind, dl.link, d.name AS discipline, d.color FROM deadlines dl LEFT JOIN disciplines d ON d.id = dl.discipline_id
     WHERE (dl.group_code = ? OR dl.student_id = ?) AND dl.due_at > ? AND dl.due_at < ? ORDER BY dl.due_at`,
    s.group_code, s.id, now - 3600e3, now + days * DAY,
  ).map((d) => ({ id: d.id, title: d.title, dueAt: d.due_at, kind: d.kind, link: d.link, discipline: d.discipline, color: d.color, overdue: d.due_at < now }));
}

