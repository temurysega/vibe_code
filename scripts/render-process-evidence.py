"""Render clearly labelled prompt reconstructions and actual evidence into readable cards.

These are project-owned document illustrations, not screenshots of historical AI chats.
Inputs remain available as JSON/text beside the PDF for independent inspection.
"""
import html
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / 'docs'
# Папка последнего прогона collect-evidence.py; можно передать другую первым аргументом
RUN = sys.argv[1] if len(sys.argv) > 1 else 'quality-fixes'
OUT = DOCS / 'evidence' / 'process'
OUT.mkdir(parents=True, exist_ok=True)
esc = lambda value: html.escape(str(value))
css = '''
@font-face{font-family:Onest;src:url('../../../public/fonts/onest-cyrillic.woff2');font-weight:100 900}
@font-face{font-family:Onest;src:url('../../../public/fonts/onest-latin.woff2');font-weight:100 900;unicode-range:U+0000-024F}
*{box-sizing:border-box}body{margin:0;width:1000px;background:#eef2f8;color:#17243c;font-family:Onest,Arial,sans-serif}
.page{padding:35px}.brand{display:flex;justify-content:space-between;font-size:14px;letter-spacing:1.1px;color:#52617a;margin-bottom:25px}
.brand b{color:#14336d}.card{background:#fff;border-radius:22px;overflow:hidden;border:1px solid #d8e1ef}
.head{padding:28px 32px;background:#132f6a;color:#fff}.tag{font-size:14px;letter-spacing:.8px;text-transform:uppercase;color:#eed17a}
h1{font-size:30px;line-height:1.25;margin:10px 0 0;font-weight:650}.body{padding:28px 32px;font-size:19px;line-height:1.48}
.notice{padding:14px 18px;background:#fff6df;border-left:4px solid #c9a646;font-size:16px;line-height:1.45;margin-bottom:22px}
.label{font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#53647e;margin:20px 0 9px}
.prompt{white-space:pre-wrap}.result{background:#eef6f1;border-radius:12px;padding:18px 20px;margin-top:24px;font-size:17px}
.sources{font-size:14px;color:#53647e;overflow-wrap:anywhere;margin-top:18px}.footer{font-size:13px;color:#53647e;margin-top:18px}
pre{white-space:pre-wrap;overflow-wrap:anywhere;font:16px/1.5 Consolas,monospace;background:#111d34;color:#e7eefc;padding:24px;border-radius:14px;margin:15px 0}
table{width:100%;border-collapse:collapse;font-size:17px}td,th{text-align:left;vertical-align:top;padding:14px 10px;border-bottom:1px solid #e1e7f0}th{color:#53647e;font-size:14px}
.metrics{display:flex;gap:14px;margin-bottom:22px}.metric{flex:1;background:#eef3fb;padding:18px;border-radius:14px;font-size:14px}.metric b{display:block;font-size:32px;color:#14336d}
.commit{font-family:Consolas,monospace;color:#14336d;font-weight:bold}.small{font-size:15px;color:#53647e}
'''


def card(page, filename, title, tag, content, footer):
    body = f'<div class="page"><div class="brand"><b>МГИМО МАНИЯ</b><span>ИСТОРИЯ СОЗДАНИЯ</span></div><article class="card"><header class="head"><div class="tag">{esc(tag)}</div><h1>{esc(title)}</h1></header><div class="body">{content}</div></article><div class="footer">{esc(footer)}</div></div>'
    target = OUT / f'{filename}.html'
    target.write_text(f'<!doctype html><html lang="ru"><meta charset="utf-8"><title>{esc(title)}</title><style>{css}</style>{body}</html>', encoding='utf-8', newline='\n')
    page.goto(target.as_uri())
    page.evaluate('document.fonts.ready')
    page.screenshot(path=str(OUT / f'{filename}.png'), full_page=True, animations='disabled')


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1000, 'height': 700}, device_scale_factor=1)
    prompts = json.loads((DOCS / 'PROMPTS.json').read_text(encoding='utf-8'))
    if isinstance(prompts, dict):
        prompts = prompts['prompts']
    for index, item in enumerate(prompts, 1):
        evidence = item.get('evidence', [])
        if isinstance(evidence, list):
            evidence = ' · '.join(str(x) for x in evidence)
        content = f'<div class="notice"><b>Реконструкция задания по исходникам.</b> Не оригинальная переписка и не снимок интерфейса ИИ-сервиса.</div><div class="label">Контекст: {esc(item.get("tool", "ИИ-ассистент"))}</div><div class="prompt">{esc(item["prompt"])}</div><div class="result"><b>Связанный результат в проекте</b><br>{esc(item["result"])}</div><div class="sources"><b>Материалы:</b> {esc(evidence)}</div>'
        card(page, f'prompt-{index:02}', item['title'], f'Постановка задачи / {index:02}', content,
             'Редакционная иллюстрация для PDF · полные тексты и происхождение: docs/PROMPTS.json')

    history = json.loads((DOCS / 'evidence/history/git-history.json').read_text(encoding='utf-8'))
    selected = ['9c74eef', '832c17b', '26a17f0', '4f1e623', '00882b7', '969bdf4', '6376d05', '19e9672', '0e3d1c3']
    rows = [c for c in history['commits'] if c['commit'][:7] in selected]
    stat = history['summary']
    content = f'<div class="notice">Данные экспортированы из Git. Коммиты 4 ноября созданы скриптом за 2 мин 21 с в конце первой сессии Claude Code: они показывают устройство кода, а не хронологию работы. С 8 ноября каждый коммит — отдельная итерация. Атрибуция в коммите не раскрывает текст промпта.</div><div class="metrics"><div class="metric"><b>{stat["commits"]}</b>коммитов в снимке истории</div><div class="metric"><b>{stat["commits_with_claude_coauthor"]}</b>с атрибуцией Claude</div></div><table><thead><tr><th>Версия</th><th>Зафиксированное изменение</th></tr></thead><tbody>'
    for row in rows:
        content += f'<tr><td><span class="commit">{row["commit"][:7]}</span><br><span class="small">{esc(row["date"][:10])}</span></td><td>{esc(row["subject"])}</td></tr>'
    content += '</tbody></table><div class="sources">Полный экспорт: docs/evidence/history/git-history.json<br>Снимок до текущей доработки: ' + esc(history['snapshot_head'][:7]) + '</div>'
    card(page, 'git-history', 'От учебного ядра до опубликованного кабинета', 'Журнал изменений / Git', content,
         'Выборка реальных записей репозитория · даты взяты из метаданных Git')

    summary = json.loads((DOCS / 'evidence' / RUN / 'run-summary.json').read_text(encoding='utf-8'))
    unit = next(x for x in summary['stages'] if 'tests' in x)
    log = (DOCS / 'evidence' / RUN / 'unit-tests.txt').read_text(encoding='utf-8')
    lines = log.splitlines()
    test_names = [line for line in lines if line.startswith('# Subtest:')]
    totals = [line for line in lines if any(line.startswith('# ' + x) for x in ['tests ', 'suites ', 'pass ', 'fail ', 'cancelled ', 'skipped ', 'todo ', 'duration_ms '])]
    excerpt = '\n'.join(lines[:4] + [''] + test_names[:8] + ['… (полный журнал приложен отдельным файлом)', ''] + test_names[-6:] + [''] + totals)
    content = f'<div class="metrics"><div class="metric"><b>{unit["passed"]}/{unit["tests"]}</b>автоматических тестов</div><div class="metric"><b>{unit["exit_code"]}</b>код завершения</div></div><div class="small">{esc(summary["started_msk"])} · отдельная тестовая база</div><pre>{esc(excerpt)}</pre><div class="sources">Полный журнал: docs/evidence/' + RUN + '/unit-tests.txt<br>Среда: Node.js; внешние ключи ИИ отключены.</div>'
    card(page, 'test-results', 'Права доступа, сохранение и предметная логика', 'Фактический вывод запуска / фрагмент', content,
         'Визуализация сохранённого журнала команд · строки тестов не реконструированы')

    stages = [x for x in summary['stages'] if 'checks' in x]
    total = sum(x['checks'] for x in stages)
    passed = sum(x['passed'] for x in stages)
    content = f'<div class="notice">Локальная финальная версия · 360 и 1366 px · изолированная SQLite. Это не повторная проверка публикации на VPS.</div><div class="metrics"><div class="metric"><b>{passed}/{total}</b>браузерных проверок</div><div class="metric"><b>{sum(len(x["browser_errors"]) for x in stages)}</b>необработанных ошибок JS</div></div><table><thead><tr><th>Сценарии</th><th>Результат</th></tr></thead><tbody>'
    for stage in stages:
        content += f'<tr><td>{esc(Path(stage["journal"]).stem)}</td><td>{stage["passed"]} / {stage["checks"]}</td></tr>'
    content += '</tbody></table><div class="label">Выдержки из фактических журналов</div>'
    excerpt = []
    for stage in stages:
        actual = (DOCS / 'evidence' / RUN / stage['journal']).read_text(encoding='utf-8').splitlines()
        excerpt.extend([line for line in actual if line.startswith('PASS ')][-3:])
    content += '<pre>' + esc('\n'.join(excerpt)) + '</pre><div class="sources">Полные журналы и отчёты: docs/evidence/' + RUN + '/<br>Снимок кода SHA-256: ' + esc(summary['tested_source_sha256']) + '</div>'
    card(page, 'browser-results', 'Один кабинет на телефоне и компьютере', 'Журнал браузерных сценариев', content,
         'Скриншоты приложения и машиночитаемые JSON-отчёты приложены к документу')
    browser.close()
print(f'Rendered {len(prompts) + 3} evidence cards in docs/evidence/process')
