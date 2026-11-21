// Отдельный демо-кабинет для каждого проверяющего: своя SQLite с теми же вымышленными данными.
// Заявки, объявления, прочитанные уведомления и сеансы одного кабинета не видны в другом,
// а файл кабинета лежит на постоянном томе и переживает перезапуск сервера.
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, statSync, rmSync } from 'node:fs';
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

export const demoCookieName = () => (config.cookieSecure ? '__Host-mm_demo' : 'mm_demo');
export const demoCookie = (id, days = config.sandboxTtlDays) =>
  `${demoCookieName()}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.round(days * 86400)}${config.cookieSecure ? '; Secure' : ''}`;

export class Sandboxes {
  constructor({ dir, limit = config.sandboxLimit, ttlDays = config.sandboxTtlDays, maxOpen = 40 }) {
    this.dir = dir;
    this.limit = limit;
    this.ttl = ttlDays * 864e5;
    this.maxOpen = maxOpen;
    this.open = new Map();
    mkdirSync(dir, { recursive: true });
  }

  file(id) { return join(this.dir, `${id}.db`); }
  exists(id) { return typeof id === 'string' && ID.test(id) && existsSync(this.file(id)); }
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
      old.store.close();
      this.open.delete(oldId);
    }
    return entry.store;
  }

  async create() {
    if (this.count() >= this.limit) this.sweep();
    if (this.count() >= this.limit) return null;
    const id = sandboxId();
    const store = new Store(this.file(id));
    try {
      await seed(store);
      store.meta('sandbox_created', Date.now());
    } catch (e) {
      store.close();
      this.remove(id);
      throw e;
    }
    store.close();
    return id;
  }

  forEachOpen(fn) { for (const { store } of this.open.values()) fn(store); }

  remove(id) {
    const entry = this.open.get(id);
    if (entry) { entry.store.close(); this.open.delete(id); }
    ['', '-wal', '-shm'].forEach((suffix) => rmSync(this.file(id) + suffix, { force: true }));
  }

  // Кабинет, которым не пользовались дольше срока хранения, удаляется вместе с файлами
  sweep(now = Date.now()) {
    for (const name of readdirSync(this.dir)) {
      const m = FILE.exec(name);
      if (!m) continue;
      const touched = ['', '-wal'].map((s) => join(this.dir, name + s)).filter(existsSync).map((f) => statSync(f).mtimeMs);
      if (now - Math.max(...touched) > this.ttl) this.remove(m[1]);
    }
  }

  closeAll() {
    for (const { store } of this.open.values()) store.close();
    this.open.clear();
  }
}

// Новый кабинет: не больше 20 в час с одного адреса, иначе стенд можно засыпать файлами
export const sandboxCreation = new RateLimiter({ windowMs: 60 * 60e3, max: 20 });

export async function enterNewSandbox(ctx) {
  const c = sandboxCreation.check(ctx.ip);
  if (!c.ok) fail(429, 'Слишком много новых демо-кабинетов с одного адреса. Попробуйте позже', { retryAfter: c.retryAfter });
  const id = await ctx.sandboxes.create();
  if (!id) fail(503, 'Демо-стенд заполнен. Попробуйте через несколько минут');
  sandboxCreation.hit(ctx.ip);
  ctx.sandbox = id;
  ctx.store = ctx.sandboxes.get(id);
  ctx.session = null;
  ctx.user = null;
  appendCookie(ctx.res, demoCookie(id));
  return id;
}
