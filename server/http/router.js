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

  match(method, pathname) {
    let wrongMethod = false;
    for (const r of this.routes) {
      const m = r.re.exec(pathname);
      if (!m) continue;
      if (r.method !== method && !(method === 'HEAD' && r.method === 'GET')) { wrongMethod = true; continue; }
      const params = {};
      try {
        r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      } catch (e) {
        fail(400, 'Некорректный адрес');
      }
      return { route: r, params };
    }
    return wrongMethod ? { wrongMethod: true } : null;
  }
}

export function sendJson(res, status, data) {
  if (res.writableEnded) return;
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}
