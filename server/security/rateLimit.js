// Ограничение частоты: скользящее окно в памяти процесса.
// В продакшене с несколькими инстансами счётчики переезжают в Redis с тем же интерфейсом.
export class RateLimiter {
  constructor({ windowMs, max }) {
    this.windowMs = windowMs;
    this.max = max;
    this.hits = new Map();
  }

