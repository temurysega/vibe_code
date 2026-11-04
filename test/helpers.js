// Тестовый стенд: приложение на свободном порту и база в памяти — реальные данные не задеваются.
import { createServer } from 'node:http';

process.env.DB_FILE = ':memory:';

export async function startApp() {
  const { Store } = await import('../server/db.js');
  const { seed } = await import('../server/seed/seed.js');
  const { createApp } = await import('../server/app.js');
  const store = new Store(':memory:');
  await seed(store);
  const server = createServer(createApp(store));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { store, base, close: () => new Promise((r) => server.close(r)) };
}

