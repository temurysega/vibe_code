// Точка входа: открывает базу, наполняет демо-данными и запускает HTTP-сервер.
import { createServer } from 'node:http';
import { config } from './config.js';
import { Store } from './db.js';
import { createApp } from './app.js';
import { seed } from './seed/seed.js';
import { applyPlans } from './domain/requests.js';
import { perAccount, perIp } from './routes/auth.js';

const store = new Store(config.dbFile);

// Стенд пересоздаётся, если данные устарели, а им никто не пользуется полчаса
let lastActivity = Number(store.meta('last_activity') || 0);
async function maybeReseed(force) {
  const seededAt = Number(store.meta('seeded_at') || 0);
  const stale = Date.now() - seededAt > config.demoReseedHours * 36e5;
  const idle = Date.now() - lastActivity > 30 * 60e3;
  if (force || !seededAt || (stale && idle)) {
    await seed(store);
    lastActivity = Date.now();
    console.log('Демо-данные созданы заново');
  }
}

await maybeReseed(false);

const app = createApp(store, {
  onActivity() {
    const now = Date.now();
    if (now - lastActivity > 60e3) { lastActivity = now; store.meta('last_activity', now); }
  },
});

const server = createServer(app);
server.headersTimeout = 20e3;
server.requestTimeout = 30e3;
server.listen(config.port, config.host, () => {
  console.log(`МГИМО Мания (демо) — http://localhost:${config.port}`);
  if (!config.anthropicKey) console.log('ИИ-помощник работает по правилам: ANTHROPIC_API_KEY не задан');
});

// Фоновые задачи: автоматические шаги заявок демо, чистка лимитов и пересоздание стенда
const timers = [
  setInterval(() => { try { applyPlans(store); } catch (e) { console.error(e); } }, 5000),
  setInterval(() => { perAccount.sweep(); perIp.sweep(); store.run('DELETE FROM sessions WHERE expires_at < ?', Date.now()); }, 10 * 60e3),
  setInterval(() => { maybeReseed(false).catch((e) => console.error(e)); }, 10 * 60e3),
];

function shutdown() {
  timers.forEach(clearInterval);
  server.close(() => { store.close(); process.exit(0); });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
