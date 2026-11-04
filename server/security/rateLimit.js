// Ограничение частоты: скользящее окно в памяти процесса.
// В продакшене с несколькими инстансами счётчики переезжают в Redis с тем же интерфейсом.
export class RateLimiter {
  constructor({ windowMs, max }) {
    this.windowMs = windowMs;
    this.max = max;
    this.hits = new Map();
  }

  recent(key, now) {
    const list = (this.hits.get(key) || []).filter((t) => now - t < this.windowMs);
    if (list.length) this.hits.set(key, list); else this.hits.delete(key);
    return list;
  }

  check(key) {
    const now = Date.now();
    const list = this.recent(key, now);
    if (list.length < this.max) return { ok: true, left: this.max - list.length };
    return { ok: false, retryAfter: Math.ceil((this.windowMs - (now - list[0])) / 1000) };
  }

  hit(key) {
    const now = Date.now();
    const list = this.recent(key, now);
    list.push(now);
    this.hits.set(key, list);
  }

