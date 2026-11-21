"""Stipend certificate QA. Run only against an isolated local demo database."""
import json
import os
import re
import sys
import time
import traceback
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect
from pypdf import PdfReader

if len(sys.argv) != 2 or urlparse(sys.argv[1]).hostname not in ('127.0.0.1', 'localhost', '::1'):
    raise SystemExit('Pass the URL of an isolated local QA server; this test creates applications.')
BASE = sys.argv[1].rstrip('/')
OUT = Path(os.environ.get('QA_OUTPUT_DIR') or Path(__file__).resolve().parents[1] / 'docs' / 'evidence')
OUT.mkdir(parents=True, exist_ok=True)
checks, errors = [], []
zero_request_id = None


def check(name, condition):
    checks.append({'check': name, 'passed': bool(condition)})
    print(('PASS ' if condition else 'FAIL ') + name, flush=True)
    assert condition, name


def api(page, path):
    return page.evaluate('async (p) => { const r = await fetch(p); return {status:r.status, data:await r.json()}; }', path)


def route(page, path):
    page.evaluate('(p) => { location.hash = p; }', '#/' + path)


def login(page, login_name):
    page.goto(BASE + '/#/login')
    page.locator(f'[data-login="{login_name}"]').click()
    page.wait_for_url('**/#/' + ('dean' if login_name.startswith('dekanat') else 'home'))
    page.wait_for_timeout(600)
    close = page.locator('.modal-overlay [data-close]')
    if close.count():
        close.first.click()


def submit_stipend(page):
    route(page, 'requests/new/stipend')
    page.locator('[data-form]').wait_for()
    page.locator('input[name="delivery"][value="electronic"]').check()
    page.locator('[data-submit]').click()
    page.wait_for_url(re.compile(r'.*/#/requests/\d+$'))
    return int(page.url.rsplit('/', 1)[1])


def inspect_document(page, width, request_id, zero=False):
    route(page, f'requests/{request_id}/doc')
    document = page.locator('article.doc')
    table = document.get_by_role('table', name='Стипендия по месяцам')
    table.wait_for()
    data = api(page, f'/api/requests/{request_id}/document')['data']['document']['stipend']
    prefix = f'{width}: ' + ('zero stipend' if zero else 'stipend')
    check(prefix + ' has six monthly rows', table.locator('tbody tr').count() == 6 and len(data['months']) == 6)
    check(prefix + ' total matches monthly amounts', data['total'] == sum(row['amount'] for row in data['months']))
    formatted_total = page.evaluate('(n) => new Intl.NumberFormat("ru-RU", {style:"currency", currency:"RUB", minimumFractionDigits:2}).format(n)', data['total'])
    expect(table.locator('tfoot')).to_contain_text(formatted_total)
    check(prefix + ' displays the correct total', True)
    expect(document).to_contain_text('Все начисления вымышлены')
    check(prefix + ' is clearly marked as fictional', data['demo'] is True)
    check(prefix + ' fits the page', not page.evaluate('document.documentElement.scrollWidth > innerWidth + 1'))
    # Also test the table itself: .doc has overflow:hidden and could conceal an oversized table.
    check(prefix + ' table is not clipped', table.evaluate('(t) => { const d = t.closest(".doc").getBoundingClientRect(); const r = t.getBoundingClientRect(); return r.left >= d.left && r.right <= d.right + 1 && t.scrollWidth <= t.clientWidth + 1; }'))
    if zero:
        expect(document).to_contain_text('За указанный период академическая стипендия не начислялась')
        expect(document).to_contain_text('Обучение по договору')
        check(prefix + ' contains zero amounts without a false award claim', data['total'] == 0 and all(row['amount'] == 0 for row in data['months']))
    else:
        check(prefix + ' contains nonzero demo accruals', data['total'] > 0)
        page.screenshot(path=str(OUT / f'{width}-stipend-document.png'), full_page=True, animations='disabled', style='#toast-root {visibility:hidden}')
        page.evaluate('window.__printCalled = false; window.print = () => { window.__printCalled = true; };')
        page.locator('[data-print]').click()
        check(prefix + ' opens print/PDF workflow', page.evaluate('window.__printCalled'))
        pdf = page.pdf(format='A4', print_background=True)
        check(prefix + ' exports a PDF', pdf.startswith(b'%PDF-'))
        if width == 360:
            (OUT / 'stipend-certificate.pdf').write_bytes(pdf)
        # «Скачать PDF» отдаёт готовый файл с сервера, без диалога печати
        with page.expect_download() as info:
            page.locator('[data-pdf]').click()
        download = info.value
        check(prefix + ' downloads a PDF file directly', bool(re.fullmatch(r'spravka-\d{4}-\d{5}\.pdf', download.suggested_filename)))
        path = OUT / f'{width}-stipend-download.pdf'
        download.save_as(str(path))
        reader = PdfReader(str(path))
        text = '\n'.join(p.extract_text() for p in reader.pages).replace('\xa0', ' ').replace('\u202f', ' ')
        total_rub = formatted_total.replace('\xa0', ' ').replace('\u202f', ' ').replace(' ₽', ' руб.')
        check(prefix + ' downloaded PDF has Cyrillic text, the total in roubles and the sample mark',
              'СПРАВКА О СТИПЕНДИИ' in text and total_rub in text and 'ОБРАЗЕЦ' in text and 'Морозова Алина' in text)
        links = [a.get_object()['/A']['/URI'] for p in reader.pages for a in p.get('/Annots', [])]
        check(prefix + ' downloaded PDF links to the public verification page', any('#/verify/' in str(u) for u in links))
    page.reload()
    page.locator('article.doc').wait_for()
    check(prefix + ' retains the same snapshot after reload', api(page, f'/api/requests/{request_id}/document')['data']['document']['stipend'] == data)


try:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        for width in [360, 1366]:
            context = browser.new_context(viewport={'width': width, 'height': 800 if width == 360 else 900}, device_scale_factor=1)
            page = context.new_page()
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.set_default_timeout(12000)
            login(page, 'a.morozova')
            request_id = submit_stipend(page)
            check(f'{width}: stipend submitted through student form', api(page, f'/api/requests/{request_id}')['status'] == 200)

            staff_context = browser.new_context(viewport={'width': width, 'height': 900}, device_scale_factor=1)
            staff = staff_context.new_page()
            staff.on('pageerror', lambda error: errors.append(str(error)))
            login(staff, 'dekanat.mo')
            item = staff.locator(f'[data-req="{request_id}"]')
            item.wait_for()
            if item.locator('[data-act="in_work"]').count():
                item.locator('[data-act="in_work"]').click()
            item.locator('[data-act="ready"]').wait_for()
            item.locator('[data-comment]').fill('Демонстрационная справка о стипендии готова')
            item.locator('[data-act="ready"]').click()
            # Готовая электронная справка уходит из активной очереди в «Завершённые»
            expect(item).to_have_count(0)
            staff.locator('[data-filter="done"]').click()
            expect(staff.locator(f'[data-req="{request_id}"]')).to_contain_text('Готова')
            check(f'{width}: staff completes stipend through queue', True)
            staff_context.close()
            page.reload()
            page.locator(f'a[href="#/requests/{request_id}/doc"]').wait_for()
            page.locator(f'a[href="#/requests/{request_id}/doc"]').click()
            inspect_document(page, width, request_id)
            context.close()

            zero_context = browser.new_context(viewport={'width': width, 'height': 800 if width == 360 else 900}, device_scale_factor=1)
            zero_page = zero_context.new_page()
            zero_page.on('pageerror', lambda error: errors.append(str(error)))
            zero_page.set_default_timeout(12000)
            login(zero_page, 't.aliev')
            check(f'{width}: contract student cannot open another stipend', api(zero_page, f'/api/requests/{request_id}/document')['status'] == 404)
            if zero_request_id is None:
                zero_request_id = submit_stipend(zero_page)
                check(f'{width}: contract student can request a certificate with no stipend', True)
                # No staff account exists for this faculty. Exercise normal demo automation once.
                deadline = time.monotonic() + 85
                while time.monotonic() < deadline:
                    status = api(zero_page, f'/api/requests/{zero_request_id}')['data']['request']['status']
                    if status == 'ready':
                        break
                    print('WAIT zero stipend: normal demo processing (' + status + ')', flush=True)
                    zero_page.wait_for_timeout(5000)
                check(f'{width}: zero stipend reaches ready through demo processing', status == 'ready')
            inspect_document(zero_page, width, zero_request_id, zero=True)
            zero_context.close()
        check('No uncaught browser errors', not errors)
        browser.close()
except Exception as exc:
    errors.append(str(exc))
    traceback.print_exc()
finally:
    result = {'base': BASE, 'checks': checks, 'browser_errors': errors}
    (OUT / 'browser-stipend.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8', newline='\n')
    print(json.dumps({'checks': len(checks), 'failed': [c for c in checks if not c['passed']], 'browser_errors': errors}, ensure_ascii=False))
sys.exit(1 if errors or any(not c['passed'] for c in checks) else 0)
