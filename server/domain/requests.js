// Заявки и справки: каталог, проверка полей, статусы и история изменений.
// Студент видит и меняет только свои заявки, деканат — заявки своего факультета.
import { randomBytes } from 'node:crypto';
import { str, int, isDate } from '../http/body.js';
import { fail } from '../http/router.js';
import { msk, addDays, DAY } from './time.js';
import { notify } from './notifications.js';

export const STATUS = {
  submitted: 'Подана',
  in_work: 'В работе',
  ready: 'Готова',
  issued: 'Выдана',
  approved: 'Одобрена',
  rejected: 'Отклонена',
  cancelled: 'Отменена',
};
export const FINAL = ['issued', 'approved', 'rejected', 'cancelled'];

