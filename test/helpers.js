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

// Клиент с собственной cookie-сессией и CSRF-токеном
export function client(base) {
  const c = { cookie: '', csrf: '' };
  c.req = async (method, path, body, headers = {}) => {
    const h = Object.assign({ Accept: 'application/json' }, headers);
    if (c.cookie) h.Cookie = c.cookie;
    if (method !== 'GET' && c.csrf && !('X-CSRF-Token' in headers)) h['X-CSRF-Token'] = c.csrf;
    if (body !== undefined) h['Content-Type'] = 'application/json';
    const res = await fetch(base + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    const set = res.headers.get('set-cookie');
    if (set) c.cookie = set.split(';')[0];
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    return { status: res.status, data, headers: res.headers };
  };
  c.login = async (login, password = 'mgimo2026') => {
    const r = await c.req('POST', '/api/auth/login', { login, password });
    if (r.data && r.data.csrf) c.csrf = r.data.csrf;
    return r;
  };
  return c;
}
