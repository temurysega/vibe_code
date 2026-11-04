// «Спросить деканат»: чат с помощником, который видит только данные самого студента.
// Ключ ИИ живёт на сервере — браузер отправляет лишь вопрос и получает ответ.
import { post } from '../lib/api.js';
import { session } from '../lib/bus.js';
import { esc } from '../lib/format.js';
import { icon } from '../ui/icons.js';

