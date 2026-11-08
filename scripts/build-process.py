"""Build the jury document: pip install Markdown playwright; python scripts/build-process.py."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'data' / 'qa-tools'))
import markdown
from playwright.sync_api import sync_playwright

DOCS = ROOT / 'docs'
body = markdown.markdown((DOCS / 'PROCESS.md').read_text(encoding='utf-8'), extensions=['tables', 'fenced_code'])
css = """
@font-face {font-family:Onest;src:url('../public/fonts/onest-cyrillic.woff2') format('woff2');font-weight:100 900}
body {font-family:Arial,sans-serif;color:#17243c;font-size:10pt;line-height:1.5;margin:0}
h1 {font-size:26pt;line-height:1.2;color:#132f6a;margin:0 0 16pt}
h2 {font-size:16pt;color:#132f6a;margin:22pt 0 8pt;break-after:avoid}
h3 {break-after:avoid}
p {orphans:3;widows:3}
a {color:#214d9f;text-decoration:none;overflow-wrap:anywhere}
table {width:100%;border-collapse:collapse;font-size:8pt;line-height:1.4;margin:12pt 0}
th,td {text-align:left;vertical-align:top;border:1px solid #d8dfeb;padding:6pt;overflow-wrap:anywhere}
th {background:#eef2fa;color:#132f6a} tr {break-inside:avoid}
blockquote {margin:12pt 0;padding:8pt 12pt;border-left:3pt solid #d7b34d;background:#f7f8fb}
code {font-family:Consolas,monospace;font-size:8pt;overflow-wrap:anywhere}
pre {padding:10pt;background:#f3f5f8;white-space:pre-wrap}
img {display:block;max-width:100%;max-height:210mm;object-fit:contain;margin:12pt auto;break-inside:avoid}
p:has(img) {break-inside:avoid}
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
    page.pdf(path=str(DOCS / 'PROCESS.pdf'), format='A4', print_background=True, display_header_footer=True,
             header_template='<span></span>', footer_template='<div style="font:8px Arial;color:#667085;width:100%;padding:0 15mm;display:flex;justify-content:space-between"><span>МГИМО Мания · конкурсный концепт · 08.11.2026</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
             margin={'top':'18mm','bottom':'20mm','left':'15mm','right':'15mm'})
    browser.close()
print('Created docs/PROCESS.html and docs/PROCESS.pdf')
