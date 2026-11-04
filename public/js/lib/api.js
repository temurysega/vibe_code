// Запросы к API: cookie сессии отправляет браузер сам, CSRF-токен добавляется к изменяющим запросам.
import { emit } from './bus.js';

let csrf = null;
export const setCsrf = (t) => { csrf = t || null; };

export class ApiError extends Error {
  constructor(status, data) {
    super((data && data.error) || 'Ошибка запроса');
    this.status = status;
    this.data = data || {};
  }
}

