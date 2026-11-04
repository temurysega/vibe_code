// Кабинет сотрудника деканата: очередь заявок факультета, решения с комментарием,
// объявления студентам и изменения расписания. Чужие факультеты сотруднику не видны.
import { get, post, patch } from '../lib/api.js';
import { session } from '../lib/bus.js';
import { esc, when, stamp, dayShort, mskNow, num } from '../lib/format.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/overlay.js';
import { skeleton, errorBox, statusPill } from './common.js';

