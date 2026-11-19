"""Первый экран входа и уведомление о входе на телефоне (аудит П-28) на изолированном сервере."""
import json
import os
from pathlib import Path
import sys
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:3100'
OUT = Path(os.environ.get('QA_OUTPUT_DIR') or Path(__file__).resolve().parents[1] / 'docs/evidence/final')
OUT.mkdir(parents=True, exist_ok=True)
checks, errors, measurements = [], [], []


def check(name, condition):
    checks.append({'check': name, 'passed': bool(condition)})
    print(('PASS ' if condition else 'FAIL ') + name, flush=True)


def notice(page):
    return page.locator('#toast-root .toast', has_text='Вы вошли')


def login(page, who):
    page.goto(BASE + '/#/login')
    page.locator(f'[data-login="{who}"]').wait_for()
    page.wait_for_timeout(300)
    page.locator(f'[data-login="{who}"]').click()
    page.wait_for_url('**/#/home')


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for width, height in [(360, 800), (390, 844), (1366, 768)]:
        ctx = browser.new_context(viewport={'width': width, 'height': height}, reduced_motion='reduce')
        page = ctx.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(BASE + '/#/login')
        first = page.locator('[data-login]').first
        first.wait_for()
        page.wait_for_timeout(400)
        box = first.bounding_box()
        measurements.append({'viewport': f'{width}x{height}', 'first_account_bottom': round(box['y'] + box['height'])})
        if width < 1000:
            check(f'{width}x{height}: first test account fully visible without scrolling', box['y'] >= 0 and box['y'] + box['height'] <= height)
        else:
            check(f'{width}x{height}: desktop hero keeps the crowd illustration', page.locator('.auth-crowd').is_visible())
        check(f'{width}x{height}: concept marking and title stay', page.locator('#concept').is_visible() and page.locator('.auth-title').is_visible())
        check(f'{width}x{height}: login has no horizontal scroll', page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'))

        if width in (360, 1366):
            login(page, 'a.morozova')
            notice(page).wait_for()
            check(f'{width}: sign-in notice is announced via aria-live', page.locator('#toast-root').get_attribute('aria-live') == 'polite'
                  and 'Вы вошли' in notice(page).inner_text())
            if width == 360:
                notice(page).click()
                page.wait_for_timeout(500)
                check('360: tapping the notice dismisses it', notice(page).count() == 0)
            # второй вход: сообщение «прошлый вход» остаётся
            page.wait_for_timeout(4000)
            ctx.clear_cookies()
            page.evaluate('sessionStorage.clear(); localStorage.clear()')
            login(page, 'a.morozova')
            notice(page).wait_for()
            check(f'{width}: previous-login message is still shown', 'прошлый вход' in notice(page).inner_text())
            page.wait_for_timeout(3200 if width == 360 else 4200)
            check(f'{width}: notice leaves on its own (3.2 s on phone, 4.2 s on desktop)', notice(page).count() == 0)
        ctx.close()
    browser.close()

(OUT / 'browser-mobile-entry.json').write_text(json.dumps({'checks': checks, 'measurements': measurements, 'browser_errors': errors}, ensure_ascii=False, indent=2), encoding='utf-8')
failed = [c['check'] for c in checks if not c['passed']]
print(f'{len(checks) - len(failed)}/{len(checks)} checks passed')
assert not failed and not errors, (failed, errors)
