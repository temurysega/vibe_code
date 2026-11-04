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

