"""Снимки одной версии кабинета для сравнения «ранняя — итоговая» на одинаковых кадрах.

Запуск: сервер нужной версии на временной базе (для старого коммита — во временном git worktree),
затем python scripts/shoot-version.py http://127.0.0.1:<порт> <папка> <метка> <коммит>.
Вход — через API под вымышленной Алиной Морозовой (публичный тестовый пароль из README),
поэтому разница в экране входа между версиями не мешает. Кадры: вход и главная на 360×800
и главная на 1366×768, только первый экран. Рядом пишется JSON: коммит, адрес, время съёмки по Москве.
"""
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import sys
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

if len(sys.argv) != 5 or urlparse(sys.argv[1]).hostname not in ('127.0.0.1', 'localhost', '::1'):
    raise SystemExit('Использование: shoot-version.py http://127.0.0.1:<порт> <папка> <метка> <коммит> — только локальный сервер')
BASE, OUT, LABEL, COMMIT = sys.argv[1].rstrip('/'), Path(sys.argv[2]), sys.argv[3], sys.argv[4]
OUT.mkdir(parents=True, exist_ok=True)
MSK = timezone(timedelta(hours=3))
shots = []

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for width, height, is_mobile in [(360, 800, True), (1366, 768, False)]:
        ctx = browser.new_context(viewport={'width': width, 'height': height}, is_mobile=is_mobile, has_touch=is_mobile, reduced_motion='reduce')
        page = ctx.new_page()
        if width == 360:
            page.goto(BASE + '/#/login')
            page.wait_for_timeout(1200)
            name = f'{LABEL}-360-login.png'
            page.screenshot(path=str(OUT / name), animations='disabled')
            shots.append(name)
        response = ctx.request.post(BASE + '/api/auth/login', data={'login': 'a.morozova', 'password': 'mgimo2026'}, headers={'Origin': BASE})
        assert response.status == 200, response.status
        # Полная загрузка страницы: смена одного хэша не перечитала бы сеанс после входа через API
        page.goto(BASE + '/#/home')
        page.reload()
        page.wait_for_timeout(2500)
        # Приветственное окно первого входа закрываем, чтобы сравнивать сам экран
        if page.locator('.modal-overlay [data-close]').count():
            page.locator('.modal-overlay [data-close]').first.click()
            page.wait_for_timeout(600)
        name = f'{LABEL}-{width}-home.png'
        page.screenshot(path=str(OUT / name), animations='disabled', style='#toast-root {visibility:hidden}')
        shots.append(name)
        ctx.close()
    browser.close()

meta = {'label': LABEL, 'commit': COMMIT, 'base': BASE, 'taken_at_msk': datetime.now(MSK).isoformat(timespec='minutes'), 'shots': shots}
(OUT / f'{LABEL}.json').write_text(json.dumps(meta, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(meta, ensure_ascii=False))
