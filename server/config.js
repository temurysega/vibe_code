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

const env = process.env;
const num = (v, fallback) => (Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : fallback);
const production = env.NODE_ENV === 'production';

export const config = {
  port: num(env.PORT, 3000),
  host: env.HOST || '0.0.0.0',
  production,
  dbFile: env.DB_FILE === ':memory:' ? ':memory:' : resolve(ROOT, env.DB_FILE || 'data/mgimo.db'),
  publicDir: resolve(ROOT, 'public'),
  // Secure-cookie включается в продакшене; локально по http оно бы не сохранилось
  cookieSecure: env.COOKIE_SECURE != null ? env.COOKIE_SECURE === '1' : production,
  sessionTtlHours: num(env.SESSION_TTL_HOURS, 12),
  sessionIdleHours: num(env.SESSION_IDLE_HOURS, 2),
  trustProxy: env.TRUST_PROXY === '1',
  openrouterKey: env.OPENROUTER_API_KEY || '',
  openrouterModel: env.OPENROUTER_MODEL || 'openrouter/free',
  aiTimeoutMs: Math.min(30_000, Math.max(1000, num(env.AI_TIMEOUT_MS, 15_000))),
  anthropicKey: env.ANTHROPIC_API_KEY || '',
  anthropicModel: env.ANTHROPIC_MODEL || 'claude-opus-5-5',
  demoReseedHours: num(env.DEMO_RESEED_HOURS, 0),
  // Скорость демо-автоматики заявок: 1 — как на стенде (готовность справки ≈ 8 минут),
  // меньше 1 — быстрее, например 0.15 для браузерных проверок без участия деканата.
  demoAutopilotScale: Math.min(1, Math.max(0.01, num(env.DEMO_AUTOPILOT_SCALE, 1))),
  timeZone: 'Europe/Moscow',
  // Отдельный демо-кабинет для каждого проверяющего (стенд): своя база на постоянном томе
  demoSandboxes: env.DEMO_SANDBOXES === '1',
  sandboxDir: env.SANDBOX_DIR ? resolve(ROOT, env.SANDBOX_DIR) : resolve(env.DB_FILE && env.DB_FILE !== ':memory:' ? dirname(resolve(ROOT, env.DB_FILE)) : resolve(ROOT, 'data'), 'sandboxes'),
  sandboxLimit: num(env.SANDBOX_LIMIT, 400),
  sandboxTtlDays: num(env.SANDBOX_TTL_DAYS, 30),
};
