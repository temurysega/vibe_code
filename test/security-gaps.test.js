// Пробелы безопасности, найденные сверкой модели угроз (П-08): ключи в истории Git и боевая cookie.
// Внедрение разметки проверяет браузерный сценарий test/browser-xss.py.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { startApp, client } from './helpers.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Ключи OpenRouter и Anthropic: префикс и длинный хвост. Примеры вроде `sk-or-v1-...` не подходят.
const KEY_PATTERNS = [/sk-or-v1-[A-Za-z0-9]{20,}/, /sk-ant-[A-Za-z0-9_-]{20,}/];

function gitHistoryAvailable() {
  const probe = spawnSync('git', ['rev-parse', '--git-dir'], { cwd: ROOT, encoding: 'utf8' });
  return probe.status === 0 ? '' : 'git или история репозитория недоступны — проверка истории на ключи пропущена';
}

test('в истории Git нет ключей OpenRouter и Anthropic', { skip: gitHistoryAvailable() || false, timeout: 120_000 }, async () => {
  const git = spawn('git', ['log', '-p', '--all', '--no-color', '--no-ext-diff'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] });
  const exit = new Promise((done) => git.on('close', done));
  const found = new Map(); // коммит → число совпадений; сами значения не сохраняются и не печатаются
  let commit = 'без коммита';
  let lines = 0;
  for await (const line of createInterface({ input: git.stdout, crlfDelay: Infinity })) {
    lines += 1;
    if (line.startsWith('commit ')) commit = line.slice(7, 19);
    else if (KEY_PATTERNS.some((re) => re.test(line))) found.set(commit, (found.get(commit) || 0) + 1);
  }
  assert.equal(await exit, 0, 'git log завершился с ошибкой');
  assert.ok(lines > 0, 'история Git пуста — проверять нечего');
  assert.deepEqual([...found], [], `в истории найдены строки, похожие на ключи ИИ-провайдера (значения скрыты); коммиты: ${[...found.keys()].join(', ')}`);
});

test('боевая cookie: __Host-mm_sid с Secure, HttpOnly, SameSite=Lax, Path=/ и без Domain', async () => {
  const { config } = await import('../server/config.js');
  const before = config.cookieSecure;
  const app = await startApp();
  try {
    config.cookieSecure = true;
    const c = client(app.base);
    const res = await c.login('a.morozova');
    assert.equal(res.status, 200);
    const cookie = res.headers.get('set-cookie');
    assert.match(cookie, /^__Host-mm_sid=[A-Za-z0-9_-]{20,};/);
    const attributes = cookie.split(';').slice(1).map((x) => x.trim().toLowerCase());
    for (const need of ['secure', 'httponly', 'samesite=lax', 'path=/']) assert.ok(attributes.includes(need), `нет атрибута ${need}`);
    assert.ok(!attributes.some((x) => x.startsWith('domain')), 'у __Host- cookie не должно быть Domain');
    // Выход очищает ту же cookie с теми же атрибутами
    const out = await c.req('POST', '/api/auth/logout', {});
    const cleared = out.headers.get('set-cookie') || '';
    assert.match(cleared, /^__Host-mm_sid=;/);
    assert.match(cleared, /Secure/);
    assert.match(cleared, /Max-Age=0/);
  } finally {
    config.cookieSecure = before;
    await app.close();
  }
});
