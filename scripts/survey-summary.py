"""Сводка опроса студентов: считает ответы из responses.csv и рисует карточку для PDF.

Запуск: python scripts/survey-summary.py docs/evidence/survey-2026-11-22
Вход — responses.csv (анонимные ответы формы, без имён, почты и времени). Выход рядом:
summary.json (числа по каждому вопросу) и survey-results.png (карточка из этих чисел, не снимок экрана).
В вопросах с несколькими ответами варианты сами содержат запятые, поэтому они разбираются по списку вариантов.
"""
import csv
import html
import json
from pathlib import Path
import sys
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
FOLDER = (Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'docs' / 'evidence' / 'survey-2026-11-22').resolve()
rows = list(csv.DictReader((FOLDER / 'responses.csv').open(encoding='utf-8')))
N = len(rows)

MULTI = {
    'Откуда вы обычно узнаёте о переносе или отмене пары?':
        ['приложение вуза', 'узнаю на месте', 'почта', 'чат группы или староста', 'сайт вуза', 'не особо интересует'],
    'Что сейчас труднее всего?':
        ['делать всё с телефона', 'найти объявление деканата', 'понять, хватает ли баллов',
         'получить справку и знать, когда готова', 'вовремя узнать о переносе'],
}


def counts(question):
    result = {}
    for row in rows:
        answer = row[question]
        if question in MULTI:
            found = [option for option in MULTI[question] if option in answer]
            rest = answer
            for option in found:
                rest = rest.replace(option, '')
            assert not rest.replace(',', '').strip(), f'неизвестный вариант: {answer}'
        else:
            found = [answer]
        for option in found:
            result[option] = result.get(option, 0) + 1
    return dict(sorted(result.items(), key=lambda item: -item[1]))


questions = [q for q in rows[0].keys() if q != '№']
summary = {'responses': N, 'questions': {q: {'multiple': q in MULTI, 'counts': counts(q)} for q in questions}}
EASE = 'Насколько легко было выполнить задания с телефона?'
HARDEST = 'Какое задание было самым трудным?'
ease = [int(row[EASE]) for row in rows]
summary['ease'] = {'mean': round(sum(ease) / N, 2), 'median': sorted(ease)[N // 2]}
by_task = {}
for row in rows:
    by_task.setdefault(row[HARDEST], []).append(int(row[EASE]))
summary['ease_by_hardest_task'] = {task: {'answers': len(v), 'mean_ease': round(sum(v) / len(v), 2)} for task, v in by_task.items()}
(FOLDER / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

# Карточка: те же числа, что в summary.json
SHOW = [
    ('Сколько раз за прошлый семестр была нужна справка или заявление', 'Сколько раз за прошлый семестр вам была нужна справка или заявление в деканат?', ['0', '1', '2', '3', '4', '>5']),
    ('Как получают справку и сколько ждут', 'Как вы получаете справку и сколько ждёте?', None),
    ('Понимают ли до сессии, хватает ли баллов', 'Понимаете ли вы до сессии, хватает ли баллов до зачёта или «автомата»?', None),
    ('Что сейчас труднее всего (можно несколько)', 'Что сейчас труднее всего?', None),
    ('Насколько легко было выполнить задания в кабинете с телефона, 1–5', EASE, ['5', '4', '3', '2', '1']),
    ('Какое задание в кабинете было самым трудным', HARDEST, None),
    ('Кампус, питомец и мини-игра', 'Кампус, питомец и мини-игра помогают возвращаться в кабинет или отвлекают?', None),
    ('Стали бы пользоваться вместо нынешних способов', 'Стали бы вы пользоваться таким кабинетом вместо нынешних способов?', None),
]
blocks = []
for title, question, order in SHOW:
    data = summary['questions'][question]['counts']
    items = [(k, data.get(k, 0)) for k in order] if order else list(data.items())
    bars = ''.join(f'<div class="row"><span class="k">{html.escape(k)}</span><span class="bar"><i style="width:{v / N * 100:.1f}%"></i></span><b>{v}</b></div>' for k, v in items)
    blocks.append(f'<section><h2>{html.escape(title)}</h2>{bars}</section>')
css = """
@font-face{font-family:Onest;src:url('../../../public/fonts/onest-cyrillic.woff2');font-weight:100 900}
@font-face{font-family:Onest;src:url('../../../public/fonts/onest-latin.woff2');font-weight:100 900;unicode-range:U+0000-024F}
*{box-sizing:border-box}body{margin:0;width:1000px;background:#eef2f8;color:#17243c;font-family:Onest,Arial,sans-serif}
.page{padding:32px}.card{background:#fff;border-radius:22px;border:1px solid #d8e1ef;overflow:hidden}
.head{padding:26px 30px;background:#132f6a;color:#fff}.tag{font-size:14px;letter-spacing:.8px;text-transform:uppercase;color:#eed17a}
h1{font-size:28px;margin:8px 0 0;font-weight:650}.note{font-size:15px;color:#c9d4ea;margin-top:8px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 34px;padding:22px 30px 26px}
section{padding:10px 0}h2{font-size:15px;color:#132f6a;margin:0 0 8px;font-weight:600;line-height:1.3}
.row{display:grid;grid-template-columns:210px 1fr 30px;align-items:center;gap:10px;font-size:13.5px;margin:5px 0}
.k{color:#2d3a55;line-height:1.25}.bar{height:12px;background:#eef2f8;border-radius:6px;overflow:hidden}.bar i{display:block;height:100%;background:#d7b34d;border-radius:6px}
b{text-align:right;font-weight:600}.foot{padding:0 30px 22px;font-size:13px;color:#53647e}
"""
page = f"""<!doctype html><html lang="ru"><meta charset="utf-8"><style>{css}</style><body><div class="page"><div class="card">
<div class="head"><div class="tag">Опрос студентов · таблица ответов получена 22 ноября</div><h1>{N} ответов: что мешает сейчас и как прошли задания в кабинете</h1>
<div class="note">Средняя лёгкость заданий с телефона — {str(summary['ease']['mean']).replace('.', ',')} из 5. Числа — из responses.csv и summary.json рядом с карточкой.</div></div>
<div class="grid">{''.join(blocks)}</div>
<div class="foot">Ответы анонимные: без имён, почты и времени. Карточка построена скриптом scripts/survey-summary.py из таблицы ответов, а не снята с экрана.</div>
</div></div></body></html>"""
card = FOLDER / 'survey-results.html'
card.write_text(page, encoding='utf-8')
with sync_playwright() as p:
    browser = p.chromium.launch()
    view = browser.new_page(viewport={'width': 1000, 'height': 800}, device_scale_factor=1)
    view.goto(card.as_uri())
    view.evaluate('document.fonts.ready')
    view.locator('.page').screenshot(path=str(FOLDER / 'survey-results.png'))
    browser.close()
print(json.dumps({'responses': N, 'ease': summary['ease'], 'hardest': summary['questions'][HARDEST]['counts']}, ensure_ascii=False))
