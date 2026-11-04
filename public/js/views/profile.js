// Профиль: учебные данные, контакты деканата и безопасность — сеансы, смена пароля, что хранится.
import { get, post, del } from '../lib/api.js';
import { session } from '../lib/bus.js';
import { esc, stamp, when } from '../lib/format.js';
import { icon } from '../ui/icons.js';
import { toast, confirm } from '../ui/overlay.js';
import { backdrop, ava } from '../art/avatar.js';
import { skeleton, errorBox } from './common.js';

