// Заявки студента. Каждый запрос к конкретной заявке проверяет владельца:
// чужая заявка по прямой ссылке отвечает «не найдено» — даже факт её существования не раскрывается.
import { fail } from '../http/router.js';
import { int, str } from '../http/body.js';
import { requireStudent } from '../security/auth.js';
import { catalogFor, createRequest, setStatus, applyPlans, publicRequest, typeOf, stipendForRequest } from '../domain/requests.js';
import { semesterOf, msk } from '../domain/time.js';
import * as play from '../domain/play.js';
import { RateLimiter } from '../security/rateLimit.js';
import { config } from '../config.js';
import { gradesFor } from '../domain/grades.js';
import { documentPdf } from '../domain/documentPdf.js';
import { codeGroups } from '../../public/js/shared/document.js';

// Публичная проверка подлинности: не больше 40 запросов за 10 минут с одного адреса
export const verifyLimit = new RateLimiter({ windowMs: 10 * 60e3, max: 40 });

function own(ctx) {
  const id = int(ctx.params.id, 1, 1e9);
  if (!id) fail(404, 'Заявка не найдена');
  applyPlans(ctx.store, ctx.student.id);
  const r = ctx.store.get('SELECT * FROM requests WHERE id = ? AND student_id = ?', id, ctx.student.id);
  if (!r) fail(404, 'Заявка не найдена');
  return r;
}

// Данные электронной справки — для страницы и для PDF; владелец проверяется в own()
function documentOf(ctx) {
  const r = own(ctx);
  const type = typeOf(r.type);
  if (r.delivery !== 'electronic' || !['ready', 'issued'].includes(r.status) || !type || type.group !== 'cert') fail(409, 'Документ ещё не готов');
  const s = ctx.student;
  const { _stipend, ...payload } = JSON.parse(r.payload || '{}');
  const ready = ctx.store.get("SELECT created_at FROM request_events WHERE request_id = ? AND status = 'ready' ORDER BY created_at DESC LIMIT 1", r.id);
  const sem = semesterOf(msk().date);
  return {
    r,
    document: {
      number: r.number, type: r.type, title: r.title, lang: payload.lang || 'ru', payload,
      issuedAt: ready ? ready.created_at : r.updated_at, verifyCode: r.verify_code,
      student: { lastName: s.last_name, firstName: s.first_name, middleName: s.middle_name, gender: s.gender },
      group: s.group_code, course: s.course, faculty: s.faculty.name, program: s.program, profile: s.profile,
      studyForm: s.study_form, funding: s.funding, admissionYear: s.admission_year, graduationYear: s.admission_year + 4, recordBook: s.record_book,
      academicYear: `${sem.year}/${sem.year + 1}`,
      ...(r.type === 'stipend' ? { stipend: stipendForRequest(ctx.store, s, r) } : {}),
    },
  };
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
  router.get('/api/requests/:id/document', requireStudent, (ctx) => ({ document: documentOf(ctx).document }));

  // Та же справка файлом PDF: прямая загрузка с телефона, без диалога печати
  router.get('/api/requests/:id/document.pdf', requireStudent, async (ctx) => {
    const { r, document } = documentOf(ctx);
    const history = r.type === 'transcript' ? gradesFor(ctx.store, ctx.student).history : null;
    const proto = config.trustProxy ? String(ctx.req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim() : (config.cookieSecure ? 'https' : 'http');
    const verifyUrl = `${proto}://${ctx.req.headers.host}/${ctx.sandbox ? `?demo=${ctx.sandbox}` : ''}#/verify/${codeGroups(r.verify_code)}`;
    const bytes = Buffer.from(await documentPdf(document, history, verifyUrl));
    ctx.res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Length': bytes.length,
      'Content-Disposition': `attachment; filename="spravka-${r.number.replace('/', '-')}.pdf"`,
      'Cache-Control': 'no-store',
    });
    ctx.res.end(bytes);
  });

  // Проверка подлинности справки по коду: открыта всем, но раскрывает только инициалы
  router.get('/api/verify/:code', (ctx) => {
    const c = verifyLimit.check(ctx.ip);
    if (!c.ok) fail(429, 'Слишком много проверок подряд. Попробуйте через несколько минут', { retryAfter: c.retryAfter });
    verifyLimit.hit(ctx.ip);
    // Новые справки получают 16-значный код; 8-значные коды прежних справок тоже проверяются
    const code = String(ctx.params.code || '').toUpperCase().replace(/[^0-9A-F]/g, '');
    if (!/^(?:[0-9A-F]{8}|[0-9A-F]{16})$/.test(code)) fail(404, 'Документ не найден');
    const r = ctx.store.get("SELECT r.number, r.title, r.status, r.updated_at, s.last_name, s.first_name, s.middle_name FROM requests r JOIN students s ON s.id = r.student_id WHERE r.verify_code = ? AND r.status IN ('ready', 'issued')", code);
    if (!r) fail(404, 'Документ не найден');
    const ini = [r.first_name, r.middle_name, r.last_name].filter(Boolean).map((x) => x[0] + '.').join(' ');
    return { valid: true, number: r.number, title: r.title, issuedAt: r.updated_at, holder: ini };
  });
}
