// Хранилище на встроенном node:sqlite. Подготовленные запросы кешируются,
// параметры передаются только через плейсхолдеры — SQL-инъекции исключены.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ROOT } from './config.js';

