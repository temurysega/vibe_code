"""Find the first study action and reach a real screen without changing data.

Run against a disposable demo server. Artifacts default to TEMP.
python test/browser-first-actions.py http://127.0.0.1:3100
"""
import json
import os
from pathlib import Path
import sys
import tempfile

from playwright.sync_api import expect, sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:3100'
OUT = Path(os.environ.get('QA_OUTPUT_DIR') or tempfile.mkdtemp(prefix='mgimo-first-actions-'))
OUT.mkdir(parents=True, exist_ok=True)
checks, errors, unwanted_writes = [], [], []


def check(name, condition):
    checks.append({'check': name, 'passed': bool(condition)})
    print(('PASS ' if condition else 'FAIL ') + name, flush=True)
    assert condition, name


def home(page):
    page.evaluate('location.hash = "#/home"')
    page.locator('[data-start-guide]').wait_for()


def login(page, username):
    page.locator(f'[data-login="{username}"]').click()
    page.wait_for_url('**/#/home')
    page.locator('[data-start-guide]').wait_for()
    # First-year accounts open onboarding after the login callback.
    page.wait_for_timeout(550)
    if page.locator('.modal-overlay').count():
        page.keyboard.press('Escape')
        expect(page.locator('.modal-overlay')).to_have_count(0)
    expect(page.locator('.toast')).to_have_count(0, timeout=8000)


def open_guide(page):
    button = page.locator('[data-start-guide]')
    button.focus()
    page.keyboard.press('Enter')
    dialog = page.locator('.modal-overlay:not(.closing) [role="dialog"]').last
    expect(dialog.locator('[data-start-route]')).to_have_count(3)
    return dialog


def track_writes(request):
    if request.method not in ['POST', 'PUT', 'PATCH', 'DELETE']:
        return
    path = request.url.split('/api/', 1)[-1].split('?', 1)[0]
    if path == 'requests' or path.startswith('requests/') or path in ['play/look', 'auth/password', 'me']:
        unwanted_writes.append({'method': request.method, 'path': path})


try:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        for width in [360, 1366]:
            height = 800 if width == 360 else 900
            ctx = browser.new_context(viewport={'width': width, 'height': height}, reduced_motion='reduce')
            page = ctx.new_page()
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('request', track_writes)
            page.goto(BASE + '/#/login')
            login(page, 'a.morozova')

            button = page.locator('[data-start-guide]')
            bounds = button.bounding_box()
            lower_edge = page.locator('#tabbar').bounding_box()['y'] if page.locator('#tabbar').is_visible() else height
            check(f'{width}: start guide is visible in the first screen',
                  button.is_visible() and bounds['y'] >= 0 and bounds['y'] + bounds['height'] <= lower_edge)
            check(f'{width}: home has no horizontal overflow', page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'))
            dialog = open_guide(page)
            check(f'{width}: Enter opens three useful study actions', dialog.is_visible())
            routes = dialog.locator('[data-start-route]').evaluate_all('(els) => els.map(el => el.getAttribute("href"))')
            check(f'{width}: guide offers schedule, grades and a study certificate',
                  set(routes) == {'#/schedule', '#/grades', '#/requests/new/study'})
            check(f'{width}: avatar setup remains optional', dialog.locator('[data-next]').count() == 1)
            check(f'{width}: guide has no horizontal overflow',
                  dialog.evaluate('(el) => el.scrollWidth <= el.clientWidth + 1')
                  and page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'))
            page.screenshot(path=str(OUT / f'{width}-first-actions.png'), animations='disabled')
            page.keyboard.press('Escape')
            expect(page.locator('.modal-overlay')).to_have_count(0)
            check(f'{width}: Escape restores focus to the guide button', button.evaluate('(el) => el === document.activeElement'))

            destinations = [('#/schedule', '.week'), ('#/grades', '.disc'), ('#/requests/new/study', '[data-form]')]
            for route, selector in destinations:
                dialog = open_guide(page)
                link = dialog.locator(f'[data-start-route][href="{route}"]')
                link.focus()
                page.keyboard.press('Enter')
                page.wait_for_url('**/' + route)
                page.locator(selector).first.wait_for()
                expect(page.locator('.modal-overlay')).to_have_count(0)
                check(f'{width}: guide opens the real {route} screen',
                      page.locator(selector).first.is_visible() and page.locator('.error-box').count() == 0)
                if route == '#/requests/new/study':
                    expect(page.locator('.prefill')).to_contain_text('Морозова Алина')
                    expect(page.locator('.prefill')).to_contain_text('МО-25-03')
                    check(f'{width}: certificate opens with Alina’s profile', page.locator('[data-submit]').is_visible())
                check(f'{width}: {route} has no horizontal overflow', page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'))
                home(page)

            # Keep the same SPA to catch cached account data in the certificate form.
            page.locator('[data-me]').click()
            page.locator('.menu [data-out]').click()
            page.wait_for_url('**/#/login')
            login(page, 't.aliev')
            dialog = open_guide(page)
            dialog.locator('[data-start-route][href="#/requests/new/study"]').click()
            page.wait_for_url('**/#/requests/new/study')
            page.locator('[data-form]').wait_for()
            expect(page.locator('.modal-overlay')).to_have_count(0)
            expect(page.locator('.prefill')).to_contain_text('Алиев Тимур')
            expect(page.locator('.prefill')).to_contain_text('МЭО-26-07')
            check(f'{width}: guide uses Timur’s profile after account switch',
                  'Морозова' not in page.locator('.prefill').inner_text())
            check(f'{width}: newcomer form has no horizontal overflow', page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'))
            ctx.close()
        browser.close()
    check('No request submissions or profile edits', not unwanted_writes)
    check('No uncaught browser errors', not errors)
finally:
    report = {'base': BASE, 'checks': checks, 'browser_errors': errors, 'unwanted_writes': unwanted_writes}
    (OUT / 'browser-first-actions.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')

print(json.dumps({'checks': len(checks), 'failed': [item for item in checks if not item['passed']], 'output': str(OUT)}, ensure_ascii=False))
