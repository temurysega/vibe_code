// «Спросить деканат»: помощник отвечает только по данным самого студента.
// С ключом ANTHROPIC_API_KEY ответ пишет Claude, без ключа — встроенные правила на тех же данных.
// Ключ живёт только в окружении сервера: в браузер и в репозиторий он не попадает.
import { config } from '../config.js';
import { buildWeek, upcoming } from './schedule.js';
import { gradesFor, plural } from './grades.js';
import { listFor } from './notifications.js';
import { applyPlans, publicRequest, STATUS } from './requests.js';
import { msk, addDays, DAY } from './time.js';

// Куда помощник может отправить студента: только разделы кабинета
export const LINKS = {
  '#/schedule': 'Расписание',
  '#/grades': 'Успеваемость',
  '#/grades/session': 'Сессия',
  '#/requests': 'Мои заявки',
  '#/requests/new/study': 'Справка об обучении',
  '#/requests/new/visa': 'Справка для посольства',
  '#/requests/new/military': 'Справка для военкомата',
  '#/requests/new/transcript': 'Выписка оценок',
  '#/requests/new/stipend': 'Справка о стипендии',
  '#/requests/new/absence': 'Заявление о пропуске',
  '#/requests/new/retake': 'Запись на пересдачу',
  '#/requests/new/exchange': 'Программа обмена',
  '#/requests/new/aid': 'Материальная помощь',
  '#/notifications': 'Уведомления',
  '#/profile': 'Профиль и безопасность',
};

