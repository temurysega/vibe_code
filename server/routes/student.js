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

