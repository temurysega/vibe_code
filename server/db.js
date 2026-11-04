// Хранилище на встроенном node:sqlite. Подготовленные запросы кешируются,
// параметры передаются только через плейсхолдеры — SQL-инъекции исключены.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ROOT } from './config.js';

// Таблицы с данными демо: очищаются при пересоздании стенда (порядок важен из-за внешних ключей)
export const DATA_TABLES = [
  'notification_reads', 'notifications', 'request_events', 'requests', 'game_runs', 'play_state',
  'sessions', 'users', 'deadlines', 'exams', 'assessments', 'enrollments', 'schedule_changes',
  'lessons', 'disciplines', 'teachers', 'staff', 'students', 'groups', 'faculties', 'audit_log',
];

