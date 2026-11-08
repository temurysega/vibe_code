// Запросы к API: cookie сессии отправляет браузер сам, CSRF-токен добавляется к изменяющим запросам.
import { emit, session } from './bus.js';

let csrf = null;
export const setCsrf = (t) => { csrf = t || null; };

export class ApiError extends Error {
  constructor(status, data) {
    super((data && data.error) || 'Ошибка запроса');
    this.status = status;
    this.data = data || {};
  }
}

export async function api(method, path, body) {
  const requestedFor = session.user;
  const opts = { method, credentials: 'same-origin', headers: { Accept: 'application/json' } };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  if (method !== 'GET' && csrf) opts.headers['X-CSRF-Token'] = csrf;
  let res;
  try {
    res = await fetch(path, opts);
  } catch (e) {
    throw new ApiError(0, { error: 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз' });
  }
  const data = await res.json().catch(() => ({}));
  // Ответ старого аккаунта не должен попасть в новый после быстрого выхода/входа.
  if (requestedFor && session.user !== requestedFor) throw new ApiError(409, { error: 'Сеанс изменился. Откройте раздел заново' });
  if (res.status === 401 && !path.startsWith('/api/auth/')) emit('unauthorized');
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const get = (path) => api('GET', path);
export const post = (path, body) => api('POST', path, body === undefined ? {} : body);
export const patch = (path, body) => api('PATCH', path, body);
export const del = (path) => api('DELETE', path);
