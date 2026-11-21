// Успеваемость по 100-балльной шкале: текущие баллы, прогноз, сессия, долги и история.
import { msk, semesterNumber, semesterOf, daysBetween } from './time.js';

export const SCALE = [
  { min: 90, letter: 'A', grade: 5, word: 'отлично' },
  { min: 82, letter: 'B', grade: 4, word: 'хорошо' },
  { min: 75, letter: 'C', grade: 4, word: 'хорошо' },
  { min: 67, letter: 'D', grade: 3, word: 'удовлетворительно' },
  { min: 60, letter: 'E', grade: 3, word: 'удовлетворительно' },
  { min: 0, letter: 'F', grade: 2, word: 'неудовлетворительно' },
];
export const CONTROL = { exam: 'Экзамен', credit: 'Зачёт', graded: 'Зачёт с оценкой' };

export const gradeOf = (points) => SCALE.find((s) => points >= s.min);

// Итог по дисциплине в словах: для зачёта — «зачтено», для экзамена — оценка
export function verdictOf(points, control) {
  const g = gradeOf(points);
  if (control === 'credit') return { passed: points >= 60, label: points >= 60 ? 'зачтено' : 'не зачтено', letter: g.letter, grade: null };
  return { passed: points >= 60, label: g.word, letter: g.letter, grade: g.grade };
}

const sum = (list, f) => list.reduce((a, x) => a + f(x), 0);

// Карточка дисциплины текущего семестра с прогнозом «что нужно, чтобы…»
function current(d, items) {
  const graded = items.filter((a) => a.points != null);
  const left = items.filter((a) => a.points == null);
  const earned = sum(graded, (a) => a.points);
  const gradedMax = sum(graded, (a) => a.max_points);
  const remaining = sum(left, (a) => a.max_points);
  const pace = gradedMax ? earned / gradedMax : null;
  const forecast = pace == null ? null : Math.min(100, Math.round(earned + pace * remaining));
  const targets = [60, 75, 90].map((min) => ({ min, need: Math.max(0, min - earned), reachable: min - earned <= remaining }));
  const att = items.filter((a) => a.kind === 'attendance' && a.points != null);
  // Без единой оценки прогноз не строится: статус «нет данных», а не «стабильно»
  let status = gradedMax ? 'ok' : 'nodata';
  if (forecast != null && forecast >= 90) status = 'excellent';
  else if (forecast != null && forecast >= 75) status = 'good';
  if (pace != null && (pace < 0.6 || forecast < 60)) status = 'risk';

  // Подсказка простыми словами: цель — та оценка, к которой студент идёт по прогнозу
  const goal = targets.slice().reverse().find((t) => t.reachable && (forecast == null || t.min <= forecast + 3)) || targets.find((t) => t.reachable);
  const goalName = (min) => (min === 90 ? '«отлично»' : min === 75 ? '«хорошо»' : d.control === 'credit' ? 'зачёта' : '«удовлетворительно»');
  const nextItem = left.filter((a) => a.kind !== 'attendance').sort((a, b) => String(a.date || '9').localeCompare(String(b.date || '9')))[0];
  let advice;
  if (status === 'nodata') advice = `Пока нет данных для прогноза${nextItem ? ` — первая контрольная точка «${nextItem.title}»` : ''}`;
  else if (status === 'risk') advice = `Чтобы получить ${d.control === 'credit' ? 'зачёт' : '«удовлетворительно»'}, нужно ещё ${Math.max(0, 60 - earned)} из ${remaining} оставшихся баллов`;
  else if (goal && goal.need > 0) advice = `До ${goalName(goal.min)} — ${goal.need} ${plural(goal.need, ['балл', 'балла', 'баллов'])} из ${remaining} возможных`;
  else if (goal) advice = `Баллов на ${goalName(goal.min).replace('зачёта', 'зачёт')} уже достаточно — держите темп`;
  else if (!remaining) advice = 'Все контрольные точки пройдены';
  else advice = 'Держите темп — впереди ещё контрольные точки';

  return {
    id: d.discipline_id, name: d.name, short: d.short, color: d.color, control: d.control, controlLabel: CONTROL[d.control], credits: d.credits,
    teacher: d.t_name ? { name: d.t_name, short: d.t_short, email: d.t_email, hours: d.t_hours } : null,
    earned, gradedMax, remaining, pace, forecast, forecastVerdict: forecast == null ? null : verdictOf(forecast, d.control),
    targets, status, advice,
    attendance: att.length ? Math.round((sum(att, (a) => a.points) / sum(att, (a) => a.max_points)) * 100) : null,
    next: nextItem ? { title: nextItem.title, date: nextItem.date, max: nextItem.max_points } : null,
    items: items.map((a) => ({ id: a.id, title: a.title, kind: a.kind, max: a.max_points, points: a.points, date: a.date })),
  };
}

export function plural(n, forms) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

// Синтетический рейтинг группы: распределение баллов однокурсников без персональных данных
function groupRank(groupCode, myAvg) {
  let seed = [...groupCode].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const others = Array.from({ length: 22 }, () => 3.2 + rnd() * 1.75);
  const place = 1 + others.filter((x) => x > myAvg).length;
  return { place, of: others.length + 1, top: Math.round((place / (others.length + 1)) * 100) };
}

export function gradesFor(store, student) {
  const now = msk();
  const sem = semesterNumber(student.admission_year, now.date);
  const enr = store.all(
    `SELECT e.*, d.name, d.short, d.color, d.control, d.credits, t.full_name AS t_name, t.short_name AS t_short, t.email AS t_email, t.office_hours AS t_hours
     FROM enrollments e JOIN disciplines d ON d.id = e.discipline_id LEFT JOIN teachers t ON t.id = e.teacher_id
     WHERE e.student_id = ? ORDER BY e.semester, d.name`, student.id,
  );
  const items = store.all('SELECT * FROM assessments WHERE student_id = ? AND semester = ? ORDER BY date, id', student.id, sem);

  const cur = enr.filter((e) => e.semester === sem).map((e) => current(e, items.filter((a) => a.discipline_id === e.discipline_id)));
  const history = [];
  enr.filter((e) => e.semester < sem).forEach((e) => {
    let h = history.find((x) => x.semester === e.semester);
    if (!h) history.push(h = { semester: e.semester, course: Math.ceil(e.semester / 2), part: e.semester % 2 ? 'осенний' : 'весенний', list: [] });
    const v = verdictOf(e.final_points ?? 0, e.control);
    h.list.push({ id: e.discipline_id, name: e.name, control: e.control, controlLabel: CONTROL[e.control], credits: e.credits, points: e.final_points, status: e.status, verdict: v, retake: e.retake_date ? { date: e.retake_date, room: e.retake_room } : null });
  });
  history.forEach((h) => {
    const marks = h.list.filter((x) => x.verdict.grade && x.status !== 'debt').map((x) => x.verdict.grade);
    h.avg = marks.length ? Math.round((sum(marks, (x) => x) / marks.length) * 100) / 100 : null;
    h.credits = sum(h.list.filter((x) => x.verdict.passed), (x) => x.credits);
  });

  const allMarks = history.flatMap((h) => h.list.filter((x) => x.verdict.grade && x.status !== 'debt').map((x) => x.verdict.grade));
  const avg = allMarks.length ? Math.round((sum(allMarks, (x) => x) / allMarks.length) * 100) / 100 : null;
  const debts = history.flatMap((h) => h.list.filter((x) => x.status === 'debt').map((x) => Object.assign({ semester: h.semester }, x)));
  const last = history[history.length - 1];
  const lastMarks = last ? last.list.filter((x) => x.verdict.grade).map((x) => x.verdict.grade) : [];
  let stipend;
  if (student.funding !== 'бюджет') stipend = { kind: 'none', label: 'Обучение по договору — стипендия не начисляется', hint: 'Скидку на обучение дают за сессию без троек' };
  else if (!last) stipend = { kind: 'base', label: 'Академическая стипендия первокурсника', hint: 'После первой сессии — по её итогам' };
  else if (debts.length || lastMarks.some((g) => g < 4)) stipend = { kind: 'none', label: 'Академическая стипендия не назначена', hint: 'Сдайте следующую сессию без троек и долгов' };
  else if (lastMarks.every((g) => g === 5)) stipend = { kind: 'high', label: 'Повышенная академическая стипендия', hint: 'Сессия сдана на «отлично»' };
  else stipend = { kind: 'base', label: 'Академическая стипендия', hint: 'Сессия без троек' };

  const risk = cur.filter((c) => c.status === 'risk');
  const excellent = cur.filter((c) => c.status === 'excellent');
  const paces = cur.filter((c) => c.pace != null);
  const semPace = paces.length ? sum(paces, (c) => c.pace) / paces.length : null;
  const attItems = items.filter((a) => a.kind === 'attendance' && a.points != null);
  const attendance = attItems.length ? Math.round((sum(attItems, (a) => a.points) / sum(attItems, (a) => a.max_points)) * 100) : null;
  const rank = groupRank(student.group_code, avg ?? (semPace ? 3 + semPace * 2 : 4));

  // Сессия: экзамены и зачёты группы
  const exams = store.all(
    `SELECT x.*, d.name, d.short, d.color, t.short_name AS t_short FROM exams x JOIN disciplines d ON d.id = x.discipline_id LEFT JOIN teachers t ON t.id = x.teacher_id
     WHERE x.group_code = ? ORDER BY x.date, x.time`, student.group_code,
  ).map((x) => ({ id: x.id, kind: x.kind, kindLabel: x.kind === 'consult' ? 'Консультация' : CONTROL[x.kind], discipline: x.name, short: x.short, color: x.color, date: x.date, time: x.time, room: x.room, teacher: x.t_short, inDays: daysBetween(now.date, x.date) }));
  const s = semesterOf(now.date);
  // Это прогноз по текущим баллам; фактический допуск выставляет деканат перед сессией
  const admitted = risk.length === 0 && !debts.length;
  const nodata = cur.filter((c) => c.status === 'nodata');

  // Короткий ответ на вопрос «как у меня дела»
  let mood, headline;
  if (debts.length) { mood = 'warn'; headline = `Есть ${debts.length} ${plural(debts.length, ['долг', 'долга', 'долгов'])} с прошлой сессии — закройте до начала зимней`; }
  else if (risk.length) { mood = 'warn'; headline = `В целом неплохо, но ${risk.length} ${plural(risk.length, ['дисциплина', 'дисциплины', 'дисциплин'])} в зоне риска`; }
  else if (cur.length && nodata.length === cur.length) { mood = 'good'; headline = 'Семестр только начался — оценок пока нет, прогноз появится после первых контрольных точек'; }
  else if (cur.length && excellent.length >= Math.ceil(cur.length / 2)) { mood = 'great'; headline = 'Отличный семестр: идёте на «отлично» по большинству дисциплин'; }
  else { mood = 'good'; headline = 'Всё под контролем: по всем дисциплинам вы выше порога'; }

  const tips = [];
  debts.forEach((d) => tips.push({ kind: 'debt', text: `Пересдача «${d.name}»${d.retake ? ` — ${d.retake.date}, ауд. ${d.retake.room}` : ''}`, link: '#/requests/new/retake' }));
  risk.forEach((c) => tips.push({ kind: 'risk', text: `${c.name}: ${c.advice.toLowerCase()}`, link: `#/grades/${c.id}` }));
  if (attendance != null && attendance < 80) tips.push({ kind: 'att', text: `Посещаемость ${attendance}% — при пропусках предупредите деканат заявлением`, link: '#/requests/new/absence' });
  const nearest = exams.find((x) => x.inDays >= 0 && x.kind !== 'consult');
  if (nearest && nearest.inDays <= 30) tips.push({ kind: 'exam', text: `Первый ${nearest.kindLabel.toLowerCase()} — «${nearest.discipline}» через ${nearest.inDays} ${plural(nearest.inDays, ['день', 'дня', 'дней'])}`, link: '#/grades/session' });

  return {
    semester: sem, course: Math.ceil(sem / 2), semesterLabel: s.part === 1 ? 'Осенний семестр' : 'Весенний семестр',
    session: { start: s.sessionStart, end: s.sessionEnd, admitted, admission: 'forecast', exams },
    summary: {
      mood, headline, tips, avg, semPace: semPace == null ? null : Math.round(semPace * 100), attendance, rank, stipend,
      risk: risk.length, excellent: excellent.length, total: cur.length, debts: debts.length, nodata: nodata.length,
      credits: sum(cur, (c) => c.credits), earned: sum(cur, (c) => c.earned), possible: sum(cur, (c) => c.gradedMax),
    },
    current: cur,
    history,
    debts,
    scale: SCALE,
  };
}
