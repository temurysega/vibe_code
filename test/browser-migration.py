"""Reproduce and retire the previous site's cached navigation in real Chromium.

python test/browser-migration.py
Requires Python Playwright and Chromium. Uses only an ephemeral localhost server;
no production site, credentials, app database or backup archive is accessed.
The legacy worker fixture is the original deployed 1.1.17 worker. Its precached
asset URLs return harmless placeholder bytes; its navigation logic is unchanged.
"""
import json
import os
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import expect, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
OUT = Path(os.environ.get('QA_OUTPUT_DIR') or ROOT / 'docs' / 'evidence' / 'deployment')
LEGACY_WORKER = (ROOT / 'test' / 'fixtures' / 'legacy-sw.js').read_bytes()
REPLACEMENT = (ROOT / 'public' / 'sw.js').read_bytes()
HELPER = (ROOT / 'public' / 'js' / 'legacy-worker.js').read_bytes()
OLD_HTML = b'<!doctype html><title>Legacy fixture</title><h1 id="legacy">Legacy cached site</h1>'
NEW_HTML = (b'<!doctype html><title>Current fixture</title><h1 id="current">Current portal</h1>'
            b'<script src="/js/legacy-worker.js" defer></script>')
checks, errors = [], []
state = {'legacy': True, 'worker_requests': 0}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = urlsplit(self.path).path
        content_type = 'text/html; charset=utf-8'
        if path == '/sw.js':
            state['worker_requests'] += 1
            body = LEGACY_WORKER if state['legacy'] else REPLACEMENT
            content_type = 'application/javascript; charset=utf-8'
        elif path == '/js/legacy-worker.js':
            body, content_type = HELPER, 'application/javascript; charset=utf-8'
        elif path.startswith('/assets/') or path.startswith('/icons/') or path == '/favicon.png':
            body, content_type = b'/* harmless legacy precache fixture */', 'text/plain'
        elif path == '/manifest.webmanifest':
            body, content_type = b'{}', 'application/manifest+json'
        else:
            body = OLD_HTML if state['legacy'] else NEW_HTML
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        if path == '/sw.js':
            self.send_header('Service-Worker-Allowed', '/')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_):
        pass


def check(name, condition):
    checks.append({'check': name, 'passed': bool(condition)})
    print(('PASS ' if condition else 'FAIL ') + name, flush=True)


def watch(page):
    page.on('pageerror', lambda error: errors.append(str(error)))
    return page


def install_legacy(context, base, route='/'):
    page = watch(context.new_page())
    page.goto(base + route)
    page.evaluate("navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready)")
    page.wait_for_function('!!navigator.serviceWorker.controller')
    page.reload()
    expect(page.locator('#legacy')).to_be_visible()
    page.evaluate("""async () => {
        const cache = await caches.open('unrelated-cache');
        await cache.put('/unrelated', new Response('keep this cache'));
        localStorage.setItem('migration-test', 'keep this value');
        document.cookie = 'migration-test=keep; SameSite=Lax; path=/';
    }""")
    return page


def wait_retired(page):
    page.wait_for_function("""async () =>
        (await navigator.serviceWorker.getRegistrations()).length === 0 &&
        !(await caches.keys()).some(key => key.startsWith('zk-'))
    """)


def storage_kept(page):
    return page.evaluate("""async () => ({
        cache: await (await (await caches.open('unrelated-cache')).match('/unrelated')).text(),
        local: localStorage.getItem('migration-test'),
        cookie: document.cookie.includes('migration-test=keep')
    })""") == {'cache': 'keep this cache', 'local': 'keep this value', 'cookie': True}


server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
server.daemon_threads = True
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
base = 'http://127.0.0.1:' + str(server.server_port)
failure = None
try:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context()
        first = install_legacy(context, base, '/?tab=one#/old')
        second = watch(context.new_page())
        second.goto(base + '/another-route?tab=two#/saved')
        expect(second.locator('#legacy')).to_be_visible()
        urls = [first.url, second.url]
        check('Exact legacy worker controls both open tabs', all(
            page.evaluate("!!navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL.endsWith('/sw.js')")
            for page in [first, second]))
        check('Legacy release cache is present', first.evaluate("caches.keys().then(keys => keys.includes('zk-873ea503dea4'))"))

        state['legacy'] = False
        check('Origin serves current content after replacement', 'id="current"' in context.request.get(base).text())
        check('Old worker still serves cached content after origin replacement',
              'id="legacy"' in first.evaluate("fetch('/index.html').then(response => response.text())"))
        # The browser update algorithm is triggered explicitly, avoiding its
        # scheduling interval; both documents remain open throughout activation.
        first.evaluate("void navigator.serviceWorker.getRegistration().then(registration => registration.update())")
        for page in [first, second]:
            expect(page.locator('#current')).to_be_visible(timeout=15000)
            wait_retired(page)
        check('Replacement migrates both existing tabs without closing them', all(
            page.locator('#current').is_visible() and page.locator('#legacy').count() == 0
            for page in [first, second]))
        check('Migration preserves each open tab URL including query and hash', urls == [first.url, second.url])
        check('Only legacy cache is deleted; other cache and browser data survive', storage_kept(first))
        check('Replacement unregisters the legacy service worker', first.evaluate(
            'navigator.serviceWorker.getRegistrations().then(registrations => registrations.length === 0)'))
        first.reload()
        expect(first.locator('#current')).to_be_visible()
        check('Reload stays on current site without a service worker', first.evaluate('navigator.serviceWorker.controller === null'))
        context.close()

        # A hard refresh bypasses the old fetch handler, but can leave the old
        # registration behind. The current page helper must update it as well.
        state['legacy'] = True
        hard_context = browser.new_context()
        hard = install_legacy(hard_context, base)
        state['legacy'] = False
        cdp = hard_context.new_cdp_session(hard)
        cdp.send('Network.enable')
        cdp.send('Network.setBypassServiceWorker', {'bypass': True})
        worker_requests_before = state['worker_requests']
        hard.reload()
        expect(hard.locator('#current')).to_be_visible()
        wait_retired(hard)
        check('Hard refresh helper updates the existing worker from the network',
              state['worker_requests'] > worker_requests_before)
        check('Hard refresh migration preserves unrelated cache, cookie and localStorage', storage_kept(hard))
        cdp.send('Network.setBypassServiceWorker', {'bypass': False})
        normal_response = hard.goto(base + '/after-hard-refresh')
        expect(hard.locator('#current')).to_be_visible()
        check('Current site comes from network after bypass is disabled',
              not normal_response.from_service_worker and hard.evaluate(
                  'navigator.serviceWorker.getRegistrations().then(registrations => registrations.length === 0)'))
        hard_context.close()

        clean_context = browser.new_context()
        clean = watch(clean_context.new_page())
        requests_before = state['worker_requests']
        clean.goto(base + '/clean-visitor')
        expect(clean.locator('#current')).to_be_visible()
        check('Clean visit creates no registration or cache', clean.evaluate("""async () =>
            (await navigator.serviceWorker.getRegistrations()).length === 0 &&
            (await caches.keys()).length === 0 && !navigator.serviceWorker.controller
        """))
        check('Clean visit never requests a service worker', state['worker_requests'] == requests_before)
        check('No browser JavaScript errors', not errors)
        clean_context.close()
        browser.close()
except Exception as exc:
    failure = f'{type(exc).__name__}: {exc}'
    check('Scenario completes', False)
    print(failure, flush=True)
finally:
    server.shutdown()
    server.server_close()
    thread.join(timeout=5)
    OUT.mkdir(parents=True, exist_ok=True)
    report = {
        'checked_at': datetime.now(timezone.utc).isoformat(),
        'scope': 'Isolated localhost Chromium; original legacy worker, current migration scripts',
        'checks': checks,
        'browser_errors': errors,
        'failure': failure,
        'passed': sum(item['passed'] for item in checks),
        'failed': sum(not item['passed'] for item in checks),
    }
    (OUT / 'browser-migration.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')

raise SystemExit(0 if failure is None and all(item['passed'] for item in checks) else 1)
