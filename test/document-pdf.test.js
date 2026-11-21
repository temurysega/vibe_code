// Справка файлом PDF: прямая загрузка, встроенный шрифт с кириллицей, пометка «Образец»,
// только владельцу и только готовая электронная справка.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { startApp, client } from './helpers.js';

let app;
before(async () => { app = await startApp(); });
after(async () => { await app.close(); });

async function readyRequest(login, type, fields, lang = 'ru') {
  const s = client(app.base);
  await s.login(login);
  const r = (await s.req('POST', '/api/requests', { type, delivery: 'electronic', lang, fields })).data.request;
  // Готовность ставим напрямую: решение деканата проверяют другие тесты
  app.store.run("UPDATE requests SET status = 'ready', plan = NULL WHERE id = ?", r.id);
  app.store.run("INSERT INTO request_events (request_id, status, comment, actor, created_at) VALUES (?, 'ready', NULL, 'Деканат', ?)", r.id, Date.now());
  return { s, r };
}

async function pdf(c, id) {
  const res = await fetch(`${app.base}/api/requests/${id}/document.pdf`, { headers: { Cookie: c.cookie } });
  return { res, bytes: Buffer.from(await res.arrayBuffer()) };
}

test('готовая справка скачивается файлом PDF с встроенным шрифтом и пометкой «образец»', async () => {
  const { s, r } = await readyRequest('a.morozova', 'study', { place: 'PDF для проверки', copies: 1 });
  const { res, bytes } = await pdf(s, r.id);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  assert.match(res.headers.get('content-disposition'), /^attachment; filename="spravka-\d{4}-\d{5}\.pdf"$/);
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  const raw = bytes.toString('latin1');
  assert.match(raw, /\/FontFile2/, 'шрифт встроен в файл');
  assert.match(raw, /\/ToUnicode/, 'текст копируется и ищется, кириллица читается');
  const doc = await PDFDocument.load(bytes);
  assert.ok(doc.getPageCount() >= 1);
  assert.match(doc.getTitle(), /образец/);
  assert.match(raw, /\/Lang \(ru\)/, 'язык документа указан для экранных дикторов');
});

test('выписка оценок и справка о стипендии тоже собираются в PDF', async () => {
  const t = await readyRequest('k.lebedeva', 'transcript', { purpose: 'Стажировка' });
  const tr = await pdf(t.s, t.r.id);
  assert.equal(tr.res.status, 200);
  const st = await readyRequest('a.morozova', 'stipend', {});
  const sp = await pdf(st.s, st.r.id);
  assert.equal(sp.res.status, 200);
  assert.ok((await PDFDocument.load(sp.bytes)).getPageCount() >= 1);
});

test('чужую справку не скачать, неготовую — тоже', async () => {
  const { r } = await readyRequest('a.morozova', 'study', { place: 'Чужая справка', copies: 1 });
  const t = client(app.base);
  await t.login('t.aliev');
  assert.equal((await pdf(t, r.id)).res.status, 404);
  const s = client(app.base);
  await s.login('a.morozova');
  const fresh = (await s.req('POST', '/api/requests', { type: 'study', delivery: 'electronic', lang: 'ru', fields: { place: 'Ещё не готова', copies: 1 } })).data.request;
  assert.equal((await pdf(s, fresh.id)).res.status, 409);
});
