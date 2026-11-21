"""Build the illustrated jury PDF with the actual journals attached.

Install requirements-qa.txt; collect evidence and render its cards before rebuilding.
"""
from pathlib import Path
from html import escape, unescape
import json
from datetime import datetime, timedelta, timezone
import re
import sys
from urllib.parse import urljoin, urlsplit

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'data' / 'qa-tools'))
import markdown
from playwright.sync_api import sync_playwright
from pypdf import PdfReader, PdfWriter

DOCS = ROOT / 'docs'
# Дата сборки по Москве (UTC+3 без перехода на летнее время) — в колонтитуле PDF
BUILD_DATE = datetime.now(timezone(timedelta(hours=3))).strftime('%d.%m.%Y')
body = markdown.markdown((DOCS / 'PROCESS.md').read_text(encoding='utf-8'), extensions=['tables', 'fenced_code'])
# PDF readers must not receive links to the author's local checkout. Images stay
# local for rendering; document/evidence links open the same files in the repo.
def portable_link(match):
    reference = unescape(match.group(1))
    if reference.startswith('#') or urlsplit(reference).scheme or urlsplit(reference).netloc:
        return match.group(0)
    target = urljoin('https://github.com/temurysega/vibe_code/blob/main/docs/', reference)
    return 'href="' + escape(target, quote=True) + '"'


body = re.sub(r'href="([^"]*)"', portable_link, body)
css = """
@font-face {font-family:Onest;src:url('../public/fonts/onest-cyrillic.woff2') format('woff2');font-weight:100 900}
@font-face {font-family:Onest;src:url('../public/fonts/onest-latin.woff2') format('woff2');font-weight:100 900;unicode-range:U+0000-024F}
body {font-family:Onest,Arial,sans-serif;color:#17243c;font-size:9.5pt;line-height:1.5;margin:0}
h1 {font-size:28pt;line-height:1.18;color:#132f6a;margin:0 0 20pt;padding-bottom:18pt;border-bottom:4pt solid #d7b34d}
h2 {font-size:17pt;color:#132f6a;margin:22pt 0 10pt;break-after:avoid}
h3 {font-size:12pt;line-height:1.3;color:#132f6a;break-after:avoid}
h4 {font-size:10.5pt;line-height:1.3;color:#132f6a;margin:14pt 0 6pt;break-after:avoid}
h4 + ul {break-before:avoid}
p {orphans:3;widows:3}
a {color:#214d9f;text-decoration:none;overflow-wrap:anywhere}
table {width:100%;border-collapse:collapse;font-size:8pt;line-height:1.4;margin:12pt 0;break-inside:avoid}
th,td {text-align:left;vertical-align:top;border:1px solid #d8dfeb;padding:6pt;overflow-wrap:anywhere}
th {background:#eef2fa;color:#132f6a} tr {break-inside:avoid}
blockquote {margin:12pt 0;padding:8pt 12pt;border-left:3pt solid #d7b34d;background:#f7f8fb}
code {font-family:Consolas,monospace;font-size:8pt;overflow-wrap:anywhere}
pre {padding:10pt;background:#f3f5f8;white-space:pre-wrap}
img {display:block;max-width:100%;max-height:206mm;object-fit:contain;margin:12pt auto;break-inside:avoid}
p:has(img) {break-inside:avoid}
figure {margin:16pt 0;break-inside:avoid}
figcaption {font-size:8pt;color:#52617a;text-align:center;margin-top:6pt}
.page-break {break-before:page}
.screenshot-pair {display:flex;align-items:flex-start;justify-content:center;gap:8mm;break-inside:avoid}
.screenshot-pair figure {flex:1;min-width:0}
.screenshot-pair img {max-height:175mm}
img[src*="prompt-"] {max-height:220mm;margin:8pt auto}
.cover-shot img {width:100%;height:110mm;object-fit:cover;object-position:top;margin:8pt 0}
.cover-shot + h2 {break-before:page}
.wide-shot img {max-height:160mm}
.dialogue-illustration img {width:100%;max-height:160mm}
.comparison-pair {display:flex;align-items:flex-start;gap:7mm;break-inside:avoid}
.comparison-pair figure {flex:1;min-width:0}
.comparison-pair img {max-height:175mm}
.prompt-page {break-before:page;break-inside:avoid}
.prompt-page h3 {margin-top:0}
.prompt-page > p {font-size:8pt;margin:5pt 0}
.prompt-page figure {margin:5pt 0}
.prompt-page img {max-height:218mm}
@media screen {body{max-width:900px;margin:40px auto;padding:24px;background:#fff}html{background:#eef2f8}}
@page {size:A4;margin:18mm 15mm 20mm}
"""
html = '<!doctype html><html lang="ru"><meta charset="utf-8"><title>Процесс создания — МГИМО Мания</title><style>' + css + '</style><body>' + body + '</body></html>'
target = DOCS / 'PROCESS.html'
target.write_text(html, encoding='utf-8', newline='\n')
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto(target.as_uri())
    page.evaluate('document.fonts.ready')
    assert page.locator('img').evaluate_all('(images) => images.every(i => i.complete && i.naturalWidth > 0)'), 'Missing screenshot'
    page.pdf(path=str(DOCS / 'PROCESS.pdf'), format='A4', print_background=True, display_header_footer=True, tagged=True, outline=True,
             header_template='<span></span>', footer_template='<div style="font:8px Arial;color:#667085;width:100%;padding:0 15mm;display:flex;justify-content:space-between"><span>МГИМО Мания · конкурсный концепт · ' + BUILD_DATE + '</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
             margin={'top':'18mm','bottom':'20mm','left':'15mm','right':'15mm'})
    browser.close()

# Embed the full source evidence, so the PDF can be reviewed without broken local links.
pdf = DOCS / 'PROCESS.pdf'
writer = PdfWriter(str(pdf), incremental=True)
attachments = [DOCS / 'evidence/history/git-history.json']
attachments += sorted((DOCS / 'evidence/subagents-2026-11-19').glob('*.json'))
attachments += sorted((DOCS / 'ai').glob('*.md'))
attachments += [DOCS / 'evidence/review-session.json']
attachments += [DOCS / 'evidence/quality-session.json']
attachments += [DOCS / 'evidence/finalization-session.json']
attachments += [DOCS / 'evidence/quality-before/run-summary.json']
attachments += [DOCS / 'evidence/quality-before/browser-review.json']
attachments += [DOCS / 'evidence/quality-before/grades-measurements.json']
attachments += [DOCS / 'evidence/deployment/review-deployment.json']
attachments += sorted((DOCS / 'evidence/deployment/review-browser').glob('*.json'))
attachments += sorted((DOCS / 'evidence/final').glob('*.txt'))
attachments += sorted((DOCS / 'evidence/final').glob('*.json'))
attachments += sorted((DOCS / 'evidence/finalization').glob('*.txt'))
attachments += sorted((DOCS / 'evidence/finalization').glob('*.json'))
attachments += sorted((DOCS / 'evidence/polish').glob('*.txt'))
attachments += sorted((DOCS / 'evidence/polish').glob('*.json'))
attachments += sorted((DOCS / 'evidence/quality-fixes').glob('*.txt'))
attachments += sorted((DOCS / 'evidence/quality-fixes').glob('*.json'))
attachments += sorted((DOCS / 'evidence/quality-fixes-first-attempt').glob('*.txt'))
attachments += sorted((DOCS / 'evidence/quality-fixes-first-attempt').glob('*.json'))
attachments += sorted((DOCS / 'evidence/quality-fixes-before-home-focus').glob('*.txt'))
attachments += sorted((DOCS / 'evidence/quality-fixes-before-home-focus').glob('*.json'))
attachments += [DOCS / 'evidence/deployment/finalization-deployment.json']
attachments += [DOCS / 'evidence/deployment/finalization-ai.json']
attachments += [DOCS / 'evidence/deployment/quality-fixes-deployment.json']
attachments += [DOCS / 'evidence/deployment/quality-fixes-browser/public-acceptance.json']
attachments += sorted((DOCS / 'evidence/deployment/finalization-browser').glob('*.json'))
for run in ['finalization-first-attempt', 'finalization-schedule-attempt', 'finalization-first-actions-attempt', 'finalization-first-actions-retry']:
    attachments += sorted((DOCS / 'evidence' / run).glob('*.json'))
    attachments += sorted((DOCS / 'evidence' / run).glob('*.txt'))
# Итоговая версия 22 ноября: журналы прогона из чистой копии, замер нагрузки и текст поручения
attachments += sorted((DOCS / 'evidence/release-1122').glob('*.txt'))
attachments += sorted((DOCS / 'evidence/release-1122').glob('*.json'))
attachments += sorted((DOCS / 'evidence/load-2026-11-21').glob('*.json'))
attachments += [DOCS / 'evidence/review-2026-11-21/prompt.md']
attachments += [DOCS / 'evidence/deployment' / name for name in
                ['openrouter-live.json', 'assistant-browser-live.json', 'production-persistence.json', 'migration-deployed.json']]
for attachment in attachments:
    if attachment.is_file():
        name = attachment.relative_to(DOCS / 'evidence').as_posix().replace('/', '-') if attachment.is_relative_to(DOCS / 'evidence') else attachment.name
        writer.add_attachment(name, attachment.read_bytes())
writer.add_metadata({'/Title': 'МГИМО Мания — история создания',
                     '/Subject': 'Сценарии, работа с ИИ, реальные результаты и журналы проверок',
                     '/Author': 'Команда проекта МГИМО Мания'})
temporary = DOCS / 'PROCESS.with-evidence.pdf'
with temporary.open('wb') as target_pdf:
    writer.write(target_pdf)
temporary.replace(pdf)
reader = PdfReader(pdf)
print(json.dumps({'pdf': 'docs/PROCESS.pdf', 'pages': len(reader.pages),
                  'embedded_files': list(reader.attachments), 'bytes': pdf.stat().st_size}, ensure_ascii=False))
