// Настройки сервера. Всё берётся из окружения: ключи и пароли сервисов не лежат в коде.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// .env читается встроенным загрузчиком Node — без сторонних пакетов
const envFile = resolve(ROOT, '.env');
if (existsSync(envFile) && typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(envFile); } catch (e) { console.warn('Не удалось прочитать .env:', e.message); }
}

