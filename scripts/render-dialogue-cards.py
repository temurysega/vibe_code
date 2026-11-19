"""Render real subagent dialogues (brief → report) into PNG cards for the jury PDF.

Input:  docs/evidence/subagents-2026-11-19/<id>.json
        {id, title, stage, model, started_msk, prompt_source, brief, report, result}
Output: docs/evidence/subagents-2026-11-19/<id>.png

Run: python scripts/render-dialogue-cards.py
The card reproduces the saved texts; long texts are shortened with a visible note,
the full texts stay in the JSON next to the image.
"""
import html
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
DIR = ROOT / 'docs' / 'evidence' / 'subagents-2026-11-19'
FONT = (ROOT / 'public' / 'fonts').as_uri()
esc = lambda value: html.escape(str(value))


def clip(text, limit):
    text = str(text).strip()
    if len(text) <= limit:
        return esc(text)
    cut = text[:limit].rsplit('\n', 1)[0]
    return esc(cut) + '\n<span class="cut">… сокращено для карточки, полный текст — в JSON рядом</span>'


CSS = f'''
@font-face{{font-family:Onest;src:url('{FONT}/onest-cyrillic.woff2');font-weight:100 900}}
@font-face{{font-family:Onest;src:url('{FONT}/onest-latin.woff2');font-weight:100 900;unicode-range:U+0000-024F}}
*{{box-sizing:border-box}}body{{margin:0;width:1000px;background:#eef2f8;font-family:Onest,Arial,sans-serif;color:#17243c}}
.page{{padding:32px}}.top{{display:flex;justify-content:space-between;font-size:14px;letter-spacing:1px;color:#52617a;margin-bottom:18px}}
.top b{{color:#14336d}}.card{{background:#fff;border:1px solid #d8e1ef;border-radius:20px;overflow:hidden}}
.head{{background:#132f6a;color:#fff;padding:22px 28px}}.tag{{font-size:13px;letter-spacing:.8px;text-transform:uppercase;color:#eed17a}}
h1{{font-size:26px;line-height:1.25;margin:8px 0 0;font-weight:650}}.meta{{font-size:14px;color:#c9d4ea;margin-top:8px}}
.body{{padding:22px 28px}}.label{{font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#53647e;margin:14px 0 8px}}
.msg{{white-space:pre-wrap;overflow-wrap:anywhere;border-radius:14px;padding:16px 18px;font-size:15px;line-height:1.5}}
.brief{{background:#f3f5f9;border-left:4px solid #c9a646;font-family:Consolas,monospace;font-size:13.5px}}
.reply{{background:#111d34;color:#e7eefc;font-family:Consolas,monospace;font-size:13.5px}}
.result{{background:#eef6f1;border-radius:12px;padding:14px 18px;margin-top:16px;font-size:15px;line-height:1.45}}
.cut{{color:#8a97ad;font-style:italic}}.foot{{font-size:12.5px;color:#53647e;margin-top:14px}}
'''

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1000, 'height': 700}, device_scale_factor=1)
    for path in sorted(DIR.glob('*.json')):
        d = json.loads(path.read_text(encoding='utf-8'))
        body = f'''<div class="page"><div class="top"><b>МГИМО МАНИЯ</b><span>РЕАЛЬНЫЙ ДИАЛОГ С СУБАГЕНТОМ</span></div>
<article class="card"><header class="head"><div class="tag">{esc(d['stage'])}</div><h1>{esc(d['title'])}</h1>
<div class="meta">{esc(d['model'])} · {esc(d['started_msk'])} · промпт: {esc(d['prompt_source'])}</div></header>
<div class="body"><div class="label">Поручение основного агента</div><div class="msg brief">{clip(d['brief'], 1500)}</div>
<div class="label">Ответ субагента</div><div class="msg reply">{clip(d['report'], 2200)}</div>
<div class="result"><b>Что изменилось в проекте:</b> {esc(d['result'])}</div></div></article>
<div class="foot">Тексты сохранены дословно: docs/evidence/subagents-2026-11-19/{esc(path.name)}</div></div>'''
        target = path.with_suffix('.html')
        target.write_text(f'<!doctype html><html lang="ru"><meta charset="utf-8"><style>{CSS}</style>{body}</html>', encoding='utf-8', newline='\n')
        page.goto(target.as_uri())
        page.evaluate('document.fonts.ready')
        page.screenshot(path=str(path.with_suffix('.png')), full_page=True)
        target.unlink()
        print('card', path.with_suffix('.png').name)
    browser.close()
