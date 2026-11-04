// «Спросить деканат»: помощник отвечает только по данным самого студента.
// С ключом ANTHROPIC_API_KEY ответ пишет Claude, без ключа — встроенные правила на тех же данных.
// Ключ живёт только в окружении сервера: в браузер и в репозиторий он не попадает.
import { config } from '../config.js';
import { buildWeek, upcoming } from './schedule.js';
import { gradesFor, plural } from './grades.js';
import { listFor } from './notifications.js';
import { applyPlans, publicRequest, STATUS } from './requests.js';
import { msk, addDays, DAY } from './time.js';

