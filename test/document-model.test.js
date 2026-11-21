// Текст электронной справки — общий модуль для страницы и PDF: формулировка, дата по Москве,
// период стипендии и английские названия дисциплин в выписке.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { documentModel, courseEn } from '../public/js/shared/document.js';

const base = {
  lang: 'ru', type: 'study', number: '2026/00001', title: 'Справка об обучении', issuedAt: Date.UTC(2026, 10, 20, 22, 30), verifyCode: 'ABCDEF0123456789',
  student: { lastName: 'Морозова', firstName: 'Алина', middleName: 'Дмитриевна', gender: 'f' }, course: 2, faculty: 'Факультет международных отношений',
  program: '41.03.05 Международные отношения', profile: 'Мировая политика и дипломатия', studyForm: 'очная', funding: 'бюджет',
  admissionYear: 2025, graduationYear: 2029, recordBook: '25-МО-0317', academicYear: '2026/2027', payload: {},
};

test('текст справки: грамотная формулировка, дата по Москве, период стипендии без двойной точки', () => {
  const m = documentModel(base, null);
  assert.match(m.paragraphs[0].map((r) => r.t).join(''), /^Настоящая справка подтверждает, что Морозова Алина Дмитриевна действительно является студенткой 2 курса/);
  // 20 ноября 22:30 UTC — в Москве уже 21 ноября
  assert.match(m.numberLine, /от 21 ноября 2026/);
  const st = documentModel({ ...base, type: 'stipend', title: 'Справка о стипендии', stipend: { from: '2026-05', to: '2026-10', months: [{ month: '2026-05', reason: 'Сессия на отлично', amount: 5200 }], total: 5200, note: 'Учебный пример.' } }, null);
  const intro = st.stipend.intro.map((r) => r.t).join('');
  assert.ok(!intro.includes('..'), intro);
  assert.match(intro, /октябрь 2026 г\.$/);
});

test('английская выписка переводит дисциплины, транслитерация — только для неизвестных', () => {
  const history = [{ semester: 1, list: [{ name: 'Английский язык', points: 79, verdict: { letter: 'C' } }, { name: 'Римское право', points: 81, verdict: { letter: 'C' } }] }];
  const m = documentModel({ ...base, lang: 'en', type: 'transcript' }, history);
  assert.equal(m.title, 'Academic Transcript');
  assert.equal(m.org, 'MGIMO Mania — a demo concept');
  assert.deepEqual(m.transcript.rows.map((r) => r[0]), ['English', 'Roman Law']);
  assert.equal(courseEn('Новая дисциплина'), 'Novaia distsiplina');
});
