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

const LESSON_SQL = `SELECT l.*, d.name AS discipline, d.short, d.color, d.control,
    t.full_name AS t_name, t.short_name AS t_short, t.title AS t_title, t.department AS t_dept, t.email AS t_email, t.office_hours AS t_hours
  FROM lessons l JOIN disciplines d ON d.id = l.discipline_id JOIN teachers t ON t.id = l.teacher_id
  WHERE l.group_code = ?`;

const teacherOf = (row, p = 't_') => (row[p + 'name'] ? {
  name: row[p + 'name'], short: row[p + 'short'], title: row[p + 'title'] || '', department: row[p + 'dept'] || '', email: row[p + 'email'] || '', hours: row[p + 'hours'] || '',
} : null);

// Этаж и корпус по номеру аудитории: первая цифра — этаж
export function placeOf(room) {
  const m = /^(\d)(\d{3})$/.exec(String(room));
  if (m) return `${m[1]} этаж`;
  return '';
}

function item(l, date, pair) {
  const [start, end] = BELLS[pair];
  return {
    key: `${date}:${pair}:${l.id}`,
    date, pair, start, end,
    lessonId: l.id,
    disciplineId: l.discipline_id,
    discipline: l.discipline, short: l.short, color: l.color,
    kind: l.kind, kindLabel: KIND[l.kind] || l.kind,
    room: l.room, place: placeOf(l.room),
    teacher: teacherOf(l),
    subgroup: l.subgroup || null,
    status: 'normal',
    change: null,
  };
}

export function buildWeek(store, group, monday) {
  monday = mondayOf(monday);
  const sunday = addDays(monday, 6);
  const base = store.all(LESSON_SQL, group);
  const byId = new Map(base.map((l) => [l.id, l]));
  const teachers = new Map(store.all('SELECT * FROM teachers').map((t) => [t.id, t]));
  const tInfo = (id) => { const t = teachers.get(id); return t ? { name: t.full_name, short: t.short_name, title: t.title || '', department: t.department, email: t.email, hours: t.office_hours || '' } : null; };
  const changes = store.all(
    `SELECT c.*, d.name AS d_name, d.short AS d_short, d.color AS d_color FROM schedule_changes c LEFT JOIN disciplines d ON d.id = c.discipline_id
     WHERE c.group_code = ? AND ((c.date BETWEEN ? AND ?) OR (c.new_date BETWEEN ? AND ?)) ORDER BY c.created_at`,
    group, monday, sunday, monday, sunday,
  );
  const { parity, n } = parityOf(monday);
  const days = [];
  const notes = [];

  for (let i = 0; i < 6; i++) {
    const date = addDays(monday, i);
    const holiday = holidayOf(date);
    const items = holiday ? [] : base
      .filter((l) => l.weekday === i + 1 && (l.parity === 'all' || l.parity === parity))
      .map((l) => item(l, date, l.pair));

    changes.filter((c) => c.date === date && c.type !== 'extra').forEach((c) => {
      const it = items.find((x) => x.lessonId === c.lesson_id && x.pair === c.pair);
      if (!it) return;
      const at = c.created_at;
      if (c.type === 'cancel') { it.status = 'cancelled'; it.change = { type: 'cancel', reason: c.reason, at }; }
      if (c.type === 'room') { it.change = { type: 'room', from: it.room, reason: c.reason, at }; it.room = c.room; it.place = placeOf(c.room); }
      if (c.type === 'teacher') { it.change = { type: 'teacher', from: it.teacher, reason: c.reason, at }; it.teacher = tInfo(c.teacher_id) || it.teacher; }
      if (c.type === 'move') { it.status = 'moved'; it.change = { type: 'move', to: { date: c.new_date, pair: c.new_pair, room: c.room || it.room }, reason: c.reason, at }; }
    });

    // Перенесённые на этот день и дополнительные пары
    changes.filter((c) => (c.type === 'move' && c.new_date === date) || (c.type === 'extra' && c.date === date)).forEach((c) => {
      if (holiday) return;
      if (c.type === 'move') {
        const l = byId.get(c.lesson_id);
        if (!l) return;
        const it = item(l, date, c.new_pair);
        it.key = `${date}:${c.new_pair}:m${c.id}`;
        if (c.room) { it.room = c.room; it.place = placeOf(c.room); }
        it.status = 'moved-in';
        it.change = { type: 'move', from: { date: c.date, pair: c.pair }, reason: c.reason, at: c.created_at };
        items.push(it);
      } else {
        const [start, end] = BELLS[c.pair];
        items.push({
          key: `${date}:${c.pair}:x${c.id}`, date, pair: c.pair, start, end, lessonId: null, disciplineId: c.discipline_id,
          discipline: c.d_name, short: c.d_short, color: c.d_color, kind: c.kind || 'consult', kindLabel: KIND[c.kind || 'consult'],
          room: c.room, place: placeOf(c.room), teacher: tInfo(c.teacher_id), subgroup: null,
          status: 'extra', change: { type: 'extra', reason: c.reason, at: c.created_at },
        });
      }
    });

    items.sort((a, b) => a.pair - b.pair || (a.status === 'moved' ? 1 : -1));
    items.filter((x) => x.change).forEach((x) => notes.push(x));
    days.push({ date, weekday: i + 1, holiday, items });
  }

  return { week: isoWeek(monday), monday, number: n, parity, days, changes: notes };
}

// Ближайшая пара с учётом изменений: текущая или следующая в течение недели
export function upcoming(store, group, now = msk()) {
  for (let w = 0; w < 2; w++) {
    const week = buildWeek(store, group, addDays(mondayOf(now.date), w * 7));
    for (const d of week.days) {
      if (d.date < now.date) continue;
      for (const it of d.items) {
        if (it.status === 'cancelled' || it.status === 'moved') continue;
        if (d.date === now.date && toMin(it.end) <= now.minutes) continue;
        const live = d.date === now.date && toMin(it.start) <= now.minutes;
        return Object.assign({}, it, { live });
      }
    }
  }
  return null;
}

export function dayOf(store, group, date) {
  const week = buildWeek(store, group, date);
  return week.days.find((d) => d.date === date) || { date, weekday: 7, holiday: 'Воскресенье', items: [] };
}

// Календарь .ics на четыре недели вперёд — подключается в Google, Яндекс или Apple Календарь
export function icsFor(store, group, groupTitle) {
  const now = msk();
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MGIMO Mania concept//RU', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:Расписание ${groupTitle}`, 'X-WR-TIMEZONE:Europe/Moscow'];
  const esc = (s) => String(s || '').replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  for (let w = 0; w < 4; w++) {
    const week = buildWeek(store, group, addDays(mondayOf(now.date), w * 7));
    week.days.forEach((d) => d.items.forEach((it) => {
      if (it.status === 'cancelled' || it.status === 'moved') return;
      const dt = (t) => `${d.date.replace(/-/g, '')}T${t.replace(':', '')}00`;
      lines.push('BEGIN:VEVENT', `UID:${it.key.replace(/:/g, '-')}@mgimo-mania.demo`, `DTSTAMP:${stamp}`,
        `DTSTART;TZID=Europe/Moscow:${dt(it.start)}`, `DTEND;TZID=Europe/Moscow:${dt(it.end)}`,
        `SUMMARY:${esc(`${it.discipline} · ${it.kindLabel}`)}`, `LOCATION:${esc('ауд. ' + it.room)}`,
        `DESCRIPTION:${esc(it.teacher ? it.teacher.name : '')}`, 'END:VEVENT');
    }));
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
