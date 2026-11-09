"""Cross-tab account changes and recovery from a lost session, on disposable data.

Run without arguments to start a loopback server with a temporary SQLite database:
    python test/browser-session-sync.py
An optional loopback URL may point at an already running disposable QA server.
QA_OUTPUT_DIR selects the report directory; otherwise it is outside the repository.
"""
from contextlib import contextmanager
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import sys
import tempfile
import time
import traceback
from urllib.parse import urlsplit
from urllib.request import urlopen

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(os.environ.get('QA_OUTPUT_DIR') or tempfile.mkdtemp(prefix='mgimo-session-sync-report-'))
OUT.mkdir(parents=True, exist_ok=True)
checks, errors = [], []
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')


def check(name, condition):
    checks.append({'check': name, 'passed': bool(condition)})
    print(('PASS ' if condition else 'FAIL ') + name, flush=True)
    assert condition, name


@contextmanager
def isolated_server():
    if len(sys.argv) > 1:
        base = sys.argv[1].rstrip('/')
        address = urlsplit(base)
        if address.scheme != 'http' or address.hostname not in ('127.0.0.1', 'localhost', '::1'):
            raise ValueError('This mutating regression suite accepts only a disposable loopback server')
        yield base
        return
    with tempfile.TemporaryDirectory(prefix='mgimo-session-sync-db-') as temporary:
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        base = f'http://127.0.0.1:{port}'
        env = os.environ.copy()
        env.update({'DB_FILE': str(Path(temporary) / 'session-sync.db'),
                    'HOST': '127.0.0.1', 'PORT': str(port), 'NODE_ENV': 'test',
                    'OPENROUTER_API_KEY': '', 'ANTHROPIC_API_KEY': '',
                    'COOKIE_SECURE': '0', 'TRUST_PROXY': '0', 'DEMO_RESEED_HOURS': '0'})
        server = subprocess.Popen(['node', 'server/index.js'], cwd=ROOT, env=env,
                                  stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            for _ in range(100):
                if server.poll() is not None:
                    raise RuntimeError('Disposable server stopped before becoming ready')
                try:
                    with urlopen(base, timeout=1) as response:
                        if response.status == 200:
                            break
                except OSError:
                    time.sleep(.1)
            else:
                raise RuntimeError('Disposable server did not become ready')
            yield base
        finally:
            server.terminate()
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait(timeout=5)


def settle(page):
    page.wait_for_timeout(500)
    close = page.locator('.modal-overlay [data-close]')
    if close.count():
        close.first.click()
        expect(page.locator('.modal-overlay')).to_have_count(0)


def login(page, base, account):
    if not page.url.startswith(base):
        page.goto(base + '/#/login')
    page.locator(f'[data-login="{account}"]').click()
    page.wait_for_url('**/#/home')
    page.locator('[data-me]:visible').wait_for()
    settle(page)


def logout(page):
    page.locator('[data-me]:visible').click()
    page.locator('[data-out]:visible').click()
    page.wait_for_url('**/#/login')
    page.locator('[data-login="t.aliev"]').wait_for()


def route(page, path):
    page.evaluate('(path) => { location.hash = "#/" + path; }', path)


def form(page, surname):
    route(page, 'requests/new/study')
    expect(page.locator('.prefill')).to_contain_text(surname)
    page.locator('[name="place"]').wait_for()


def open_chat(page):
    page.locator('[data-ask]:visible').first.click()
    page.locator('.drawer input').wait_for()


def populate_private_state(page, marker):
    form(page, 'Морозова Алина')
    page.locator('[name="place"]').fill(marker + '-form')
    open_chat(page)
    page.locator('.drawer input').fill(marker + '-chat')
    page.locator('.drawer [data-f] button').click()
    expect(page.locator('.drawer input')).to_be_enabled()
    expect(page.locator('.drawer [data-chat]')).to_contain_text(marker + '-chat')


def private_state_gone(page, marker):
    return page.evaluate('''(marker) => !document.body.innerText.includes(marker)
      && ![...document.querySelectorAll('input, textarea')].some(el => el.value.includes(marker))''', marker)


def ready_for_account(page, base, account, surname):
    # Recovery may safely return to login instead of adopting the new account.
    page.wait_for_function('''() => !!document.querySelector('[data-login]')
      || !!document.querySelector('[data-me]')''')
    if page.locator('[data-login]').count():
        login(page, base, account)
    settle(page)
    form(page, surname)


def submit_current_form(page, marker):
    page.locator('[name="place"]').fill(marker)
    with page.expect_response(lambda r: urlsplit(r.url).path == '/api/requests'
                              and r.request.method == 'POST') as response:
        page.locator('[data-submit]').click()
    status = response.value.status
    page.wait_for_url(re.compile(r'.*/#/requests/\d+$'))
    expect(page.locator('.req-detail')).to_contain_text(marker)
    return status


def swap_cookie_without_page_events(ctx, base, account):
    # APIRequestContext shares cookies, but does not execute the application's
    # cross-tab notifications. This models a missed event without naming its transport.
    session_response = ctx.request.get(base + '/api/auth/session')
    if session_response.status == 200:
        csrf = session_response.json()['csrf']
        ended = ctx.request.post(base + '/api/auth/logout', data={}, headers={'X-CSRF-Token': csrf})
        assert ended.status == 200, 'QA session logout failed'
    response = ctx.request.post(base + '/api/auth/login', data={'login': account, 'password': 'mgimo2026'})
    assert response.status == 200, 'QA account switch failed'


def run_suite(base):
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        for width in (360, 1366):
            ctx = browser.new_context(viewport={'width': width, 'height': 800 if width == 360 else 900},
                                      reduced_motion='reduce')
            a, b = ctx.new_page(), ctx.new_page()
            for page in (a, b):
                page.set_default_timeout(12000)
                page.on('pageerror', lambda error: errors.append(str(error)))
            login(a, base, 'a.morozova')
            b.goto(base + '/#/home')
            b.locator('[data-me]:visible').wait_for()
            marker = f'private-{width}-{time.time_ns()}'
            populate_private_state(a, marker)
            check(f'{width}: first tab holds the original form and assistant history',
                  not private_state_gone(a, marker))
            logout(b)
            a.wait_for_url('**/#/login')
            a.locator('[data-login="t.aliev"]').wait_for()
            check(f'{width}: logout in the other tab removes the old form and drawer',
                  private_state_gone(a, marker) and a.locator('.drawer').count() == 0)
            login(b, base, 't.aliev')
            # Give notifications a chance to arrive before accepting a login screen.
            a.wait_for_timeout(400)
            ready_for_account(a, base, 't.aliev', 'Алиев Тимур')
            check(f'{width}: refreshed GET uses the new profile without the old draft',
                  private_state_gone(a, marker) and 'Морозова' not in a.locator('.prefill').inner_text())
            open_chat(a)
            expect(a.locator('.drawer [data-chat]')).to_contain_text('Тимур')
            check(f'{width}: the new account has no former assistant history', private_state_gone(a, marker))
            a.locator('.drawer input').fill('Какая у меня группа?')
            with a.expect_response('**/api/assistant') as assistant:
                a.locator('.drawer [data-f] button').click()
            expect(a.locator('.drawer input')).to_be_enabled()
            check(f'{width}: assistant POST succeeds with the new session token', assistant.value.status == 200)
            a.locator('.drawer [data-x]').click()
            check(f'{width}: submitting a new request after cross-tab login succeeds',
                  submit_current_form(a, f'new-account-{width}-{time.time_ns()}') == 201)
            ctx.close()

            # Repeat without any page-originated login/logout notification.
            ctx = browser.new_context(viewport={'width': width, 'height': 800 if width == 360 else 900},
                                      reduced_motion='reduce')
            a = ctx.new_page()
            a.set_default_timeout(12000)
            a.on('pageerror', lambda error: errors.append(str(error)))
            login(a, base, 'a.morozova')
            marker = f'missed-event-{width}-{time.time_ns()}'
            populate_private_state(a, marker)
            a.locator('.drawer [data-x]').click()
            swap_cookie_without_page_events(ctx, base, 't.aliev')
            with a.expect_response(lambda r: urlsplit(r.url).path == '/api/requests'
                                   and r.request.method == 'POST') as stale:
                a.locator('[data-submit]').click()
            check(f'{width}: an old form cannot submit after an unnoticed account change',
                  stale.value.status in (401, 403, 409))
            # Wait for the stale UI to be discarded, not just an API rejection.
            a.wait_for_function('''() => !!document.querySelector('[data-login]')
              || document.querySelector('.prefill')?.textContent.includes('Алиев Тимур')''')
            ready_for_account(a, base, 't.aliev', 'Алиев Тимур')
            check(f'{width}: unnoticed account change clears the old draft', private_state_gone(a, marker))
            current_requests = ctx.request.get(base + '/api/requests').json()['requests']
            check(f'{width}: no old draft was written under the replacement account',
                  all(marker not in json.dumps(item, ensure_ascii=False) for item in current_requests))
            check(f'{width}: a corrected request succeeds after stale-session recovery',
                  submit_current_form(a, f'recovered-{width}-{time.time_ns()}') == 201)

            swap_cookie_without_page_events(ctx, base, 'a.morozova')
            route(a, 'profile')
            a.wait_for_function('''() => !!document.querySelector('[data-login]')
              || document.querySelector('#main')?.textContent.includes('Морозова Алина')''')
            ready_for_account(a, base, 'a.morozova', 'Морозова Алина')
            check(f'{width}: a GET detects a missed account-change event and recovers the profile',
                  'Алиев Тимур' not in a.locator('.prefill').inner_text())
            populate_private_state(a, marker + '-expired')
            ctx.clear_cookies()
            # A hash navigation causes a real authenticated GET, while retaining
            # the existing JavaScript state until the server reports the lost session.
            route(a, 'grades')
            a.wait_for_url('**/#/login')
            a.locator('[data-login="t.aliev"]').wait_for()
            check(f'{width}: a lost session returns to login and clears private UI',
                  private_state_gone(a, marker + '-expired') and a.locator('.drawer').count() == 0)
            login(a, base, 't.aliev')
            form(a, 'Алиев Тимур')
            check(f'{width}: login after 401 restores GET and POST with a fresh CSRF token',
                  submit_current_form(a, f'after-401-{width}-{time.time_ns()}') == 201)
            ctx.close()

            # An anonymous login page can also miss the account-change event.
            # Its next login action must recover the session already in its cookie,
            # instead of leaving the user on an unrecoverable CSRF error.
            ctx = browser.new_context(viewport={'width': width, 'height': 800 if width == 360 else 900},
                                      reduced_motion='reduce')
            a = ctx.new_page()
            a.set_default_timeout(12000)
            a.on('pageerror', lambda error: errors.append(str(error)))
            a.goto(base + '/#/login')
            a.locator('[data-login="t.aliev"]').wait_for()
            swap_cookie_without_page_events(ctx, base, 't.aliev')
            a.locator('[data-login="t.aliev"]').click()
            a.wait_for_url('**/#/home')
            settle(a)
            form(a, 'Алиев Тимур')
            check(f'{width}: a stale anonymous login page recovers after a missed login event',
                  a.locator('.auth-error').count() == 0 and 'Морозова' not in a.locator('.prefill').inner_text())
            check(f'{width}: the recovered anonymous tab can submit with a fresh CSRF token',
                  submit_current_form(a, f'anonymous-recovered-{width}-{time.time_ns()}') == 201)
            ctx.close()

            # Model a browser without BroadcastChannel. The inactive page must
            # still react promptly, without focus, navigation, or a 15-second poll.
            ctx = browser.new_context(viewport={'width': width, 'height': 800 if width == 360 else 900},
                                      reduced_motion='reduce')
            ctx.add_init_script('window.BroadcastChannel = undefined;')
            a, b = ctx.new_page(), ctx.new_page()
            for page in (a, b):
                page.set_default_timeout(12000)
                page.on('pageerror', lambda error: errors.append(str(error)))
            login(a, base, 'a.morozova')
            b.goto(base + '/#/home')
            b.locator('[data-me]:visible').wait_for()
            marker = f'storage-only-{width}-{time.time_ns()}'
            populate_private_state(a, marker)
            b.bring_to_front()
            logout(b)
            a.wait_for_url('**/#/login', timeout=3000)
            check(f'{width}: logout clears the inactive tab without BroadcastChannel',
                  private_state_gone(a, marker) and a.locator('.drawer').count() == 0)
            login(b, base, 't.aliev')
            a.wait_for_function('() => !!document.querySelector("[data-me]")', timeout=3000)
            settle(a)
            form(a, 'Алиев Тимур')
            check(f'{width}: login synchronizes the inactive tab without BroadcastChannel',
                  private_state_gone(a, marker) and 'Морозова' not in a.locator('.prefill').inner_text())
            check(f'{width}: the fallback-synchronized tab submits under the new account',
                  submit_current_form(a, f'storage-recovered-{width}-{time.time_ns()}') == 201)
            ctx.close()
        browser.close()


base = None
try:
    with isolated_server() as base:
        run_suite(base)
    check('Cross-tab recovery has no uncaught JavaScript errors', not errors)
except Exception as exception:
    errors.append(str(exception))
    traceback.print_exc()
finally:
    report = {'base': base, 'scope': 'Disposable loopback data; widths 360 and 1366; external AI disabled',
              'checks': checks, 'browser_errors': errors}
    report_path = OUT / 'browser-session-sync.json'
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'checks': len(checks), 'failed': [c for c in checks if not c['passed']],
                      'errors': len(errors), 'report': str(report_path)}, ensure_ascii=False))
sys.exit(1 if errors or any(not c['passed'] for c in checks) else 0)
