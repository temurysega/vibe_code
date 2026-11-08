// Ограничение частоты: скользящее окно в памяти процесса.
// В продакшене с несколькими инстансами счётчики переезжают в Redis с тем же интерфейсом.
export class RateLimiter {
  constructor({ windowMs, max }) {
    this.windowMs = windowMs;
    this.max = max;
    this.hits = new Map();
    this.pending = new Map();
  }

  recent(key, now) {
    const list = (this.hits.get(key) || []).filter((t) => now - t < this.windowMs);
    if (list.length) this.hits.set(key, list); else this.hits.delete(key);
    return list;
  }

  check(key) {
    const now = Date.now();
    const list = this.recent(key, now);
    const used = list.length + (this.pending.get(key) || 0);
    if (used < this.max) return { ok: true, left: this.max - used };
    return { ok: false, retryAfter: list.length ? Math.max(1, Math.ceil((this.windowMs - (now - list[0])) / 1000)) : 1 };
  }

  // Резервируем место до асинхронной проверки пароля: параллельные запросы
  // не должны обходить лимит, пока предыдущие ещё считают scrypt.
  reserve(key) {
    this.pending.set(key, (this.pending.get(key) || 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const left = (this.pending.get(key) || 1) - 1;
      if (left) this.pending.set(key, left); else this.pending.delete(key);
    };
  }

  hit(key) {
    const now = Date.now();
    const list = this.recent(key, now);
    list.push(now);
    this.hits.set(key, list);
  }

  reset(key) { this.hits.delete(key); }

  // Периодическая чистка, чтобы карта не росла бесконечно
  sweep() {
    const now = Date.now();
    for (const key of this.hits.keys()) this.recent(key, now);
  }
}
