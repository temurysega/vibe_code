// Наполнение демо-стенда. Даты строятся от «сегодня» по Москве, поэтому стенд всегда выглядит живым:
// ближайшие переносы, дедлайны через пару дней, справка, которая только что стала готова.
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../security/password.js';
import { FACULTIES, GROUPS, TEACHERS, PALETTE, PLAN, PAST, STUDENTS, EXTRA_STUDENTS, STAFF } from './data.js';
import { msk, addDays, semesterOf, semesterNumber, mskTime, daysBetween, weekday, parityOf, holidayOf, DAY } from '../domain/time.js';
import { defaults as playDefaults } from '../domain/play.js';
import { notify } from '../domain/notifications.js';

// Публичный тестовый пароль демо-аккаунтов. В базу попадает только его хеш scrypt
export const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'mgimo2026';
export const DEMO_ACCOUNTS = [
  { login: 'a.morozova', role: 'student', who: 'Алина Морозова', note: '2 курс МО · отличница, одна дисциплина в зоне риска' },
  { login: 't.aliev', role: 'student', who: 'Тимур Алиев', note: '1 курс МЭО · первокурсник, «Первые шаги»' },
  { login: 'k.lebedeva', role: 'student', who: 'Ксения Лебедева', note: '4 курс МП · долг и заявка на обмен' },
  { login: 'dekanat.mo', role: 'dean', who: 'Ирина Белова', note: 'Деканат МО · обработка заявок' },
];

// Детерминированный генератор: у каждого студента одни и те же баллы при каждом пересоздании
function rng(seedStr) {
  let h = 2166136261;
  for (const c of seedStr) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h += 0x6D2B79F5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Контрольные точки семестра: [название, вид, максимум, доля семестра; null — в сессию]
const TPL = {
  exam: [['Посещаемость · сентябрь', 'attendance', 3, 0.2], ['Посещаемость · октябрь', 'attendance', 3, 0.45], ['Посещаемость · ноябрь', 'attendance', 2, 0.7], ['Посещаемость · декабрь', 'attendance', 2, 0.95],
    ['Контрольная работа', 'test', 15, 0.36], ['Работа на семинарах · I половина', 'seminar', 10, 0.48], ['Эссе', 'essay', 15, 0.62], ['Работа на семинарах · II половина', 'seminar', 10, 0.96], ['Экзамен', 'exam', 40, null]],
  credit: [['Посещаемость · сентябрь', 'attendance', 5, 0.2], ['Посещаемость · октябрь', 'attendance', 5, 0.45], ['Посещаемость · ноябрь', 'attendance', 5, 0.7], ['Посещаемость · декабрь', 'attendance', 5, 0.95],
    ['Тест', 'test', 20, 0.4], ['Работа на семинарах · I половина', 'seminar', 15, 0.5], ['Проект', 'project', 30, 0.8], ['Работа на семинарах · II половина', 'seminar', 15, 0.96]],
  graded: [['Посещаемость · сентябрь', 'attendance', 3, 0.2], ['Посещаемость · октябрь', 'attendance', 3, 0.45], ['Посещаемость · ноябрь', 'attendance', 2, 0.7], ['Посещаемость · декабрь', 'attendance', 2, 0.95],
    ['Лексико-грамматический тест', 'test', 15, 0.33], ['Домашние задания · I половина', 'homework', 10, 0.48], ['Письменная работа', 'essay', 15, 0.66], ['Домашние задания · II половина', 'homework', 10, 0.96], ['Устный зачёт с оценкой', 'oral', 40, null]],
};

// Ближайший день, когда у группы стоит эта пара (с учётом чётности и праздников)
function nextOccurrence(lesson, from) {
  for (let i = 0; i < 21; i++) {
    const d = addDays(from, i);
    if (weekday(d) !== lesson.weekday || holidayOf(d)) continue;
    if (lesson.parity !== 'all' && parityOf(d).parity !== lesson.parity) continue;
    return d;
  }
  return null;
}

// Ближайший будний день не раньше даты
function workday(d) {
  while (weekday(d) > 5 || holidayOf(d)) d = addDays(d, 1);
  return d;
}

// Хеши публичного демо-пароля считаются один раз на процесс: новый демо-кабинет создаётся быстро
let demoHashes = null;

export async function seed(store) {
  if (!demoHashes) {
    demoHashes = {};
    for (const a of DEMO_ACCOUNTS) demoHashes[a.login] = await hashPassword(DEMO_PASSWORD);
  }
  const hashes = demoHashes;
  store.wipe();
  store.run("DELETE FROM meta WHERE key LIKE 'stock:%'");
  const now = Date.now();
  const today = msk().date;
  const sem = semesterOf(today);
  const semDays = daysBetween(sem.start, sem.end);
  const dateAt = (f) => addDays(sem.start, Math.round(f * semDays));
  const ago = (h) => now - h * 36e5;

  store.tx(() => {
    FACULTIES.forEach((f) => store.run('INSERT INTO faculties (id, short, name, dean_office, hours, phone, email) VALUES (?, ?, ?, ?, ?, ?, ?)', ...f));
    GROUPS.forEach(([code, fac, year, program, profile, curator]) => store.run('INSERT INTO groups (code, faculty_id, course, program, profile, curator) VALUES (?, ?, ?, ?, ?, ?)', code, fac, Math.ceil(semesterNumber(year, today) / 2), program, profile, curator));

    const T = {};
    TEACHERS.forEach(([key, full, short, title, dept, hours]) => {
      T[key] = store.insert('INSERT INTO teachers (full_name, short_name, title, department, email, office_hours) VALUES (?, ?, ?, ?, ?, ?)', full, short, title, dept, `${key}@mgimo-mania.demo`, hours);
    });

    // Дисциплины: одна запись на название + форму контроля
    const D = {};
    let color = 0;
    const disc = (name, control, credits, short) => {
      const k = `${name}|${control}|${credits}`;
      if (!D[k]) D[k] = store.insert('INSERT INTO disciplines (name, short, control, credits, color) VALUES (?, ?, ?, ?, ?)', name, short || name, control, credits, PALETTE[color++ % PALETTE.length]);
      return D[k];
    };

    // Регулярное расписание групп
    const L = {};
    Object.entries(PLAN).forEach(([group, list]) => list.forEach((p) => {
      p.id = disc(p.name, p.control, p.credits, p.short);
      p.lessonRows = p.lessons.map(([wd, pair, parity, kind, room]) => {
        const id = store.insert('INSERT INTO lessons (group_code, weekday, pair, parity, discipline_id, kind, room, teacher_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', group, wd, pair, parity, p.id, kind, room, T[p.teacher]);
        L[`${group}|${p.short}|${kind}`] = { id, weekday: wd, pair, parity, room };
        return id;
      });
    }));

    // Сессия: зачёты — в конце семестра, экзамены — в сессию, перед экзаменом консультация
    Object.entries(PLAN).forEach(([group, list]) => {
      let exam = 0, credit = 0;
      list.forEach((p) => {
        const room = p.lessons[0][4] === 'Спорткомплекс' ? 'Спорткомплекс' : p.lessons[0][4];
        if (p.control === 'credit') {
          const d = workday(addDays(sem.end, -10 + credit * 2));
          credit++;
          store.run('INSERT INTO exams (group_code, discipline_id, kind, date, time, room, teacher_id) VALUES (?, ?, ?, ?, ?, ?, ?)', group, p.id, 'credit', d, '12:20', room, T[p.teacher]);
        } else {
          const d = addDays(sem.sessionStart, exam * 4);
          exam++;
          store.run('INSERT INTO exams (group_code, discipline_id, kind, date, time, room, teacher_id) VALUES (?, ?, ?, ?, ?, ?, ?)', group, p.id, 'consult', addDays(d, -1), '15:20', room, T[p.teacher]);
          store.run('INSERT INTO exams (group_code, discipline_id, kind, date, time, room, teacher_id) VALUES (?, ?, ?, ?, ?, ?, ?)', group, p.id, p.control, d, '10:00', room, T[p.teacher]);
        }
      });
    });

    // Студенты и учётные записи
    const S = {};
    STUDENTS.forEach((st) => {
      const g = GROUPS.find((x) => x[0] === st.group);
      st.facId = g[1];
      st.admission = g[2];
      S[st.key] = store.insert(
        `INSERT INTO students (last_name, first_name, middle_name, gender, group_code, record_book, email, phone, study_form, funding, languages, admission_year)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'очная', ?, ?, ?)`,
        st.last, st.first, st.middle, st.gender, st.group, st.book, st.email, st.phone, st.funding, JSON.stringify(st.languages), st.admission,
      );
      store.run("INSERT INTO users (login, password_hash, role, student_id, created_at) VALUES (?, ?, 'student', ?, ?)", st.login, hashes[st.login], S[st.key], ago(24 * 60));
    });
    const extra = EXTRA_STUDENTS.map(([last, first, middle, gender, group], i) => {
      const g = GROUPS.find((x) => x[0] === group);
      return store.insert(
        `INSERT INTO students (last_name, first_name, middle_name, gender, group_code, record_book, email, study_form, funding, languages, admission_year)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'очная', 'бюджет', ?, ?)`,
        last, first, middle, gender, group, `${String(g[2]).slice(2)}-МО-0${400 + i}`, `student${i + 1}@student.mgimo-mania.demo`, '["Английский"]', g[2],
      );
    });
    STAFF.forEach((s) => {
      const id = store.insert('INSERT INTO staff (full_name, position, faculty_id) VALUES (?, ?, ?)', s.name, s.position, s.faculty);
      store.run("INSERT INTO users (login, password_hash, role, staff_id, created_at) VALUES (?, ?, 'dean', ?, ?)", s.login, hashes[s.login], id, ago(24 * 90));
    });

    // У одной работы в каждой группе срок — послезавтра: напоминание о дедлайне видно сразу
    const soon = {};
    Object.entries(PLAN).forEach(([group, list]) => {
      for (const p of list) {
        const t = TPL[p.control].find(([, kind, , f]) => f != null && (kind === 'essay' || kind === 'project') && dateAt(f) >= today);
        if (t) { soon[group] = { disc: p.id, title: t[0] }; break; }
      }
    });
    const dueOf = (group, p, title, f) => (soon[group] && soon[group].disc === p.id && soon[group].title === title ? addDays(today, 2) : f == null ? null : dateAt(f));

    // Оценки: прошлые семестры и контрольные точки текущего
    STUDENTS.forEach((st) => {
      const sid = S[st.key];
      const r = rng(st.key);
      const cur = semesterNumber(st.admission, today);
      const past = PAST[st.facId] || [];
      for (let s = 1; s < cur; s++) {
        past.slice((s - 1) * 6, s * 6).forEach(([name, control, credits]) => {
          const id = disc(name, control, credits);
          const debt = st.debt === name;
          const pts = debt ? 48 : clamp(Math.round(100 * (st.strength + (r() - 0.45) * 0.2)), 61, 100);
          store.run('INSERT OR IGNORE INTO enrollments (student_id, discipline_id, semester, final_points, status, retake_date, retake_room) VALUES (?, ?, ?, ?, ?, ?, ?)',
            sid, id, s, pts, debt ? 'debt' : 'passed', debt ? workday(addDays(today, 9)) : null, debt ? '3010' : null);
        });
      }
      (PLAN[st.group] || []).forEach((p) => {
        store.run("INSERT INTO enrollments (student_id, discipline_id, semester, teacher_id, status) VALUES (?, ?, ?, ?, 'current')", sid, p.id, cur, T[p.teacher]);
        const base = p.name === st.weak ? 0.5 : clamp(st.strength + (r() - 0.5) * 0.12, 0.55, 0.99);
        TPL[p.control].forEach(([title, kind, max, f]) => {
          const date = dueOf(st.group, p, title, f);
          const graded = date && date < today;
          const ratio = kind === 'attendance' ? clamp(base + 0.08 + (r() - 0.5) * 0.1, 0.3, 1) : clamp(base + (r() - 0.5) * 0.16, 0.2, 1);
          store.run('INSERT INTO assessments (student_id, discipline_id, semester, title, kind, max_points, points, date, graded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            sid, p.id, cur, title, kind, max, graded ? Math.round(max * ratio) : null, date, graded ? mskTime(date, '18:00') : null);
        });
      });
    });

    // Дедлайны групп: ближайшие эссе и проекты плюс общие дела
    Object.entries(PLAN).forEach(([group, list]) => {
      list.forEach((p) => {
        TPL[p.control].filter(([, kind, , f]) => f != null && ['essay', 'project', 'test'].includes(kind)).forEach(([title, kind, , f]) => {
          const d = dueOf(group, p, title, f);
          if (d >= today && daysBetween(today, d) <= 21) {
            store.run('INSERT INTO deadlines (group_code, discipline_id, title, due_at, kind, link) VALUES (?, ?, ?, ?, ?, ?)', group, p.id, `${title} · ${p.short}`, mskTime(d, '23:59'), kind, `#/grades/${p.id}`);
          }
        });
      });
      store.run('INSERT INTO deadlines (group_code, title, due_at, kind, link) VALUES (?, ?, ?, ?, ?)', group, 'Анкета «Преподаватель глазами студентов»', mskTime(addDays(today, 5), '18:00'), 'form', '#/notifications');
    });
    store.run('INSERT INTO deadlines (group_code, title, due_at, kind, link) VALUES (?, ?, ?, ?, ?)', 'МО-25-03', 'Регистрация делегатов Модели ООН', mskTime(addDays(today, 1), '18:00'), 'event', '#/campus');
    store.run('INSERT INTO deadlines (group_code, title, due_at, kind, link) VALUES (?, ?, ?, ?, ?)', 'МЭО-26-07', 'Фото на студенческий билет', mskTime(addDays(today, 2), '17:00'), 'form', '#/notifications');
    store.run('INSERT INTO deadlines (group_code, title, due_at, kind, link) VALUES (?, ?, ?, ?, ?)', 'МП-23-02', 'Согласовать тему ВКР с научным руководителем', mskTime(addDays(today, 10), '18:00'), 'form', '#/notifications');

    // Изменения расписания на ближайшие дни + уведомления группе
    const change = (group, key, type, opts, hoursAgo) => {
      const l = L[key];
      if (!l) return;
      const date = nextOccurrence(l, addDays(today, opts.offset || 0));
      if (!date) return;
      const newDate = opts.moveDays ? workday(addDays(date, opts.moveDays)) : null;
      store.run(
        `INSERT INTO schedule_changes (group_code, date, pair, type, lesson_id, discipline_id, kind, new_date, new_pair, room, teacher_id, reason, author, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        group, date, l.pair, type, type === 'extra' ? null : l.id, opts.discipline || null, opts.kind || null, newDate, opts.newPair || null, opts.room || null,
        opts.teacher ? T[opts.teacher] : null, opts.reason, 'Учебный офис', ago(hoursAgo),
      );
      const d = new Date(date + 'T12:00:00Z').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short', timeZone: 'UTC' });
      const name = key.split('|')[1];
      const text = {
        room: `${name}, ${d}: аудитория ${opts.room} вместо ${l.room}`,
        cancel: `${name}, ${d}: пара отменена`,
        move: `${name}: перенос с ${d} на ${newDate && new Date(newDate + 'T12:00:00Z').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short', timeZone: 'UTC' })}, ${opts.newPair} пара`,
        teacher: `${name}, ${d}: замена преподавателя`,
      }[type];
      notify(store, { audience: 'group', audienceId: group, kind: 'schedule', important: type === 'cancel' || type === 'move' ? 1 : 0, title: text, body: opts.reason, link: `#/schedule/${date}/${l.pair}`, author: 'Учебный офис', at: ago(hoursAgo) });
    };
    change('МО-25-03', 'МО-25-03|Теория МО|lecture', 'room', { room: '3047', reason: 'В ауд. 1023 меняют проектор' }, 3);
    change('МО-25-03', 'МО-25-03|Английский|language', 'teacher', { teacher: 'melnikova', reason: 'Кларк А. В. на стажировке — занятие проведёт Мельникова С. И.' }, 20);
    change('МО-25-03', 'МО-25-03|Мировая эк.|lecture', 'cancel', { offset: 1, reason: 'Преподаватель на конференции. Пару перенесут — следите за изменениями' }, 6);
    change('МО-25-03', 'МО-25-03|МПП|seminar', 'move', { offset: 1, moveDays: 4, newPair: 5, room: '3008', reason: 'По просьбе преподавателя' }, 26);
    const hist = L['МО-25-03|История МО|seminar'];
    if (hist) {
      const d = nextOccurrence({ weekday: 4, parity: 'all' }, addDays(today, 1));
      store.run(`INSERT INTO schedule_changes (group_code, date, pair, type, discipline_id, kind, room, teacher_id, reason, author, created_at) VALUES (?, ?, 6, 'extra', ?, 'consult', '2007', ?, ?, 'Учебный офис', ?)`,
        'МО-25-03', d, PLAN['МО-25-03'][0].id, T.sokolov, 'Консультация перед контрольной по истории МО', ago(8));
      notify(store, { audience: 'group', audienceId: 'МО-25-03', kind: 'schedule', title: 'Дополнительная консультация по истории МО', body: `${new Date(d + 'T12:00:00Z').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'UTC' })}, 6 пара, ауд. 2007`, link: `#/schedule/${d}/6`, author: 'Соколов П. А.', at: ago(8) });
    }
    change('МЭО-26-07', 'МЭО-26-07|Математика|seminar', 'room', { room: '1050', reason: 'Аудитория 1044 занята под олимпиаду' }, 5);
    change('МЭО-26-07', 'МЭО-26-07|Эк. история|lecture', 'cancel', { offset: 1, reason: 'Пара переносится на консультацию перед зачётом' }, 30);
    change('МП-23-02', 'МП-23-02|МЧП|seminar', 'move', { offset: 0, moveDays: 2, newPair: 4, room: '3015', reason: 'Совпадение с деловой игрой по арбитражу' }, 12);
    change('МП-23-02', 'МП-23-02|Право МО|seminar', 'room', { room: '3046', reason: 'Занятие пройдёт в зале моделирования' }, 2);

    // Новости деканатов и вуза
    const N = (audience, audienceId, kind, title, body, link, hoursAgo, important, author) => notify(store, { audience, audienceId, kind, title, body, link, important, author, at: ago(hoursAgo) });
    N('all', null, 'news', 'Зимняя сессия: опубликовано расписание экзаменов', 'Даты, аудитории и консультации — в разделе «Успеваемость» → «Сессия». Допуск виден там же', '#/grades/session', 50, 1, 'Учебное управление');
    N('all', null, 'news', 'Справки теперь онлайн — за день', 'Справку об обучении можно заказать в кабинете: электронная придёт с кодом для проверки подлинности', '#/requests/new/study', 150, 0, 'Деканаты');
    N('all', null, 'news', 'Открыт приём заявок на обмен — весна 2027', 'Подайте заявку в разделе «Заявки». Понадобится выписка оценок на английском — её тоже можно заказать онлайн', '#/requests/new/exchange', 75, 0, 'Отдел академической мобильности');
    N('all', null, 'news', 'Модель ООН: регистрация делегатов', `Комитеты Совбеза, ЭКОСОС и МАГАТЭ. Регистрация открыта до ${new Date(addDays(today, 1) + 'T12:00:00Z').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' })}, 18:00`, '#/campus', 20, 0, 'Клуб «Модель ООН»');
    N('faculty', 'mo', 'news', 'Встреча с деканом для 2 курса', `${new Date(workday(addDays(today, 3)) + 'T12:00:00Z').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' })} в 15:20, ауд. 1001. Вопросы можно прислать заранее`, '#/notifications', 5, 0, 'Деканат МО');
    N('group', 'МО-25-03', 'news', 'Арабский язык: занятия весь ноябрь — в ауд. 4031', 'Кафедра закрепила за группой аудиторию на четвёртом этаже', '#/schedule', 60, 0, 'Кафедра востоковедения');
    N('faculty', 'meo', 'news', 'Посвящение в студенты МЭО', 'В субботу в 15:00, актовый зал. Первокурсники, ждём всех!', '#/notifications', 30, 0, 'Студсовет МЭО');
    N('faculty', 'mp', 'news', '4 курс: темы ВКР — до конца месяца', 'Тему нужно согласовать с научным руководителем и подтвердить в деканате', '#/notifications', 26, 1, 'Деканат МП');

    // Персональные: новые оценки и приветствие
    STUDENTS.forEach((st) => {
      const sid = S[st.key];
      const last = store.get('SELECT a.*, d.short FROM assessments a JOIN disciplines d ON d.id = a.discipline_id WHERE a.student_id = ? AND a.points IS NOT NULL ORDER BY a.date DESC LIMIT 1', sid);
      if (last) N('student', sid, 'grade', `Новая оценка: ${last.title} · ${last.short}`, `${last.points} из ${last.max_points} баллов`, `#/grades/${last.discipline_id}`, 18, 0, 'Электронный журнал');
    });
    N('student', S.timur, 'system', 'Добро пожаловать в МГИМО Манию!', 'Пройдите «Первые шаги» на главной — за весь чек-лист 200 М-коинов', '#/home', 1, 0, 'Кабинет');

    // Заявки с историей статусов
    const facOf = (sid) => store.get('SELECT f.* FROM students s JOIN groups g ON g.code = s.group_code JOIN faculties f ON f.id = g.faculty_id WHERE s.id = ?', sid);
    let seq = 1200;
    const request = (sid, type, title, payload, delivery, events, opts = {}) => {
      seq++;
      const created = events[0][1];
      const status = events[events.length - 1][0];
      const id = store.insert(
        `INSERT INTO requests (number, student_id, type, title, payload, delivery, status, created_at, updated_at, due_at, plan, verify_code, dean_comment)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
        `${today.slice(0, 4)}/${String(seq).padStart(5, '0')}`, sid, type, title, JSON.stringify(payload), delivery, status, created, events[events.length - 1][1],
        opts.due || created + 2 * DAY, ['study', 'visa', 'transcript', 'stipend', 'military'].includes(type) ? randomBytes(4).toString('hex').toUpperCase() : null, opts.comment || null,
      );
      events.forEach(([st, at, comment, actor]) => store.run('INSERT INTO request_events (request_id, status, comment, actor, created_at) VALUES (?, ?, ?, ?, ?)', id, st, comment || null, actor || (st === 'submitted' ? 'Вы' : 'Деканат'), at));
      return id;
    };
    const fac = facOf(S.alina);
    request(S.alina, 'study', 'Справка об обучении', { lang: 'ru', place: 'По месту работы мамы', copies: 1 }, 'electronic', [
      ['submitted', ago(74), 'Электронная справка придёт сюда — с кодом для проверки'], ['in_work', ago(72), 'Специалист деканата взял заявку в работу'], ['ready', ago(69), 'Демонстрационная справка готова — можно скачать и проверить по коду'],
    ]);
    request(S.alina, 'visa', 'Справка для посольства', { lang: 'en', country: 'Сербия', dates: '14–21 января' }, 'paper', [
      ['submitted', ago(20), `Оригинал можно будет забрать: Деканат ${fac.short}, ауд. ${fac.dean_office}`], ['in_work', ago(18), 'Готовим справку на английском, подпись декана — завтра'],
    ], { due: now + 28 * 36e5 });
    request(S.alina, 'absence', 'Пропуск по уважительной причине', { from: addDays(today, -16), to: addDays(today, -15), reason: 'Олимпиада или конференция', note: 'Межвузовская конференция по востоковедению' }, 'none', [
      ['submitted', ago(16 * 24 + 5), 'Заявление отправлено в деканат'], ['in_work', ago(16 * 24 + 3), 'Заявление зарегистрировано'], ['approved', ago(16 * 24 - 2), 'Согласовано. Преподаватели предупреждены', 'Белова И. В.'],
    ], { comment: 'Согласовано. Преподаватели предупреждены' });
    request(S.ksenia, 'transcript', 'Выписка оценок', { lang: 'en', purpose: 'Программа обмена' }, 'electronic', [
      ['submitted', ago(26), 'Электронная справка придёт сюда — с кодом для проверки'], ['in_work', ago(23), 'Сверяем оценки за шесть семестров'],
    ], { due: now + 2 * DAY });
    request(S.ksenia, 'exchange', 'Программа обмена', { partner: 'Франция · Париж', term: 'Весна 2027', motivation: 'Хочу изучать международный коммерческий арбитраж на практике и улучшить профессиональный французский' }, 'none', [
      ['submitted', ago(98), 'Заявление отправлено в деканат'], ['in_work', ago(90), 'Заявка передана в отдел академической мобильности. Решение комиссии — до 1 декабря'],
    ], { due: now + 14 * DAY });
    request(S.ksenia, 'stipend', 'Справка о стипендии', { lang: 'ru' }, 'paper', [
      ['submitted', ago(35 * 24), 'Оригинал можно будет забрать в деканате'], ['in_work', ago(35 * 24 - 3)], ['ready', ago(34 * 24), 'Справка готова — заберите оригинал в деканате'], ['issued', ago(33 * 24), 'Выдана лично'],
    ]);
    // Очередь деканата МО: заявки однокурсников ждут решения
    request(extra[0], 'study', 'Справка об обучении', { lang: 'ru', place: 'В банк для оформления карты', copies: 2 }, 'paper', [['submitted', ago(0.7), null, 'Студент']]);
    request(extra[1], 'visa', 'Справка для посольства', { lang: 'en', country: 'ОАЭ', dates: '2–9 февраля' }, 'electronic', [['submitted', ago(3), null, 'Студент'], ['in_work', ago(2.5)]]);
    request(extra[2], 'absence', 'Пропуск по уважительной причине', { from: addDays(today, 1), to: addDays(today, 3), reason: 'Спортивные соревнования', note: 'Чемпионат вузов по волейболу' }, 'none', [['submitted', ago(2), null, 'Студент']]);
    request(extra[3], 'transcript', 'Выписка оценок', { lang: 'ru', purpose: 'Стажировка' }, 'paper', [['submitted', ago(30), null, 'Студент'], ['in_work', ago(28)], ['ready', ago(22), 'Справка готова — заберите оригинал в деканате']]);
    request(extra[4], 'aid', 'Материальная помощь', { reason: 'Лечение', details: 'Нужна операция на колене после спортивной травмы, часть расходов не покрывает полис' }, 'none', [['submitted', ago(5), null, 'Студент']], { due: now + 10 * DAY });
    store.meta('seq_requests', seq);

    // Игровые профили
    STUDENTS.forEach((st) => {
      const s = playDefaults(st.play);
      if (st.play.coins) s.history = [{ t: ago(30), title: 'Забег «Бегом на пару»', amt: 24 }, { t: ago(74), title: 'Фокус-сессия 25 минут', amt: 10 }, { t: ago(200), title: 'Кампус: Библиотека', amt: 20 }];
      store.run('INSERT INTO play_state (student_id, state, updated_at) VALUES (?, ?, ?)', S[st.key], JSON.stringify(s), now);
    });

    store.meta('seeded_at', now);
    store.meta('last_activity', now);
  });
}
