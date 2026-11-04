// Расписание группы: регулярные пары + изменения (отмена, перенос, аудитория, замена, доп. пара).
import { BELLS, addDays, holidayOf, parityOf, mondayOf, msk, isoWeek, toMin } from './time.js';

export const KIND = {
  lecture: 'Лекция',
  seminar: 'Семинар',
  language: 'Иностранный язык',
  practice: 'Практикум',
  sport: 'Физкультура',
  consult: 'Консультация',
};

