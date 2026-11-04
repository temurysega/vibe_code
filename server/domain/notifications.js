// Уведомления: новости деканата, изменения расписания, дедлайны, статусы заявок и новые оценки.
import { DAY, msk, daysBetween } from './time.js';
import { plural } from './grades.js';

export const KINDS = {
  news: 'Деканат',
  schedule: 'Расписание',
  deadline: 'Дедлайн',
  request: 'Заявка',
  grade: 'Оценка',
  system: 'Кабинет',
};

