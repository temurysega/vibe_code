// Замер нагрузки на ЛОКАЛЬНОМ сервере: N одновременных пользователей без пауз открывают экраны кабинета.
// Не для публичного стенда — адрес должен быть 127.0.0.1 или localhost.
// Запуск: сервер с временной базой (как в AGENTS.md), затем
//   node scripts/load-test.mjs --base http://127.0.0.1:3400 --users 50 --seconds 20 [--cabinets 10] [--out файл.json]
// Каждый виртуальный студент входит один раз и по кругу запрашивает главную, расписание, оценки,
// уведомления и заявки; виртуальный сотрудник деканата — очередь. Пауз между запросами нет:
// это верхняя граница нагрузки, а не модель поведения людей.
// --cabinets N — для сервера с DEMO_SANDBOXES=1: во время нагрузки N новых проверяющих входят впервые,
// и для каждого создаётся демо-кабинет; их время входа считается отдельно.
import { writeFileSync } from 'node:fs';
import { cpus, totalmem } from 'node:os';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const base = arg('base', 'http://127.0.0.1:3000').replace(/\/$/, '');
const users = Number(arg('users', 20));
const seconds = Number(arg('seconds', 15));
const out = arg('out', null);
const cabinets = Number(arg('cabinets', 0));
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname)) {
  console.error('Только локальный сервер: этот скрипт не запускают против публичного стенда.');
  process.exit(2);
}

const STUDENT = ['/api/home', '/api/schedule', '/api/grades', '/api/notifications', '/api/requests'];
const DEAN = ['/api/dean/overview', '/api/dean/requests?status=active'];
const LOGINS = ['a.morozova', 't.aliev', 'k.lebedeva'];

// Вход; jar — уже полученные cookie (например, демо-кабинета). Возвращает cookie после входа.
async function login(account, jar = '') {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base, ...(jar ? { Cookie: jar } : {}) },
    body: JSON.stringify({ login: account, password: 'mgimo2026' }),
  });
  if (res.status !== 200) throw new Error(`Вход ${account}: ${res.status}`);
  const cookies = new Map(jar.split('; ').filter(Boolean).map((c) => [c.split('=')[0], c]));
  (res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')])
    .filter(Boolean).map((c) => c.split(';')[0]).forEach((c) => cookies.set(c.split('=')[0], c));
  await res.arrayBuffer();
  return [...cookies.values()].join('; ');
}
// Только cookie демо-кабинета: следующий вход — новый сеанс в том же кабинете
const cabinetOnly = (jar) => jar.split('; ').filter((c) => /^(__Host-)?mm_demo=/.test(c)).join('; ');

const samples = new Map();
let errors = 0;
const errorKinds = new Map();
function record(path, ms, ok, status) {
  const key = path.replace(/\?.*$/, '');
  if (!samples.has(key)) samples.set(key, []);
  samples.get(key).push(ms);
  if (!ok) {
    errors++;
    errorKinds.set(`${key} → ${status}`, (errorKinds.get(`${key} → ${status}`) || 0) + 1);
  }
}

async function worker(cookie, paths, until) {
  let i = 0;
  while (performance.now() < until) {
    const path = paths[i++ % paths.length];
    const t = performance.now();
    let status = 0;
    try {
      const res = await fetch(base + path, { headers: { Cookie: cookie, Accept: 'application/json' } });
      status = res.status;
      await res.arrayBuffer();
    } catch (e) { status = 'network'; }
    record(path, performance.now() - t, status === 200, status);
  }
}

const pct = (list, p) => {
  const s = list.slice().sort((a, b) => a - b);
  return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] * 10) / 10 : null;
};

// Пароль mgimo2026 — публичный тестовый пароль вымышленных аккаунтов (README, JURY_GUIDE)
const first = await login(LOGINS[0]);
const studentCookies = [first];
for (const account of LOGINS.slice(1)) studentCookies.push(await login(account, cabinetOnly(first)));
const deanCookie = await login('dekanat.mo', cabinetOnly(first));

const started = performance.now();
const until = started + seconds * 1000;
const jobs = [];
for (let u = 0; u < users; u++) {
  // Каждый десятый виртуальный пользователь — сотрудник деканата
  if (u % 10 === 9) jobs.push(worker(deanCookie, DEAN, until));
  else jobs.push(worker(studentCookies[u % studentCookies.length], STUDENT.slice(u % STUDENT.length).concat(STUDENT.slice(0, u % STUDENT.length)), until));
}
// Новые проверяющие во время нагрузки: первый вход создаёт и наполняет демо-кабинет
const firstSignIns = [];
if (cabinets > 0) {
  jobs.push((async () => {
    for (let k = 0; k < cabinets; k++) {
      await new Promise((r) => setTimeout(r, (seconds * 1000) / (cabinets + 1)));
      const t = performance.now();
      try { await login(LOGINS[k % LOGINS.length]); firstSignIns.push(performance.now() - t); } catch (e) { errors++; errorKinds.set(`first sign-in → ${e.message}`, (errorKinds.get(`first sign-in → ${e.message}`) || 0) + 1); }
    }
  })());
}
await Promise.all(jobs);
const elapsed = (performance.now() - started) / 1000;

const all = [...samples.values()].flat();
const summary = {
  measured_at: new Date().toISOString(),
  base, users, seconds,
  machine: { cpu: cpus()[0] && cpus()[0].model, cores: cpus().length, memory_gb: Math.round(totalmem() / 2 ** 30), node: process.version },
  requests: all.length,
  requests_per_second: Math.round(all.length / elapsed),
  errors,
  error_kinds: Object.fromEntries(errorKinds),
  latency_ms: { p50: pct(all, 50), p95: pct(all, 95), p99: pct(all, 99), max: pct(all, 100) },
  by_endpoint: Object.fromEntries([...samples].map(([path, list]) => [path, { requests: list.length, p50: pct(list, 50), p95: pct(list, 95) }])),
  ...(cabinets ? { new_cabinets: { created: firstSignIns.length, first_sign_in_ms: { p50: pct(firstSignIns, 50), max: pct(firstSignIns, 100) } } } : {}),
};
console.log(JSON.stringify(summary, null, 2));
if (out) writeFileSync(out, JSON.stringify(summary, null, 2) + '\n');
