// Регрессия E-34 («найди все следы»). Узор-псевдо-QR с образца справки убрали, а квиз «Первые шаги»
// продолжал учить, что верный ответ — «в течение дня, с QR-кодом для проверки»: кабинет обещал то,
// чего в нём нет. Настоящий механизм проверки — код и ссылка #/verify/<код>, она открывается без входа.
//
// Если QR-код когда-нибудь появится в продукте по-настоящему, обновите этот тест вместе с квизом и документами.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startApp, client } from './helpers.js';
import { FIRST_STEPS } from '../public/js/shared/catalog.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TEXT_FILES = new Set(['.js', '.css', '.html', '.svg', '.json', '.webmanifest', '.txt', '.sql']);

// Как тест отличает текст для человека от имени CSS-класса (doc-qr, .doc-qr).
// Строка разбирается на «слова» из символов [A-Za-z0-9_.#-]. Слово, где есть «qr», считается именем класса
// или селектором, только если оно целиком строчное и склеено дефисами или подчёркиваниями: doc-qr, .doc-qr, qr-box.
// В тексте для человека QR пишут заглавными («QR-код», «QR code») или отдельным словом, а после дефиса идёт
// русское слово, которое в «слово» не входит: получается «QR-», и это уже не имя класса. Идентификаторы вроде
// qr(code) или qrCode тоже не проходят: возвращённая в код картинка-псевдо-QR (E-07) должна ловиться.
// Встроенные base64-картинки не текст: случайные буквы в них могут сложиться в «qr».
const WORD = /[A-Za-z0-9_.#-]+/g;
const CSS_NAME = /^[.#]?[a-z0-9]+(?:[-_][a-z0-9]+)+$/;
const RU_SPELLING = /(?<![\p{L}\p{N}])(?:ку-?ар|кью-?ар|кю-?ар)(?![\p{L}\p{N}])/iu;
const BASE64_IMAGE = /data:[\w/+.-]+;base64,[A-Za-z0-9+/=]+/g;

function qrMentions(text) {
  const found = [];
  text.replace(BASE64_IMAGE, 'data:').split(/\r?\n/).forEach((line, index) => {
    const latin = (line.match(WORD) || []).some((word) => /qr/i.test(word) && !CSS_NAME.test(word));
    if (latin || RU_SPELLING.test(line)) found.push({ line: index + 1, text: line.trim().slice(0, 140) });
  });
  return found;
}

function textFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return textFiles(path);
    return TEXT_FILES.has(extname(entry.name).toLowerCase()) ? [path] : [];
  });
}

const certificateQuestion = FIRST_STEPS.quiz.findIndex((q) => /электронная справка/i.test(q.q));

let app;
before(async () => { app = await startApp(); });
after(async () => { await app.close(); });

test('тест отличает обещание QR от имени CSS-класса', () => {
  const promises = [
    "{ q: 'Справка…', a: ['в течение дня, с QR-кодом для проверки'], ok: 0 },",
    'Подлинность проверяется по QR',
    'Scan the QR code to verify',
    'сканируйте куар-код на справке',
    'function qr(code) {',
    'const qrCode = draw(code);',
  ];
  const notText = [
    '<div class="doc-qr"><span>Проверка образца</span></div>',
    '.doc-qr { display: flex; gap: 10px; }',
    '.doc-qr svg { width: 84px; height: 84px; }',
    "el.querySelector('.qr-box')",
    'background: url(data:image/png;base64,iVBORw0KGgoAAqRXYqrZ+/=) no-repeat;',
  ];
  for (const line of promises) assert.equal(qrMentions(line).length, 1, `должно считаться обещанием: ${line}`);
  for (const line of notText) assert.deepEqual(qrMentions(line), [], `имя класса или картинка, не текст: ${line}`);
});

// Читается весь текст файлов, а не только строки: так нет ложных пропусков, а картинка-псевдо-QR не вернётся в код молча.
// Комментарий с «QR» тоже сработает: перефразируйте его или опишите историю в docs/.
test('в public/ и server/ нет обещания QR-кода (имена CSS-классов вроде doc-qr не считаются)', () => {
  const files = [...textFiles(join(ROOT, 'public')), ...textFiles(join(ROOT, 'server'))];
  // Защита от пустого обхода: тест, который ничего не читает, ничего и не ловит
  assert.ok(files.length > 40, `просмотрено файлов: ${files.length}`);
  for (const known of ['public/js/shared/catalog.js', 'public/js/views/requests.js', 'server/domain/assistant.js', 'server/seed/seed.js']) {
    assert.ok(files.some((file) => relative(ROOT, file).replaceAll('\\', '/') === known), `не просмотрен ${known}`);
  }
  const found = files.flatMap((file) => qrMentions(readFileSync(file, 'utf8'))
    .map((m) => `${relative(ROOT, file).replaceAll('\\', '/')}:${m.line}: ${m.text}`));
  assert.deepEqual(found, [], `Кабинет не выдаёт QR-кодов, а упоминание есть. Исправьте обещание или перефразируйте:\n${found.join('\n')}`);
});

test('квиз «Первые шаги»: верный ответ про электронную справку обещает код и ссылку, а не QR', () => {
  assert.ok(certificateQuestion >= 0, 'в квизе есть вопрос про электронную справку');
  const question = FIRST_STEPS.quiz[certificateQuestion];
  const right = question.a[question.ok];
  assert.match(right, /в течение дня/);
  assert.match(right, /код/);
  assert.match(right, /ссылк/);
  for (const text of FIRST_STEPS.quiz.flatMap((q) => [q.q, ...q.a])) assert.deepEqual(qrMentions(text), [], text);
});

test('квиз по-прежнему засчитывается: верные ответы из каталога — 5 из 5, неверный ответ про справку — 4', async () => {
  assert.ok(certificateQuestion >= 0, 'в квизе есть вопрос про электронную справку');
  const timur = client(app.base);
  await timur.login('t.aliev');
  const right = FIRST_STEPS.quiz.map((q) => q.ok);
  const wrong = right.slice();
  wrong[certificateQuestion] = (right[certificateQuestion] + 1) % FIRST_STEPS.quiz[certificateQuestion].a.length;

  const missed = await timur.req('POST', '/api/play/quiz', { answers: wrong });
  assert.equal(missed.status, 200);
  assert.deepEqual(missed.data.result, { score: 4, total: 5, passed: true });

  const full = await timur.req('POST', '/api/play/quiz', { answers: right });
  assert.equal(full.status, 200);
  assert.deepEqual(full.data.result, { score: 5, total: 5, passed: true });
  assert.ok(full.data.play.stepsList.find((step) => step.id === 'quiz').done, 'шаг «Квиз» отмечен выполненным');
});

test('то, что квиз обещает вместо QR, есть: электронная справка приходит с кодом и публичной ссылкой проверки', async () => {
  const alina = client(app.base);
  await alina.login('a.morozova');
  const list = (await alina.req('GET', '/api/requests')).data.requests;
  const ready = list.find((r) => r.type === 'study' && r.delivery === 'electronic' && r.downloadable);
  assert.ok(ready, 'у Алины есть готовая электронная справка об обучении');
  const { document } = (await alina.req('GET', `/api/requests/${ready.id}/document`)).data;
  assert.match(document.verifyCode, /^[0-9A-F]{8}$/);
  // Ссылка #/verify/<код> открывается без входа: запрос без cookie
  const verify = await fetch(`${app.base}/api/verify/${document.verifyCode}`);
  assert.equal(verify.status, 200);
  const body = await verify.json();
  assert.equal(body.valid, true);
  assert.equal(body.number, ready.number);
  assert.equal(body.holder, 'А. Д. М.', 'раскрываются только инициалы');
});
