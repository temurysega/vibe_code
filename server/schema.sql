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

