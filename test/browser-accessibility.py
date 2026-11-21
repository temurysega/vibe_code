"""Keyboard, mobile and recovery QA. Run against a disposable demo server.

python test/browser-accessibility.py [http://127.0.0.1:3100]
Requires Python Playwright and its Chromium browser.
"""
import json
import os
import sys
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:3100'
OUT = Path(os.environ.get('QA_OUTPUT_DIR') or Path(__file__).resolve().parents[1] / 'docs' / 'evidence')
OUT.mkdir(parents=True, exist_ok=True)
checks, errors, external_requests = [], [], []


def check(name, condition):
    checks.append({'check': name, 'passed': bool(condition)})
    print(('PASS ' if condition else 'FAIL ') + name, flush=True)


def visit(page, route, selector):
    page.goto(BASE + '/#/' + route)
    page.locator(selector).first.wait_for(state='visible')


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={'width': 360, 'height': 800}, reduced_motion='reduce')
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('request', lambda r: external_requests.append(r.url)
            if urlsplit(r.url).scheme in ['http', 'https'] and urlsplit(r.url).netloc != urlsplit(BASE).netloc else None)
    visit(page, 'login', '[data-login="a.morozova"]')
    page.locator('[data-login="a.morozova"]').click()
    page.wait_for_url('**/#/home')
    page.locator('[data-sec="day"]').wait_for()
    page.wait_for_timeout(500)
    if page.locator('.modal-overlay').count():
        page.locator('.modal-overlay').last.locator('[data-close]').first.click()
        page.wait_for_timeout(200)

    # A transient API failure must not leave an inert retry button.
    page.route('**/api/grades', lambda route: route.fulfill(status=503, content_type='application/json', body='{"error":"Проверка восстановления соединения"}'), times=1)
    visit(page, 'grades', '[data-retry]')
    check('503 renders a readable error', 'Проверка восстановления' in page.locator('.error-box').inner_text())
    page.locator('[data-retry]').click()
    page.locator('.disc').first.wait_for()
    check('Retry recovers grades without a manual reload', page.locator('.error-box').count() == 0)

    visit(page, 'schedule', '[data-bells]')
    page.locator('[data-bells]').focus()
    page.keyboard.press('Enter')
    dialog = page.locator('.modal-overlay:not(.closing) [role="dialog"]')
    dialog.wait_for()
    page.wait_for_timeout(90)
    check('Modal blocks interaction with background', page.locator('#main').evaluate('(el) => el.inert'))
    in_dialog = []
    for key in ['Tab'] * 6 + ['Shift+Tab'] * 6:
        page.keyboard.press(key)
        in_dialog.append(page.evaluate('!!document.activeElement.closest("[role=dialog]")'))
    check('Tab and Shift+Tab stay in the modal', all(in_dialog))
    page.keyboard.press('Escape')
    expect(page.locator('.modal-overlay')).to_have_count(0)
    check('Escape restores focus to the opener', page.locator('[data-bells]').evaluate('(el) => el === document.activeElement'))
    check('Background is available after closing modal', not page.locator('#main').evaluate('(el) => el.inert'))

    # All six mobile days are operable with the keyboard, including empty days.
    dates = page.locator('[data-pick]').evaluate_all('(els) => els.map(el => el.dataset.pick)')
    switched = []
    for date in dates:
        button = page.locator('[data-pick="' + date + '"]')
        button.focus()
        page.keyboard.press('Enter')
        switched.append(button.get_attribute('aria-pressed') == 'true' and page.locator('[data-day="' + date + '"]').is_visible())
    check('360px: every schedule day switches with Enter', len(switched) >= 6 and all(switched))

    with page.expect_download() as download_info:
        page.locator('a[href="/api/schedule.ics"]').click()
    download = download_info.value
    text = Path(download.path()).read_text(encoding='utf-8')
    check('Calendar downloads a valid non-empty ICS', download.suggested_filename.endswith('.ics') and 'BEGIN:VCALENDAR' in text and 'BEGIN:VEVENT' in text and 'END:VCALENDAR' in text)

    # Nested lesson and teacher dialogs retain focus and restore the lower dialog.
    date = page.evaluate('''() => [...document.querySelectorAll('[data-day]')]
      .find(day => day.querySelector('[data-lesson]'))?.dataset.day''')
    if date:
        page.locator('[data-pick="' + date + '"]').click()
        page.locator('[data-day="' + date + '"] [data-lesson]').first.click()
        teacher = page.locator('.modal [data-teacher]')
        if teacher.count():
            teacher.click()
            expect(page.locator('.modal-overlay:not(.closing)')).to_have_count(2)
            page.wait_for_timeout(90)
            check('Nested dialog makes lower dialog inert', page.locator('.modal-overlay').first.evaluate('(el) => el.inert'))
            page.keyboard.press('Escape')
            expect(page.locator('.modal-overlay')).to_have_count(1)
            check('Closing nested dialog restores teacher button focus', page.locator('.modal [data-teacher]').evaluate('(el) => el === document.activeElement'))
        page.keyboard.press('Escape')
        expect(page.locator('.modal-overlay')).to_have_count(0)

    # Вкладка «Сессия», а не подсказка «Первый зачёт через N дней»: она появляется за 30 дней до сессии
    visit(page, 'grades', '.grades-tabs a[href="#/grades/session"]')
    page.locator('.grades-tabs a[href="#/grades/session"]').click()
    page.locator('.exam-row').first.wait_for()
    check('360px: session is reachable from grades', '#/grades/session' in page.url and page.locator('.exam-row').count() > 0)
    page.locator('.grades-tabs a[href="#/grades/history"]').click()
    page.locator('.sem-tabs').wait_for()
    check('360px: record book is reachable from grades', page.locator('.tbl tbody tr').count() > 0)

    for route, selector in [('profile', '[data-pw]'), ('requests/new/study', '[data-form]'), ('notifications', '[data-pref]')]:
        visit(page, route, selector)
        unnamed = page.locator('#main input, #main select, #main textarea').evaluate_all('''els => els.filter(el =>
          el.type !== 'hidden' && !el.labels?.length && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby'))
          .map(el => el.name || el.outerHTML.slice(0, 80))''')
        check(route + ': fields have accessible labels', not unnamed)
        check(route + ': fits 360px', page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'))

    prior_hash = page.evaluate('location.hash')
    page.locator('.skip').focus()
    page.keyboard.press('Enter')
    check('Skip link focuses content and keeps current route', page.evaluate('document.activeElement.id === "main"') and page.evaluate('location.hash') == prior_hash)
    visit(page, 'schedule/%E0%A4%A', '[data-bells]')
    check('Malformed escaped route does not crash app', page.locator('.week').count() == 1)
    check('Reduced-motion interaction creates no tap particles', page.locator('.tap').count() == 0)
    check('No external font or asset requests', not external_requests)
    check('No uncaught browser errors', not errors)
    ctx.close()
    browser.close()

result = {'base': BASE, 'viewport': '360x800', 'checks': checks, 'browser_errors': errors, 'external_requests': external_requests}
(OUT / 'browser-accessibility.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8', newline='\n')
print(json.dumps({'checks': len(checks), 'failed': [c for c in checks if not c['passed']]}, ensure_ascii=False))
sys.exit(1 if errors or any(not c['passed'] for c in checks) else 0)
