// Маленький маршрутизатор без зависимостей: шаблоны вида /api/requests/:id и цепочки обработчиков.
export class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra || null;
  }
}

export const fail = (status, message, extra) => { throw new HttpError(status, message, extra); };

export class Router {
  constructor() { this.routes = []; }

  add(method, path, handlers) {
    const keys = [];
    const pattern = path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; });
    this.routes.push({ method, path, re: new RegExp(`^${pattern}/?$`), keys, handlers });
    return this;
  }
  get(path, ...h) { return this.add('GET', path, h); }
  post(path, ...h) { return this.add('POST', path, h); }
  patch(path, ...h) { return this.add('PATCH', path, h); }
  delete(path, ...h) { return this.add('DELETE', path, h); }

