"""Первый экран входа (аудит П-28) и сообщение о входе: на компьютере — всплывающее, на телефоне — в профиле."""
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
    # 375×548 — видимая область Safari на iPhone SE, 360×640 — частый Android: до 22 ноября первый
    # тестовый аккаунт стоял на 652–730 px и на таких экранах был ниже первого экрана
    for width, height in [(360, 800), (390, 844), (375, 548), (360, 640), (1366, 768)]:
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

        if (width, height) == (360, 800):
            # На телефоне сообщение о входе закрывало бы первую карточку (рецензия 21 ноября): его нет,
            # а время предыдущего входа показывает профиль в карточке «Безопасность»
            login(page, 'a.morozova')
            page.wait_for_timeout(1500)
            check('360: no sign-in notice over the first card on a phone', notice(page).count() == 0)
            ctx.clear_cookies()
            page.evaluate('sessionStorage.clear(); localStorage.clear()')
            login(page, 'a.morozova')
            page.goto(BASE + '/#/profile')
            security = page.locator('#security')
            security.wait_for()
            text = security.inner_text()
            check('360: profile shows the previous sign-in time', 'предыдущий:' in text and 'предыдущий: не было' not in text)
        if width == 1366:
            login(page, 'a.morozova')
            notice(page).wait_for()
            check('1366: sign-in notice is announced via aria-live', page.locator('#toast-root').get_attribute('aria-live') == 'polite'
                  and 'Вы вошли' in notice(page).inner_text())
            # второй вход: сообщение «прошлый вход» остаётся
            page.wait_for_timeout(4000)
            ctx.clear_cookies()
            page.evaluate('sessionStorage.clear(); localStorage.clear()')
            login(page, 'a.morozova')
            notice(page).wait_for()
            check('1366: previous-login message is still shown', 'прошлый вход' in notice(page).inner_text())
            page.wait_for_timeout(4200)
            check('1366: notice leaves on its own after 4.2 s', notice(page).count() == 0)
        ctx.close()
    browser.close()

(OUT / 'browser-mobile-entry.json').write_text(json.dumps({'checks': checks, 'measurements': measurements, 'browser_errors': errors}, ensure_ascii=False, indent=2), encoding='utf-8')
failed = [c['check'] for c in checks if not c['passed']]
print(f'{len(checks) - len(failed)}/{len(checks)} checks passed')
assert not failed and not errors, (failed, errors)
