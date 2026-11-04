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

export class Store {
  constructor(file) {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.cache = new Map();
    this.db.exec('PRAGMA foreign_keys = ON;');
    if (file !== ':memory:') this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
    this.db.exec(readFileSync(resolve(ROOT, 'server/schema.sql'), 'utf8'));
  }

  st(sql) {
    let s = this.cache.get(sql);
    if (!s) { s = this.db.prepare(sql); this.cache.set(sql, s); }
    return s;
  }
  get(sql, ...params) { return this.st(sql).get(...params) || null; }
  all(sql, ...params) { return this.st(sql).all(...params); }
  run(sql, ...params) { return this.st(sql).run(...params); }
  insert(sql, ...params) { return Number(this.st(sql).run(...params).lastInsertRowid); }

  // Транзакция: всё или ничего
  tx(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const out = fn();
      this.db.exec('COMMIT');
      return out;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  meta(key, value) {
    if (value === undefined) return (this.get('SELECT value FROM meta WHERE key = ?', key) || {}).value ?? null;
    this.run('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, String(value));
    return value;
  }

  wipe() {
    this.tx(() => { DATA_TABLES.forEach((t) => this.db.exec(`DELETE FROM ${t}`)); });
  }

