// Заявки студента. Каждый запрос к конкретной заявке проверяет владельца:
// чужая заявка по прямой ссылке отвечает «не найдено» — даже факт её существования не раскрывается.
import { fail } from '../http/router.js';
import { int, str } from '../http/body.js';
import { requireStudent } from '../security/auth.js';
import { catalogFor, createRequest, setStatus, applyPlans, publicRequest, typeOf } from '../domain/requests.js';
import { semesterOf, msk } from '../domain/time.js';
import * as play from '../domain/play.js';

function own(ctx) {
  const id = int(ctx.params.id, 1, 1e9);
  if (!id) fail(404, 'Заявка не найдена');
  applyPlans(ctx.store, ctx.student.id);
  const r = ctx.store.get('SELECT * FROM requests WHERE id = ? AND student_id = ?', id, ctx.student.id);
  if (!r) fail(404, 'Заявка не найдена');
  return r;
}

export default function (router) {
  router.get('/api/requests/types', requireStudent, (ctx) => ({ types: catalogFor(ctx.store, ctx.student) }));

  router.get('/api/requests', requireStudent, (ctx) => {
    applyPlans(ctx.store, ctx.student.id);
    const rows = ctx.store.all('SELECT * FROM requests WHERE student_id = ? ORDER BY created_at DESC', ctx.student.id);
    return { requests: rows.map((r) => publicRequest(ctx.store, r, ctx.student.faculty)) };
  });

  router.post('/api/requests', requireStudent, (ctx) => {
    const id = createRequest(ctx.store, ctx.student, ctx.student.faculty, ctx.body);
    const s = play.load(ctx.store, ctx.student.id);
    s.pet.growth += 1;
    play.save(ctx.store, ctx.student.id, s);
    const r = ctx.store.get('SELECT * FROM requests WHERE id = ?', id);
    ctx.status = 201;
    return { request: publicRequest(ctx.store, r, ctx.student.faculty) };
  });

  router.get('/api/requests/:id', requireStudent, (ctx) => ({ request: publicRequest(ctx.store, own(ctx), ctx.student.faculty) }));

  router.post('/api/requests/:id/cancel', requireStudent, (ctx) => {
    const r = own(ctx);
    if (r.status !== 'submitted') fail(409, 'Заявку уже взяли в работу — отменить можно через деканат');
    setStatus(ctx.store, r, 'cancelled', str(ctx.body.reason, 200) || 'Отменена студентом', 'Вы');
    ctx.store.run('UPDATE requests SET plan = NULL WHERE id = ?', r.id);
    return { request: publicRequest(ctx.store, ctx.store.get('SELECT * FROM requests WHERE id = ?', r.id), ctx.student.faculty) };
  });

  // Электронная справка: данные для печатной формы с кодом проверки
  router.get('/api/requests/:id/document', requireStudent, (ctx) => {
    const r = own(ctx);
    const type = typeOf(r.type);
    if (r.delivery !== 'electronic' || !['ready', 'issued'].includes(r.status) || !type || type.group !== 'cert') fail(409, 'Документ ещё не готов');
    const s = ctx.student;
    const payload = JSON.parse(r.payload || '{}');
    const ready = ctx.store.get("SELECT created_at FROM request_events WHERE request_id = ? AND status = 'ready' ORDER BY created_at DESC LIMIT 1", r.id);
    const sem = semesterOf(msk().date);
    return {
      document: {
        number: r.number, type: r.type, title: r.title, lang: payload.lang || 'ru', payload,
        issuedAt: ready ? ready.created_at : r.updated_at, verifyCode: r.verify_code,
        student: { lastName: s.last_name, firstName: s.first_name, middleName: s.middle_name, gender: s.gender },
        group: s.group_code, course: s.course, faculty: s.faculty.name, program: s.program, profile: s.profile,
        studyForm: s.study_form, funding: s.funding, admissionYear: s.admission_year, graduationYear: s.admission_year + 4, recordBook: s.record_book,
        academicYear: `${sem.year}/${sem.year + 1}`,
      },
    };
  });

