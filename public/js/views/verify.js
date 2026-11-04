// Проверка подлинности электронной справки по коду. Доступна без входа, раскрывает только инициалы.
import { get } from '../lib/api.js';
import { session } from '../lib/bus.js';
import { esc, stamp } from '../lib/format.js';
import { icon } from '../ui/icons.js';
import { logoMark, wordmark } from '../art/logo.js';

