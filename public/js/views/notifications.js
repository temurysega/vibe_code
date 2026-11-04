// Уведомления: деканат, расписание, дедлайны, заявки и оценки в одной ленте с фильтрами и настройками.
import { get, post, patch } from '../lib/api.js';
import { session, setUnread, setPlay, on } from '../lib/bus.js';
import { esc, when, dateOfTs, relDay, dayShort } from '../lib/format.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/overlay.js';
import { skeleton, errorBox } from './common.js';

