"""Browser QA: python test/browser-smoke.py [http://127.0.0.1:3100]. Requires Playwright."""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:3100'
OUT = Path(__file__).resolve().parents[1] / 'docs' / 'evidence'
OUT.mkdir(parents=True, exist_ok=True)
errors = []
checks = []

def check(name, condition):
    checks.append({'check': name, 'passed': bool(condition)})
    print(('PASS ' if condition else 'FAIL ') + name, flush=True)

def settle(page):
    page.wait_for_timeout(700)
    page.locator('.modal-overlay [data-close]').first.click() if page.locator('.modal-overlay [data-close]').count() else None

def capture(page, name):
    page.screenshot(path=str(OUT / (name + '.png')), full_page=True, animations='disabled', style='#toast-root {visibility:hidden}')
    if name == '360-home':
        page.screenshot(path=str(OUT / (name + '-viewport.png')), animations='disabled', style='#toast-root {visibility:hidden}')

def layout(page, name):
    overflow = page.evaluate('document.documentElement.scrollWidth > innerWidth + 1')
    check(name + ': no horizontal page overflow', not overflow)
    check(name + ': no error state', page.locator('.error-box').count() == 0)

def login(page, user):
    page.goto(BASE + '/#/login')
    page.locator('[data-login="' + user + '"]').click()
    page.wait_for_url('**/#/' + ('dean' if user.startswith('dekanat') else 'home'))
    settle(page)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for width in [1366, 360]:
        ctx = browser.new_context(viewport={'width': width, 'height': 900 if width > 360 else 800}, device_scale_factor=1)
        page = ctx.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(BASE)
        page.locator('[data-login="a.morozova"]').wait_for()
        layout(page, str(width) + ' login')
        capture(page, f'{width}-login')
        login(page, 'a.morozova')
        for route in ['home', 'profile', 'schedule', 'grades', 'grades/session', 'requests', 'requests/new/study', 'notifications', 'campus', 'wardrobe', 'shop', 'game']:
            page.goto(BASE + '/#/' + route)
            settle(page)
            name = str(width) + '-' + route.replace('/', '-')
            layout(page, name)
            if route in ['home', 'schedule', 'grades', 'requests/new/study', 'profile']:
                capture(page, name)
        ctx.close()
    browser.close()

result = {'base': BASE, 'checks': checks, 'browser_errors': errors}
(OUT / 'browser-results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8', newline='\n')
print(json.dumps({'checks': len(checks), 'failed': [c for c in checks if not c['passed']], 'browser_errors': errors}, ensure_ascii=False))
sys.exit(1 if errors or any(not c['passed'] for c in checks) else 0)
