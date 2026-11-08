"""Read the week, find every change, open details and export on desktop/mobile.

Run against a disposable demo server. Screenshots/reports default to TEMP.
python test/browser-schedule-readability.py http://127.0.0.1:3100
"""
import json
import os
from pathlib import Path
import sys
import tempfile

from playwright.sync_api import expect, sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:3100'
OUT = Path(os.environ.get('QA_OUTPUT_DIR') or tempfile.mkdtemp(prefix='mgimo-schedule-'))
OUT.mkdir(parents=True, exist_ok=True)
checks, errors = [], []


def check(name, condition):
    checks.append({'check': name, 'passed': bool(condition)})
    print(('PASS ' if condition else 'FAIL ') + name, flush=True)


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for width in [1366, 360]:
        ctx = browser.new_context(viewport={'width': width, 'height': 800}, reduced_motion='reduce')
        page = ctx.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        schedules = []
        page.on('response', lambda r: schedules.append(r.json())
                if '/api/schedule' in r.url and '.ics' not in r.url and r.ok else None)
        page.goto(BASE + '/#/login')
        page.locator('[data-login="a.morozova"]').click()
        page.wait_for_url('**/#/home')
        page.locator('[data-sec="day"]').wait_for()
        page.wait_for_timeout(200)
        if page.locator('.modal-overlay').count():
            page.locator('.modal-overlay').last.locator('[data-close]').first.click()
        page.goto(BASE + '/#/schedule')
        page.locator('.week').wait_for()
        expect(page.locator('.toast')).to_have_count(0, timeout=8000)
        expected = schedules[-1]
        check(f'{width}px: all six days are present', page.locator('[data-day]').count() == 6)
        check(f'{width}px: timetable fits the screen', page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'))
        page.screenshot(path=str(OUT / f'{width}-schedule-readable.png'), full_page=True)

        changes = page.locator('[data-schedule-changes]')
        check(f'{width}px: changes have a visible count', bool(expected['changes']) and changes.locator('summary b').inner_text() == str(len(expected['changes'])))
        changes.locator('summary').focus()
        page.keyboard.press('Enter')
        expect(changes).to_have_attribute('open', '')
        change_buttons = changes.locator('[data-lesson]')
        check(f'{width}px: all changes are available without sideways scrolling', change_buttons.count() == len(expected['changes']) and change_buttons.evaluate_all('(els) => els.every(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })'))
        page.screenshot(path=str(OUT / f'{width}-schedule-changes.png'), full_page=True)
        for change in expected['changes']:
            changes.locator('[data-lesson="' + change['key'] + '"]').click()
            dialog = page.locator('.modal-overlay:not(.closing) [role="dialog"]').last
            expect(dialog.locator('.modal-title')).to_have_text(change['discipline'])
            check(f'{width}px: change opens its lesson — {change["key"]}', dialog.locator('.note').is_visible())
            page.keyboard.press('Escape')
            expect(page.locator('.modal-overlay')).to_have_count(0)
        changes.locator('summary').focus()
        page.keyboard.press('Enter')
        expect(changes).not_to_have_attribute('open', '')

        if width == 360:
            for day in expected['days']:
                button = page.locator('[data-pick="' + day['date'] + '"]')
                button.focus()
                page.keyboard.press('Enter')
                expect(button).to_have_attribute('aria-pressed', 'true')
                check(f'360px: keyboard opens {day["date"]}', page.locator('[data-day="' + day['date'] + '"]').is_visible())
            first_day = next(day for day in expected['days'] if day['items'])
            page.locator('[data-pick="' + first_day['date'] + '"]').click()

        # A student can read the subject and teacher without opening each lesson.
        readable = page.locator('.lesson:visible .lesson-name, .lesson:visible .lesson-teacher').evaluate_all('''els => els.every(el => {
            const card = el.closest('.lesson').getBoundingClientRect();
            const range = document.createRange(); range.selectNodeContents(el);
            return [...range.getClientRects()].every(r => r.left >= card.left && r.right <= card.right + 1 && r.bottom <= card.bottom);
        })''')
        check(f'{width}px: visible subject and teacher text is not clipped', readable)
        lesson = page.locator('.lesson:visible').first
        subject = lesson.locator('.lesson-name').inner_text()
        teacher = lesson.locator('.lesson-teacher').inner_text()
        lesson.focus()
        page.keyboard.press('Enter')
        dialog = page.locator('.modal-overlay:not(.closing) [role="dialog"]').last
        expect(dialog.locator('.modal-title')).to_have_text(subject)
        check(f'{width}px: lesson details contain the teacher', dialog.locator('[data-teacher]').is_visible() and bool(teacher))
        dialog.locator('[data-teacher]').click()
        expect(page.locator('.modal-overlay:not(.closing)')).to_have_count(2)
        check(f'{width}px: teacher contacts open from lesson details', page.locator('.modal-overlay').last.locator('.kv').is_visible())
        page.keyboard.press('Escape')
        page.keyboard.press('Escape')
        expect(page.locator('.modal-overlay')).to_have_count(0)

        next_link = page.get_by_role('link', name='Следующая неделя', exact=True)
        next_route = next_link.get_attribute('href')
        next_link.click()
        page.wait_for_url('**/' + next_route)
        expect(page.locator('[data-day]').first).to_have_attribute('data-day', expected['next'])
        # DOM and URL are the observable result. Playwright's response callback
        # may still be resolving its JSON even after the app has rendered it.
        check(f'{width}px: next week navigation changes the timetable',
              page.evaluate('location.hash') == next_route
              and page.locator('[data-day]').first.get_attribute('data-day') != expected['monday'])
        with page.expect_download() as downloaded:
            page.locator('a[href="/api/schedule.ics"]').click()
        text = Path(downloaded.value.path()).read_text(encoding='utf-8')
        check(f'{width}px: calendar export contains lessons', 'BEGIN:VCALENDAR' in text and 'BEGIN:VEVENT' in text and 'END:VCALENDAR' in text)
        ctx.close()
    browser.close()

check('No uncaught browser errors', not errors)
result = {'base': BASE, 'checks': checks, 'browser_errors': errors}
(OUT / 'browser-schedule-readability.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'checks': len(checks), 'failed': [c for c in checks if not c['passed']], 'output': str(OUT)}, ensure_ascii=False))
sys.exit(1 if errors or any(not c['passed'] for c in checks) else 0)
