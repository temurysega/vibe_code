"""Verify the compact request form without submitting or changing user data."""
import json
import os
from pathlib import Path
import sys
from playwright.sync_api import sync_playwright, expect

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:3100').rstrip('/')
OUT = Path(os.environ.get('QA_OUTPUT_DIR') or Path(__file__).resolve().parents[1] / 'docs/evidence/final')
OUT.mkdir(parents=True, exist_ok=True)
checks, errors, measurements = [], [], []


def check(name, condition):
    checks.append({'check': name, 'passed': bool(condition)})
    print(('PASS ' if condition else 'FAIL ') + name, flush=True)
    assert condition, name


def login(page, user):
    page.locator(f'[data-login="{user}"]').click()
    page.wait_for_url('**/#/home')
    page.locator('[data-sec="next"]').wait_for()
    page.wait_for_timeout(500)
    close = page.locator('.modal-overlay [data-close]')
    if close.count():
        close.first.click()
        expect(page.locator('.modal-overlay')).to_have_count(0)


def request_form(page):
    page.evaluate('location.hash = "#/requests/new/study"')
    page.locator('[data-form]').wait_for()


try:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        for width in [360, 1366]:
            context = browser.new_context(viewport={'width': width, 'height': 800 if width == 360 else 900}, reduced_motion='reduce')
            page = context.new_page()
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(BASE)
            login(page, 'a.morozova')
            request_form(page)
            profile = page.evaluate('async () => (await fetch("/api/me")).json()')['profile']
            prefill = page.locator('[data-prefill]')
            summary = prefill.locator('summary')
            expect(summary).to_contain_text(profile['lastName'])
            expect(summary).to_contain_text(profile['group'])
            check(f'{width}: student and group stay visible before opening profile details', True)
            check(f'{width}: profile starts compact on mobile and expanded on desktop', prefill.evaluate('(el) => el.open') == (width > 720))
            measurements.append({'viewport': width, 'request_height': page.evaluate('document.documentElement.scrollHeight'),
                                 'first_field_top': round(page.locator('[name="place"]').evaluate('(el) => el.getBoundingClientRect().top + scrollY')),
                                 'submit_top': round(page.locator('[data-submit]').evaluate('(el) => el.getBoundingClientRect().top + scrollY'))})
            page.screenshot(path=str(OUT / f'{width}-request-compact.png'), full_page=True, animations='disabled', style='#toast-root {visibility:hidden}')
            summary.focus()
            page.keyboard.press('Enter')
            check(f'{width}: Enter toggles profile details', prefill.evaluate('(el) => el.open') == (width <= 720))
            if width > 720:
                page.keyboard.press('Space')
            expect(prefill.locator('dd')).to_contain_text(profile['faculty']['name'])
            check(f'{width}: full faculty information remains available', prefill.locator('dd').is_visible())
            field = page.locator('[name="place"]')
            field.fill('Для предъявления в библиотеке')
            summary.focus()
            page.keyboard.press('Enter')
            expect(field).to_have_value('Для предъявления в библиотеке')
            check(f'{width}: collapsing profile preserves entered request data', True)
            electronic = page.locator('[name="delivery"][value="electronic"]')
            paper = page.locator('[name="delivery"][value="paper"]')
            electronic.focus()
            page.keyboard.press('ArrowRight')
            expect(paper).to_be_checked()
            form_values = page.locator('[data-form]').evaluate('(form) => Object.fromEntries(new FormData(form))')
            check(f'{width}: keyboard changes delivery and form retains the selected value', form_values['delivery'] == 'paper')
            check(f'{width}: both delivery choices and full form fit the viewport', page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'))

            # A new session must rebuild both the visible summary and hidden details.
            page.locator('[data-me]').click()
            page.locator('.menu [data-out]').click()
            page.wait_for_url('**/#/login')
            login(page, 't.aliev')
            request_form(page)
            second = page.evaluate('async () => (await fetch("/api/me")).json()')['profile']
            prefill = page.locator('[data-prefill]')
            expect(prefill.locator('summary')).to_contain_text(second['lastName'])
            check(f'{width}: account switch replaces visible and hidden profile data',
                  profile['lastName'] not in prefill.text_content() and second['faculty']['name'] in prefill.text_content())
            expect(page.locator('[name="place"]')).to_have_value('')
            check(f'{width}: new account starts with an empty request form', True)
            context.close()
        browser.close()
    check('Compact request: no uncaught JavaScript errors', not errors)
finally:
    (OUT / 'browser-request-compact.json').write_text(json.dumps({'base': BASE, 'checks': checks, 'browser_errors': errors, 'measurements': measurements}, ensure_ascii=False, indent=2), encoding='utf-8')
