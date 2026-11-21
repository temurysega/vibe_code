// PDF электронной справки для прямой загрузки: A4, шрифт Onest с кириллицей, пометка «Образец».
// Текст берётся из того же модуля, что и страница справки в браузере (public/js/shared/document.js).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PDFDocument, PDFString, rgb, degrees } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { ROOT } from '../config.js';
import { documentModel, codeGroups } from '../../public/js/shared/document.js';

let fontBytes = null;
const fontFile = () => fontBytes || (fontBytes = readFileSync(resolve(ROOT, 'server/assets/onest-pdf.ttf')));

const NAVY = rgb(0.059, 0.176, 0.412);
const INK = rgb(0.09, 0.14, 0.24);
const MUTED = rgb(0.36, 0.41, 0.5);
const GOLD = rgb(0.79, 0.65, 0.27);
const MARK = rgb(0.86, 0.89, 0.94);
const W = 595.28;
const H = 841.89;
const M = 56;

export async function documentPdf(d, history, verifyUrl) {
  const m = documentModel(d, history);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(`${m.title} № ${d.number} — образец`);
  pdf.setAuthor(m.org);
  pdf.setSubject(m.sample);
  pdf.setCreator('МГИМО Мания — конкурсный концепт');
  pdf.setLanguage(m.en ? 'en' : 'ru');
  const font = await pdf.embedFont(fontFile(), { subset: true });
  // В шрифте нет знака рубля и редких символов: «руб.» как в бумажной справке, эмодзи и знаки без начертания выпадают, а не печатаются пустыми квадратами
  const glyphs = new Set(font.getCharacterSet());
  const clean = (value) => Array.from(String(value).replace(/\s?₽/g, '\u00a0руб.').replace(/[\u2009\u202f]/g, '\u00a0'), (ch) => (glyphs.has(ch.codePointAt(0)) || /[ \t\r\n]/.test(ch) ? ch : '')).join('');
  const width = (text, size) => font.widthOfTextAtSize(text, size);

  let page;
  let y;
  const newPage = () => {
    page = pdf.addPage([W, H]);
    // Пометка «Образец» по диагонали на каждой странице
    page.drawText(m.watermark, { x: 112, y: 250, size: 92, font, color: MARK, rotate: degrees(38), opacity: 0.55 });
    y = H - M;
  };
  const room = (need) => { if (y - need < M) newPage(); };
  // Слово шире строки (адрес проверки) режется по знакам, чтобы не уйти за поле
  const pieces = (word, size, max) => {
    const out = [];
    let part = '';
    for (const ch of word) {
      if (part && width(part + ch, size) > max) { out.push(part); part = ''; }
      part += ch;
    }
    return part ? out.concat(part) : out;
  };
  const wrap = (text, size, max) => {
    const lines = [];
    let line = '';
    for (const word of clean(text).split(/[ \t\r\n]+/).filter(Boolean).flatMap((w) => (width(w, size) > max ? pieces(w, size, max) : [w]))) {
      const next = line ? `${line} ${word}` : word;
      if (width(next, size) <= max || !line) line = next;
      else { lines.push(line); line = word; }
    }
    if (line) lines.push(line);
    return lines;
  };
  const text = (value, { size = 11, color = INK, x = M, max = W - 2 * M, align = 'left', gap = 1.5 } = {}) => {
    for (const line of wrap(value, size, max)) {
      room(size * gap);
      const lx = align === 'center' ? x + (max - width(line, size)) / 2 : align === 'right' ? x + max - width(line, size) : x;
      page.drawText(line, { x: lx, y: y - size, size, font, color });
      y -= size * gap;
    }
  };
  const rule = (color = GOLD, thickness = 1.5) => { room(10); page.drawLine({ start: { x: M, y: y - 4 }, end: { x: W - M, y: y - 4 }, thickness, color }); y -= 14; };
  const table = (head, rows, cols, size = 9.5) => {
    const xs = cols.reduce((acc, w, i) => acc.concat(i ? acc[i - 1] + cols[i - 1] : M), []);
    const row = (cells, color) => {
      const wrapped = cells.map((c, i) => wrap(c, size, cols[i] - 8));
      const h = Math.max(...wrapped.map((l) => l.length)) * size * 1.35 + 6;
      room(h);
      wrapped.forEach((lines, i) => lines.forEach((l, k) => {
        const lx = i ? xs[i] + cols[i] - 8 - width(l, size) : xs[i];
        page.drawText(l, { x: lx, y: y - size - k * size * 1.35, size, font, color });
      }));
      y -= h;
      page.drawLine({ start: { x: M, y: y + 2 }, end: { x: M + cols.reduce((a, b) => a + b, 0), y: y + 2 }, thickness: 0.5, color: MARK });
    };
    row(head, MUTED);
    rows.forEach((r) => row(r, INK));
  };

  newPage();
  text(m.org, { size: 11, color: NAVY });
  text(m.sample, { size: 9, color: MUTED });
  rule();
  y -= 8;
  text(m.title.toUpperCase(), { size: 17, color: NAVY, align: 'center', gap: 1.4 });
  text(m.numberLine, { size: 10, color: MUTED, align: 'center' });
  y -= 10;
  m.paragraphs.forEach((p) => { text(p.map((r) => r.t).join(''), { size: 11 }); y -= 6; });
  if (m.stipend) {
    text(m.stipend.intro.map((r) => r.t).join(''), { size: 11 });
    y -= 4;
    table(m.stipend.head, m.stipend.rows.map((r) => [`${r.month} — ${r.reason}`, r.amount]).concat([[m.stipend.total.label, m.stipend.total.amount]]), [W - 2 * M - 120, 120]);
    if (m.stipend.zero) { y -= 6; text(m.stipend.zero, { size: 10 }); }
    y -= 6;
    text(m.stipend.note, { size: 8.5, color: MUTED });
  }
  if (m.transcript) {
    y -= 4;
    table(m.transcript.head, m.transcript.rows, [W - 2 * M - 180, 60, 60, 60]);
  }
  y -= 24;
  room(110);
  const top = y;
  text(m.sign, { size: 10.5, max: 230 });
  page.drawLine({ start: { x: M, y: y - 14 }, end: { x: M + 200, y: y - 14 }, thickness: 0.8, color: INK });
  y -= 22;
  text(m.unsigned, { size: 8.5, color: MUTED, max: 230 });
  y = top;
  const vx = W - M - 230;
  text(`${m.verifyLabel}:`, { size: 9, color: MUTED, x: vx, max: 230 });
  text(codeGroups(d.verifyCode), { size: 13, color: NAVY, x: vx, max: 230 });
  const urlTop = y;
  text(verifyUrl, { size: 8, color: MUTED, x: vx, max: 230, gap: 1.35 });
  // Адрес проверки — живая ссылка: на телефоне её можно открыть касанием
  page.node.addAnnot(pdf.context.register(pdf.context.obj({
    Type: 'Annot', Subtype: 'Link', Rect: [vx, y, vx + 230, urlTop], Border: [0, 0, 0],
    A: { Type: 'Action', S: 'URI', URI: PDFString.of(verifyUrl) },
  })));
  // Круглая «печать» концепта, а не вуза
  const cx = W - M - 60;
  const cy = Math.max(M + 50, y - 60);
  page.drawCircle({ x: cx, y: cy, size: 42, borderColor: GOLD, borderWidth: 1.5, opacity: 0, borderOpacity: 0.9 });
  [m.brand, m.en ? 'demo' : 'демо', m.en ? 'sample' : 'образец'].forEach((s, i) => {
    page.drawText(s, { x: cx - width(s, 8) / 2, y: cy + 8 - i * 11, size: 8, font, color: GOLD });
  });
  // Без потоков объектов файл открывают и старые просмотрщики на телефонах
  return pdf.save({ useObjectStreams: false });
}
