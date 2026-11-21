"""Functional browser QA. Requires Python Playwright and a running isolated demo server."""
import json
import os
import re
import sys
import time
import traceback
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:3100'
OUT = Path(os.environ.get('QA_OUTPUT_DIR') or Path(__file__).resolve().parents[1] / 'docs' / 'evidence')
OUT.mkdir(parents=True, exist_ok=True)
checks, errors = [], []
cookie_checks = []
run = str(int(time.time()))

def check(name, condition):
    checks.append({'check': name, 'passed': bool(condition)})
    print(('PASS ' if condition else 'FAIL ') + name, flush=True)
    assert condition, name

def settle(page):
    page.wait_for_timeout(500)
    close = page.locator('.modal-overlay [data-close]')
    if close.count():
        close.first.click()

def route(page, path):
    page.evaluate('(p) => { location.hash = p; }', '#/' + path)

def login(page, user):
    if not page.url.startswith(BASE):
        page.goto(BASE)
    page.locator(f'[data-login="{user}"]').click()
    page.wait_for_url('**/#/' + ('dean' if user.startswith('dekanat') else 'home'))
    settle(page)
    if BASE.startswith('https://'):
        # Inspect flags only. Cookie values and CSRF tokens never enter QA artifacts.
        cookies = page.context.cookies(BASE)
        cookie = next((c for c in cookies if c['name'] == '__Host-mm_sid'), None)
        flags = None if cookie is None else {k: cookie[k] for k in ['name', 'path', 'secure', 'httpOnly', 'sameSite']}
        cookie_checks.append({'login': user, 'viewport': page.viewport_size, 'flags': flags})
        check(f"{page.viewport_size['width']}: {user} session cookie is Secure/HttpOnly/SameSite=Lax with __Host prefix",
              flags is not None and flags['secure'] and flags['httpOnly'] and flags['sameSite'] == 'Lax' and flags['path'] == '/')

def logout(page):
    page.locator('[data-me]:visible').click()
    page.locator('[data-out]:visible').click()
    page.wait_for_url('**/#/login')
    page.locator('[data-login="t.aliev"]').wait_for()

def open_assistant(page):
    page.locator('[data-ask]:visible').first.click()
    page.locator('.drawer input').wait_for()

def api(page, path):
    return page.evaluate('async (p) => { const r = await fetch(p); return {status:r.status, data:await r.json()}; }', path)

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        for width in [360, 1366]:
            ctx = browser.new_context(viewport={'width': width, 'height': 800 if width == 360 else 900}, device_scale_factor=1)
            page = ctx.new_page()
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.set_default_timeout(12000)
            login(page, 'a.morozova')
            check(f'{width}: first student login', api(page, '/api/me')['data']['profile']['lastName'] == 'Морозова')

            route(page, 'requests/new/visa')
            page.locator('[data-form]').wait_for()
            expect(page.locator('.prefill')).to_contain_text('Морозова Алина')
            page.locator('[data-submit]').click()
            expect(page.locator('[data-field="country"]')).to_have_class(re.compile('invalid'))
            expect(page.locator('[data-field="dates"]')).to_have_class(re.compile('invalid'))
            check(f'{width}: required fields show errors and focus first field', page.locator('[name="country"]').evaluate('(e) => e === document.activeElement'))
            page.locator('[name="country"]').fill('Сербия')
            dates = f'12–20 января 2027, проверка {width}-{run}'
            page.locator('[name="dates"]').fill(dates)
            page.locator('[data-submit]').click()
            page.wait_for_url(re.compile(r'.*/#/requests/\d+$'))
            request_id = int(page.url.rsplit('/', 1)[1])
            expect(page.locator('.req-detail')).to_contain_text(dates)
            check(f'{width}: certificate request submitted from browser', api(page, f'/api/requests/{request_id}')['status'] == 200)
            page.reload()
            expect(page.locator('.req-detail')).to_contain_text(dates)
            check(f'{width}: request persists after browser reload', True)

            # A separate staff session processes the same request through the visible queue.
            staff_ctx = browser.new_context(viewport={'width': 1366, 'height': 900}, device_scale_factor=1)
            staff = staff_ctx.new_page()
            staff.on('pageerror', lambda error: errors.append(str(error)))
            login(staff, 'dekanat.mo')
            item = staff.locator(f'[data-req="{request_id}"]')
            item.wait_for()
            if item.locator('[data-act="in_work"]').count():
                item.locator('[data-comment]').fill('Проверка жюри: данные получены')
                item.locator('[data-act="in_work"]').click()
            item.locator('[data-act="ready"]').wait_for()
            item.locator('[data-comment]').fill('Демонстрационная справка готова')
            item.locator('[data-act="ready"]').click()
            # Готовая электронная справка уходит из активной очереди в «Завершённые»
            expect(staff.locator(f'[data-req="{request_id}"]')).to_have_count(0)
            staff.locator('[data-filter="done"]').click()
            expect(staff.locator(f'[data-req="{request_id}"]')).to_contain_text('Готова')
            check(f'{width}: staff processes request through queue', api(staff, '/api/dean/requests?status=all')['status'] == 200)
            if width == 360:
                staff.screenshot(path=str(OUT / '1366-dean.png'), full_page=True, animations='disabled')
            staff_ctx.close()

            page.reload()
            page.locator(f'a[href="#/requests/{request_id}/doc"]').wait_for()
            check(f'{width}: student sees ready status and download action', api(page, f'/api/requests/{request_id}')['data']['request']['status'] == 'ready')
            if width == 360:
                page.screenshot(path=str(OUT / '360-request-ready.png'), full_page=True, animations='disabled')
            route(page, 'notifications')
            notice = page.locator(f'[data-link="#/requests/{request_id}"]').filter(has_text='готова')
            notice.wait_for()
            notice.click()
            page.wait_for_url(f'**/#/requests/{request_id}')
            check(f'{width}: ready notification opens its request', True)
            page.locator(f'a[href="#/requests/{request_id}/doc"]').click()
            expect(page.locator('article.doc')).to_contain_text('Alina Morozova')
            expect(page.locator('article.doc')).to_contain_text('not an official document')
            page.evaluate('window.__printCalled = false; window.print = () => { window.__printCalled = true; };')
            page.locator('[data-print]').click()
            check(f'{width}: download button opens print/PDF workflow', page.evaluate('window.__printCalled'))
            pdf = page.pdf(format='A4', print_background=True)
            check(f'{width}: printable demo document produces a PDF', pdf.startswith(b'%PDF-'))
            if width == 360:
                (OUT / 'demo-certificate.pdf').write_bytes(pdf)
            verify_code = api(page, f'/api/requests/{request_id}/document')['data']['document']['verifyCode']
            check(f'{width}: document verification code works', api(page, f'/api/verify/{verify_code}')['data']['valid'])

            # Hold the HTTP response to reproduce drawer close/reopen and account-switch races.
            held = []
            page.route('**/api/assistant', lambda interception: held.append(interception))
            open_assistant(page)
            page.locator('.drawer input').fill('Проверка незавершённого ответа')
            page.locator('.drawer [data-f] button').click()
            page.wait_for_timeout(100)
            expect(page.locator('.drawer input')).to_be_disabled()
            page.locator('.drawer [data-x]').click()
            open_assistant(page)
            expect(page.locator('.drawer input')).to_be_disabled()
            check(f'{width}: reopened assistant preserves pending state', len(held) == 1)
            held.pop(0).fulfill(status=200, content_type='application/json', body=json.dumps({'text': 'Ответ после повторного открытия', 'source': 'rules'}, ensure_ascii=False))
            expect(page.locator('.drawer [data-chat]')).to_contain_text('Ответ после повторного открытия')
            expect(page.locator('.drawer input')).to_be_enabled()
            check(f'{width}: pending assistant answer reaches reopened drawer', True)

            page.locator('.drawer input').fill('Личный вопрос Алины, который нельзя показать Тимуру')
            page.locator('.drawer [data-f] button').click()
            page.wait_for_timeout(100)
            expect(page.locator('.drawer input')).to_be_disabled()
            page.locator('.drawer [data-x]').click()
            logout(page)
            login(page, 't.aliev')
            check(f'{width}: second student login in same tab', api(page, '/api/me')['data']['profile']['lastName'] == 'Алиев')
            check(f'{width}: old assistant response remains pending across account switch', len(held) == 1)
            held.pop(0).fulfill(status=200, content_type='application/json', body=json.dumps({'text': 'СЕКРЕТ СТАРОГО АККАУНТА', 'source': 'rules'}, ensure_ascii=False))
            open_assistant(page)
            expect(page.locator('.drawer [data-chat]')).to_contain_text('Тимур')
            page.wait_for_timeout(150)
            chat = page.locator('.drawer [data-chat]').inner_text()
            check(f'{width}: assistant does not expose former student history or delayed response', 'Алины' not in chat and 'СЕКРЕТ' not in chat and 'повторного открытия' not in chat)
            expect(page.locator('.drawer input')).to_be_enabled()
            page.locator('.drawer [data-x]').click()
            page.unroute('**/api/assistant')

            route(page, 'requests/new/visa')
            expect(page.locator('.prefill')).to_contain_text('Алиев Тимур')
            check(f'{width}: request form refreshes profile after account switch', 'Морозова' not in page.locator('.prefill').inner_text())
            check(f'{width}: other student cannot fetch request or document', api(page, f'/api/requests/{request_id}')['status'] == 404 and api(page, f'/api/requests/{request_id}/document')['status'] == 404)
            route(page, f'requests/{request_id}')
            page.locator('.error-box').wait_for()
            check(f'{width}: direct foreign request link has a clear unavailable state', page.locator('.error-box').count() == 1)
            ctx.close()
        browser.close()
except Exception as exc:
    errors.append(str(exc))
    traceback.print_exc()
finally:
    result = {'base': BASE, 'checks': checks, 'browser_errors': errors, 'session_cookie_checks': cookie_checks}
    (OUT / 'browser-flows.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8', newline='\n')
    print(json.dumps({'checks': len(checks), 'failed': [c for c in checks if not c['passed']], 'browser_errors': errors}, ensure_ascii=False))
sys.exit(1 if errors or any(not c['passed'] for c in checks) else 0)
