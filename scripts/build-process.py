"""Build the illustrated jury PDF with the actual journals attached.

Install requirements-qa.txt; collect evidence and render its cards before rebuilding.
"""
from pathlib import Path
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'data' / 'qa-tools'))
import markdown
from playwright.sync_api import sync_playwright
from pypdf import PdfReader, PdfWriter

DOCS = ROOT / 'docs'
body = markdown.markdown((DOCS / 'PROCESS.md').read_text(encoding='utf-8'), extensions=['tables', 'fenced_code'])
body = re.sub(r'(<h3>Карточка [\s\S]*?</figure>)', r'<section class="prompt-page">\1</section>', body)
css = """
@font-face {font-family:Onest;src:url('../public/fonts/onest-cyrillic.woff2') format('woff2');font-weight:100 900}
@font-face {font-family:Onest;src:url('../public/fonts/onest-latin.woff2') format('woff2');font-weight:100 900;unicode-range:U+0000-024F}
body {font-family:Onest,Arial,sans-serif;color:#17243c;font-size:9.5pt;line-height:1.5;margin:0}
h1 {font-size:28pt;line-height:1.18;color:#132f6a;margin:0 0 20pt;padding-bottom:18pt;border-bottom:4pt solid #d7b34d}
h2 {font-size:17pt;color:#132f6a;margin:22pt 0 10pt;break-after:avoid}
h3 {font-size:12pt;line-height:1.3;color:#132f6a;break-after:avoid}
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
             header_template='<span></span>', footer_template='<div style="font:8px Arial;color:#667085;width:100%;padding:0 15mm;display:flex;justify-content:space-between"><span>МГИМО Мания · конкурсный концепт · 08.11.2026</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
             margin={'top':'18mm','bottom':'20mm','left':'15mm','right':'15mm'})
    browser.close()

# Embed the full source evidence, so the PDF can be reviewed without broken local links.
pdf = DOCS / 'PROCESS.pdf'
writer = PdfWriter(str(pdf), incremental=True)
attachments = [DOCS / 'PROMPTS.json', DOCS / 'evidence/history/git-history.json']
attachments += sorted((DOCS / 'evidence/final').glob('*.txt'))
attachments += sorted((DOCS / 'evidence/final').glob('*.json'))
attachments += [DOCS / 'evidence/deployment' / name for name in
                ['openrouter-live.json', 'assistant-browser-live.json', 'production-persistence.json', 'migration-deployed.json']]
for attachment in attachments:
    if attachment.is_file():
        writer.add_attachment(attachment.name, attachment.read_bytes())
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
