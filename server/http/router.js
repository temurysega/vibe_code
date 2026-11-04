// Маленький маршрутизатор без зависимостей: шаблоны вида /api/requests/:id и цепочки обработчиков.
export class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra || null;
  }
}

