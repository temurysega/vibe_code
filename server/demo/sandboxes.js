// Отдельный демо-кабинет для каждого проверяющего: своя SQLite с теми же вымышленными данными.
// Заявки, объявления, прочитанные уведомления и сеансы одного кабинета не видны в другом,
// а файл кабинета лежит на постоянном томе и переживает перезапуск сервера.
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readdirSync, statSync, rmSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';
import { Store } from '../db.js';
import { seed } from '../seed/seed.js';
import { fail } from '../http/router.js';
import { RateLimiter } from '../security/rateLimit.js';
import { appendCookie } from '../security/session.js';

// Алфавит base32: a–z и 2–7 (собран программно, без длинного литерала)
const ALPHA = Array.from({ length: 26 }, (_, i) => String.fromCharCode(97 + i)).join('') + '234567';
const ID = /^[a-z2-7]{16}$/;
const FILE = /^([a-z2-7]{16})\.db$/;
// Черновик кабинета, который ещё наполняется: `<код>.db.new` и его журналы
const DRAFT = /^[a-z2-7]{16}\.db\.new(?:-wal|-shm)?$/;

// 80 случайных бит в base32: код кабинета нельзя угадать перебором
export function sandboxId() {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of randomBytes(10)) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += ALPHA[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  return out;
}

export const validSandboxId = (id) => typeof id === 'string' && ID.test(id);
export const demoCookieName = () => (config.cookieSecure ? '__Host-mm_demo' : 'mm_demo');
export const demoCookie = (id, days = config.sandboxTtlDays) =>
  `${demoCookieName()}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.round(days * 86400)}${config.cookieSecure ? '; Secure' : ''}`;

export class Sandboxes {
  constructor({ dir, limit = config.sandboxLimit, ttlDays = config.sandboxTtlDays, maxOpen = 40, perIpPerHour = 20, closeDelayMs = 30e3 }) {
    this.dir = dir;
    this.limit = limit;
    this.ttl = ttlDays * 864e5;
    this.maxOpen = maxOpen;
    this.closeDelayMs = closeDelayMs;
    this.open = new Map();
    // Кабинеты, которые сейчас наполняются: параллельные входы с одним кодом ждут одно создание
    this.creating = new Map();
    // Вытесненные базы: закрываются с задержкой, когда запросы, уже получившие их, закончатся
    this.retired = new Map();
    // Новый кабинет: не больше perIpPerHour в час с одного адреса, иначе стенд можно засыпать файлами
    this.creation = new RateLimiter({ windowMs: 60 * 60e3, max: perIpPerHour });
    mkdirSync(dir, { recursive: true });
    // Указатель «код проверки справки → кабинет»: ссылка проверки не несёт кода кабинета и не открывает его
    this.codes = new DatabaseSync(join(dir, 'verify-codes.sqlite'));
    this.codes.exec('PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS codes (code TEXT PRIMARY KEY, sandbox TEXT NOT NULL, created_at INTEGER NOT NULL);');
  }

  file(id) { return join(this.dir, `${id}.db`); }
  // Кабинет существует, когда его база наполнена: файл с именем кабинета появляется только после наполнения
  exists(id) { return validSandboxId(id) && existsSync(this.file(id)); }
  count() { return readdirSync(this.dir).filter((f) => FILE.test(f)).length; }

  // Открытая база кабинета; редко используемые закрываются, файл остаётся на диске
  get(id) {
    if (!this.exists(id)) return null;
    let entry = this.open.get(id);
    if (entry) this.open.delete(id);
    else entry = { store: new Store(this.file(id)) };
    this.open.set(id, entry);
    while (this.open.size > this.maxOpen) {
      const [oldId, old] = this.open.entries().next().value;
      this.open.delete(oldId);
      this.retire(old.store);
    }
    return entry.store;
  }

  retire(store) {
    // Не больше maxOpen баз ждут закрытия: при наплыве старейшая закрывается сразу
    if (this.retired.size >= this.maxOpen) {
      const [oldest, old] = this.retired.entries().next().value;
      clearTimeout(oldest);
      this.retired.delete(oldest);
      old.close();
    }
    const timer = setTimeout(() => { this.retired.delete(timer); store.close(); }, this.closeDelayMs);
    timer.unref();
    this.retired.set(timer, store);
  }

  // Новый кабинет с кодом wanted (заготовка со страницы входа) или случайным; null — стенд заполнен
  async create(wanted) {
    const id = validSandboxId(wanted) ? wanted : sandboxId();
    if (this.exists(id)) return id;
    let job = this.creating.get(id);
    if (!job) {
      if (this.count() + this.creating.size >= this.limit) this.sweep();
      if (this.count() + this.creating.size >= this.limit) return null;
      job = this.build(id).finally(() => this.creating.delete(id));
      this.creating.set(id, job);
    }
    await job;
    return id;
  }

  // Черновик наполняется целиком и только потом получает имя кабинета: полупустую базу никто не откроет
  async build(id) {
    const draft = `${this.file(id)}.new`;
    const drop = () => ['', '-wal', '-shm'].forEach((s) => rmSync(draft + s, { force: true }));
    drop();
    const store = new Store(draft);
    try {
      await seed(store);
      store.meta('sandbox_created', Date.now());
      store.db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    } catch (e) {
      store.close();
      drop();
      throw e;
    }
    store.close();
    ['-wal', '-shm'].forEach((s) => rmSync(draft + s, { force: true }));
    renameSync(draft, this.file(id));
  }

  // Код проверки справки запоминается, когда студент открывает справку или скачивает PDF
  rememberCode(code, id) {
    this.codes.prepare('INSERT INTO codes (code, sandbox, created_at) VALUES (?, ?, ?) ON CONFLICT(code) DO NOTHING').run(code, id, Date.now());
  }

  cabinetOfCode(code) {
    const row = this.codes.prepare('SELECT sandbox FROM codes WHERE code = ?').get(code);
    return row && this.exists(row.sandbox) ? row.sandbox : null;
  }

  forEachOpen(fn) { for (const { store } of this.open.values()) fn(store); }

  remove(id) {
    const entry = this.open.get(id);
    if (entry) { entry.store.close(); this.open.delete(id); }
    ['', '-wal', '-shm'].forEach((suffix) => rmSync(this.file(id) + suffix, { force: true }));
    this.codes.prepare('DELETE FROM codes WHERE sandbox = ?').run(id);
  }

  // Кабинет, которым не пользовались дольше срока хранения, удаляется вместе с файлами;
  // черновик, брошенный при сбое, — через час
  sweep(now = Date.now()) {
    for (const name of readdirSync(this.dir)) {
      if (DRAFT.test(name)) {
        const busy = [...this.creating.keys()].some((id) => name.startsWith(`${id}.`));
        if (!busy && now - statSync(join(this.dir, name)).mtimeMs > 36e5) rmSync(join(this.dir, name), { force: true });
        continue;
      }
      const m = FILE.exec(name);
      if (!m) continue;
      const touched = ['', '-wal'].map((s) => join(this.dir, name + s)).filter(existsSync).map((f) => statSync(f).mtimeMs);
      if (now - Math.max(...touched) > this.ttl) this.remove(m[1]);
    }
  }

  closeAll() {
    for (const { store } of this.open.values()) store.close();
    this.open.clear();
    for (const [timer, store] of this.retired) { clearTimeout(timer); store.close(); }
    this.retired.clear();
    this.codes.close();
  }
}

// Страница входа заранее выдаёт браузеру код будущего кабинета. Вкладки одного браузера и повторные
// нажатия «Войти» приходят с этим кодом и попадают в один кабинет; база появится только после верного пароля.
export function reserveSandbox(ctx) {
  if (!ctx.sandboxes || ctx.sandbox || ctx.reservedSandbox) return;
  ctx.reservedSandbox = sandboxId();
  appendCookie(ctx.res, demoCookie(ctx.reservedSandbox, 1));
}

// Вход без кабинета: создать кабинет и переключить запрос на его базу.
// Место в лимите занимается до создания базы — параллельные входы не обходят лимит.
export async function enterNewSandbox(ctx, wanted) {
  const boxes = ctx.sandboxes;
  const joining = validSandboxId(wanted) && (boxes.creating.has(wanted) || boxes.exists(wanted));
  let release = null;
  if (!joining) {
    const c = boxes.creation.check(ctx.ip);
    if (!c.ok) fail(429, 'Слишком много новых демо-кабинетов с одного адреса. Попробуйте позже', { retryAfter: c.retryAfter });
    release = boxes.creation.reserve(ctx.ip);
  }
  let id;
  try {
    id = await boxes.create(wanted);
    if (id && release) boxes.creation.hit(ctx.ip);
  } finally {
    if (release) release();
  }
  if (!id) fail(503, 'Демо-стенд заполнен. Попробуйте через несколько минут');
  ctx.sandbox = id;
  ctx.reservedSandbox = null;
  ctx.store = boxes.get(id);
  ctx.session = null;
  ctx.user = null;
  appendCookie(ctx.res, demoCookie(id));
  return id;
}
