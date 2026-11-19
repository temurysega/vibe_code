"""Markup injection check: dean announcement and request comment must render as text, not as HTML."""
import json
import os
from pathlib import Path
import sys
from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:3941').rstrip('/')
OUT = Path(os.environ.get('QA_OUTPUT_DIR') or Path(__file__).resolve().parents[1] / 'docs/evidence/final')
OUT.mkdir(parents=True, exist_ok=True)
PASSWORD = 'mgimo2026'
IMG = '<img src=x onerror="window.__xss=1">'
SCRIPT = '<script>window.__xss=2</script>'
PAYLOAD = f'{IMG} {SCRIPT}'
checks, errors = [], []


def check(name, condition):
    checks.append({'check': name, 'passed': bool(condition)})
    print(('PASS ' if condition else 'FAIL ') + name, flush=True)
    assert condition, name


def api(ctx, method, path, csrf=None, data=None):
    headers = {'X-CSRF-Token': csrf} if csrf else {}
    response = ctx.request.fetch(BASE + path, method=method, headers=headers, data=data)
    return response.status, response.json()


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    # 1. Dean publishes the hostile announcement and comments on a student's request.
    dean = browser.new_context()
    status, body = api(dean, 'POST', '/api/auth/login', data={'login': 'dekanat.mo', 'password': PASSWORD})
    check('Dean signs in', status == 200)
    csrf = body['csrf']
    status, _ = api(dean, 'POST', '/api/dean/announcements', csrf, {'title': PAYLOAD, 'body': PAYLOAD, 'audience': 'faculty'})
    check('Dean announcement with markup is accepted by the server', status == 200)

    student_probe = browser.new_context()
    status, body = api(student_probe, 'POST', '/api/auth/login', data={'login': 'a.morozova', 'password': PASSWORD})
    status, listing = api(student_probe, 'GET', '/api/requests')
    target = next((r for r in listing['requests'] if r['status'] == 'in_work'), None)
    check('Student has a request in work for the dean comment', target is not None)
    student_probe.close()
    status, _ = api(dean, 'PATCH', f"/api/dean/requests/{target['id']}", csrf, {'status': 'ready', 'comment': PAYLOAD})
    check('Dean request comment with markup is accepted by the server', status == 200)
    dean.close()

    # 2. The student opens notifications and the request on narrow and wide screens.
    for width in [360, 1366]:
        ctx = browser.new_context(viewport={'width': width, 'height': 800 if width == 360 else 900}, reduced_motion='reduce')
        page = ctx.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('dialog', lambda d: (errors.append('dialog: ' + d.message), d.dismiss()))
        page.goto(BASE)
        page.locator('[data-login="a.morozova"]').click()
        page.wait_for_url('**/#/home')
        page.locator('[data-sec="next"]').wait_for()
        for label, route, marker in [('notifications', '#/notifications', '.h1'), ('request', f"#/requests/{target['id']}", '.timeline')]:
            page.goto(BASE + '/' + route)
            page.locator(marker).first.wait_for()
            page.wait_for_timeout(700)
            check(f'{width} {label}: markup text is shown as text', IMG in page.locator('body').inner_text())
            check(f'{width} {label}: window.__xss is undefined', page.evaluate('typeof window.__xss') == 'undefined')
            check(f'{width} {label}: no injected img or script in the DOM', page.evaluate('''() => ({
              img: document.querySelectorAll('img[src="x"], [onerror]').length,
              script: [...document.scripts].filter((s) => s.textContent.includes('__xss')).length })''') == {'img': 0, 'script': 0})
            check(f'{width} {label}: page fits viewport', page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'))
        ctx.close()
    browser.close()

check('No uncaught JavaScript errors or dialogs', not errors)
report = {'base': BASE, 'checks': checks, 'browser_errors': errors,
          'payload': PAYLOAD, 'scope': 'Dean announcement title/body and request comment, seen by the student at 360 and 1366 px.'}
(OUT / 'browser-xss.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'checks': len(checks), 'failed': [x for x in checks if not x['passed']]}, ensure_ascii=False))
