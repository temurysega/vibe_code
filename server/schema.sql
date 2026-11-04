-- Схема демо-стенда «МГИМО Мания». Все данные вымышленные.
-- Для продакшена та же схема переносится в PostgreSQL без изменения логики запросов.

-- Справочник факультетов и контактов деканатов
CREATE TABLE IF NOT EXISTS faculties (
  id TEXT PRIMARY KEY,
  short TEXT NOT NULL,
  name TEXT NOT NULL,
  dean_office TEXT NOT NULL,
  hours TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL
);

-- Учебные группы: курс, направление и профиль
CREATE TABLE IF NOT EXISTS groups (
  code TEXT PRIMARY KEY,
  faculty_id TEXT NOT NULL REFERENCES faculties(id),
  course INTEGER NOT NULL,
  program TEXT NOT NULL,
  profile TEXT NOT NULL,
  curator TEXT
);

-- Студенты: только учебные данные, без паспортов и СНИЛС
CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY,
  last_name TEXT NOT NULL,
  first_name TEXT NOT NULL,
  middle_name TEXT,
  gender TEXT NOT NULL CHECK (gender IN ('f', 'm')),
  group_code TEXT NOT NULL REFERENCES groups(code),
  record_book TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  study_form TEXT NOT NULL,
  funding TEXT NOT NULL,
  languages TEXT NOT NULL,
  admission_year INTEGER NOT NULL,
  scholarship TEXT
);

-- Сотрудники деканатов: видят заявки только своего факультета
CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY,
  full_name TEXT NOT NULL,
  position TEXT NOT NULL,
  faculty_id TEXT NOT NULL REFERENCES faculties(id)
);

-- Учётные записи. Пароль хранится только как хеш scrypt с солью
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  login TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student', 'dean')),
  student_id INTEGER REFERENCES students(id),
  staff_id INTEGER REFERENCES staff(id),
  created_at INTEGER NOT NULL,
  password_changed_at INTEGER,
  last_login_at INTEGER
);

-- Сессии: в базе лежит SHA-256 от токена, сам токен знает только браузер
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  ip TEXT,
  ua TEXT
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

-- Преподаватели и дисциплины
CREATE TABLE IF NOT EXISTS teachers (
  id INTEGER PRIMARY KEY,
  full_name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  title TEXT,
  department TEXT NOT NULL,
  email TEXT NOT NULL,
  office_hours TEXT
);

CREATE TABLE IF NOT EXISTS disciplines (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  short TEXT NOT NULL,
  control TEXT NOT NULL CHECK (control IN ('exam', 'credit', 'graded')),
  credits INTEGER NOT NULL,
  color TEXT NOT NULL
);

-- Регулярное расписание группы: день недели, пара, чётность недели
CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY,
  group_code TEXT NOT NULL REFERENCES groups(code),
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 6),
  pair INTEGER NOT NULL CHECK (pair BETWEEN 1 AND 7),
  parity TEXT NOT NULL DEFAULT 'all' CHECK (parity IN ('all', 'odd', 'even')),
  discipline_id INTEGER NOT NULL REFERENCES disciplines(id),
  kind TEXT NOT NULL,
  room TEXT NOT NULL,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id),
  subgroup TEXT
);
CREATE INDEX IF NOT EXISTS lessons_group ON lessons(group_code, weekday, pair);

-- Изменения расписания: отмена, перенос, замена аудитории или преподавателя, дополнительная пара
CREATE TABLE IF NOT EXISTS schedule_changes (
  id INTEGER PRIMARY KEY,
  group_code TEXT NOT NULL REFERENCES groups(code),
  date TEXT NOT NULL,
  pair INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('cancel', 'room', 'teacher', 'move', 'extra')),
  lesson_id INTEGER REFERENCES lessons(id),
  discipline_id INTEGER REFERENCES disciplines(id),
  kind TEXT,
  new_date TEXT,
  new_pair INTEGER,
  room TEXT,
  teacher_id INTEGER REFERENCES teachers(id),
  reason TEXT,
  author TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS changes_group ON schedule_changes(group_code, date);

-- Дисциплины студента по семестрам и итоговые баллы закрытых семестров
CREATE TABLE IF NOT EXISTS enrollments (
  student_id INTEGER NOT NULL REFERENCES students(id),
  discipline_id INTEGER NOT NULL REFERENCES disciplines(id),
  semester INTEGER NOT NULL,
  teacher_id INTEGER REFERENCES teachers(id),
  final_points INTEGER,
  status TEXT NOT NULL DEFAULT 'current' CHECK (status IN ('current', 'passed', 'debt')),
  retake_date TEXT,
  retake_room TEXT,
  PRIMARY KEY (student_id, discipline_id, semester)
);

-- Контрольные точки балльно-рейтинговой системы
CREATE TABLE IF NOT EXISTS assessments (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id),
  discipline_id INTEGER NOT NULL REFERENCES disciplines(id),
  semester INTEGER NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  max_points INTEGER NOT NULL,
  points INTEGER,
  date TEXT,
  graded_at INTEGER
);
CREATE INDEX IF NOT EXISTS assessments_student ON assessments(student_id, semester);

-- Расписание сессии и консультаций
CREATE TABLE IF NOT EXISTS exams (
  id INTEGER PRIMARY KEY,
  group_code TEXT NOT NULL REFERENCES groups(code),
  discipline_id INTEGER NOT NULL REFERENCES disciplines(id),
  kind TEXT NOT NULL CHECK (kind IN ('exam', 'credit', 'graded', 'consult')),
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  room TEXT NOT NULL,
  teacher_id INTEGER REFERENCES teachers(id)
);

