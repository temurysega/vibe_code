// Расписание на неделю: изменения подсвечены, на телефоне — выбор дня, экспорт в календарь.
import { get, post } from '../lib/api.js';
import { session, setPlay } from '../lib/bus.js';
import { esc, mskNow, dayShort, dateNum, weekdayShort, relDay, plural, addDays } from '../lib/format.js';
import { icon } from '../ui/icons.js';
import { modal } from '../ui/overlay.js';
import { skeleton, errorBox, lessonState, changeTag, changeLine, teacherModal, KIND_ICON } from './common.js';

let week = null;
let picked = null;

function isoWeekOf(d) {
  const wd = new Date(d + 'T12:00:00Z').getUTCDay() || 7;
  const thursday = addDays(d, 4 - wd);
  const y = thursday.slice(0, 4);
  const jan4 = `${y}-01-04`;
  const w4 = new Date(jan4 + 'T12:00:00Z').getUTCDay() || 7;
  const first = addDays(jan4, 1 - w4);
  const n = Math.round((new Date(addDays(d, 1 - wd) + 'T12:00:00Z') - new Date(first + 'T12:00:00Z')) / (7 * 864e5)) + 1;
  return `${y}-W${String(n).padStart(2, '0')}`;
}

