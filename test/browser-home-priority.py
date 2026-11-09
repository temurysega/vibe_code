"""Home priorities and complete day access, using a disposable demo server.

python test/browser-home-priority.py http://127.0.0.1:3100
QA_OUTPUT_DIR selects where screenshots and the JSON report are saved.
Explicit long-title, room-change and empty-state responses never alter the DB.
"""
import json
import os
from pathlib import Path
import sys
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:3100'
OUT = Path(os.environ.get('QA_OUTPUT_DIR') or Path(__file__).resolve().parents[1] / 'artifacts/home-priority')
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
    if page.locator('.modal-overlay [data-close]').count():
        page.locator('.modal-overlay [data-close]').first.click()
        expect(page.locator('.modal-overlay')).to_have_count(0)


def home(page):
    page.evaluate('location.hash = "#/home"')
    page.locator('[data-sec="next"]').wait_for()


def mobile_first_screen(page, label):
    page.evaluate('scrollTo(0, 0)')
    boundary = page.locator('#tabbar').bounding_box()['y']
    positions = page.locator('[data-home-priority]').evaluate_all('(els) => els.map(el => ({top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom}))')
    measurements.append({'viewport': 360, 'variant': label, 'priority_positions': positions, 'navigation_top': boundary})
    check(f'360 {label}: both full shortcuts fit above bottom navigation', len(positions) == 2 and all(p['top'] >= 0 and p['bottom'] <= boundary for p in positions))
    readable = page.locator('.next-title, .next-meta, .next-change').evaluate_all('''(els, boundary) => els.every(el => {
      const card = el.closest('.next-card').getBoundingClientRect();
      const range = document.createRange(); range.selectNodeContents(el);
      return [...range.getClientRects()].filter(r => r.width > 0 && r.height > 0).every(r =>
        r.top >= card.top && r.bottom <= Math.min(card.bottom, boundary) && r.left >= card.left && r.right <= card.right + 1);
    })''', boundary)
    check(f'360 {label}: complete lesson, room and change text remain readable in first screen', readable)
    check(f'360 {label}: weekly schedule remains directly reachable', page.locator('.quick a[href="#/schedule"]').is_visible())
    page.screenshot(path=str(OUT / f'360-home-{label}.png'), animations='disabled', style='#toast-root {visibility:hidden}')


try:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        for width in [360, 1366]:
            ctx = browser.new_context(viewport={'width': width, 'height': 800 if width == 360 else 900}, reduced_motion='reduce')
            page = ctx.new_page()
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(BASE)
            login(page, 'a.morozova')
            payload = page.evaluate('async () => (await fetch("/api/home")).json()')
            day = page.locator('[data-sec="day"]')
            selected = next(d for d in [payload['today'], payload['tomorrow']] if d['date'] == day.get_attribute('data-day-date'))
            expected = sorted(item['key'] for item in selected['items'])
            check(f'{width}: day retains every lesson, including schedule changes',
                  sorted(day.locator('[data-day-lesson]').evaluate_all('(els) => els.map(el => el.dataset.dayLesson)')) == expected)
            positions = page.locator('[data-home-priority]').evaluate_all('(els) => els.map(el => ({top: Math.round(el.getBoundingClientRect().top), bottom: Math.round(el.getBoundingClientRect().bottom)}))')
            measurements.append({'viewport': width, 'home_height': page.evaluate('document.documentElement.scrollHeight'),
                                 'priority_positions': positions, 'day_top': round(day.bounding_box()['y'])})

            if width == 360:
                check('360: daily list starts collapsed instead of repeating the nearest lesson', not day.evaluate('(el) => el.open') and day.locator('.day-item:visible').count() == 0)
                check('360: study and request shortcuts appear before the daily list', len(positions) == 2 and positions[-1]['bottom'] < day.bounding_box()['y'])
                check('360: both shortcuts fit above the bottom navigation', positions[-1]['bottom'] <= page.locator('#tabbar').bounding_box()['y'])
                page.screenshot(path=str(OUT / '360-home-priority.png'), animations='disabled', style='#toast-root {visibility:hidden}')
                day.locator('summary').focus()
                page.keyboard.press('Enter')
                expect(day).to_have_attribute('open', '')
                visible = sorted(day.locator('.day-item:visible').evaluate_all('(els) => els.map(el => el.dataset.dayLesson)'))
                next_key = payload['next']['key'] if payload['next'] else None
                check('360: expanded day does not repeat the nearest lesson card', next_key not in visible)
                check('360: all other lessons are accessible with one keyboard action', visible == [key for key in expected if key != next_key])
                expect(day.locator('.home-day-week')).to_be_visible()
                check('360: expanded day keeps the full weekly schedule reachable', day.locator('.home-day-week').get_attribute('href') == '#/schedule')
                page.set_viewport_size({'width': 1366, 'height': 900})
                expect(day.locator('.day-item:visible')).to_have_count(len(expected))
                check('Resize: desktop restores the complete day without losing any lesson', True)
                page.set_viewport_size({'width': 360, 'height': 800})
                expect(day).to_have_attribute('open', '')
                day.locator('summary').focus()
                page.keyboard.press('Space')
                check('360: Space collapses the day again', not day.evaluate('(el) => el.open'))

                study = page.locator('[data-home-priority="study"]')
                risk = payload['grades']['risk'][0]
                check('360: priority opens the actual at-risk discipline', study.get_attribute('href') == f'#/grades/{risk["id"]}')
                study.click()
                dialog = page.locator('.modal-overlay [role="dialog"]')
                expect(dialog).to_contain_text(risk['name'])
                expect(dialog).to_contain_text(risk['advice'])
                check('360: one click reaches the explanation and advice for that risk', True)
                page.keyboard.press('Escape')
                expect(page.locator('.modal-overlay')).to_have_count(0)
                home(page)
                ready = next(item for item in payload['requests'] if item['status'] == 'ready')
                request = page.locator('[data-home-priority="request"]')
                check('360: ready document takes priority over a pending request', request.get_attribute('href') == f'#/requests/{ready["id"]}')
                request.click()
                page.wait_for_url(f'**/#/requests/{ready["id"]}')
                expect(page.locator('#main')).to_contain_text(ready['number'])
                check('360: request shortcut opens the matching document status', True)
                home(page)
            else:
                check('1366: full day remains visible without an extra action', day.evaluate('(el) => el.open') and day.locator('.day-item:visible').count() == len(expected))
                check('1366: mobile shortcuts do not duplicate the desktop overview', not page.locator('[data-sec="priority"]').is_visible())
                check('1366: existing study, deadlines and request cards remain visible', page.locator('.home-trio > .card:visible').count() == 3)
                page.screenshot(path=str(OUT / '1366-home-priority.png'), full_page=True, animations='disabled', style='#toast-root {visibility:hidden}')
                deadlines = page.locator('[data-sec="deadlines"]')
                more = deadlines.locator('[data-home-more="deadlines"]')
                if more.count():
                    check('1366: nearest deadlines are visible without a long list', deadlines.locator('.dl:visible').count() == 2)
                    more.locator('summary').focus()
                    page.keyboard.press('Enter')
                    expect(deadlines.locator('.dl:visible')).to_have_count(len(payload['deadlines']))
                    check('1366: keyboard reveals every remaining deadline', True)
                    page.keyboard.press('Space')
                    check('1366: full deadline list can be collapsed again', not more.evaluate('(el) => el.open'))
            if width == 360:
                # A long discipline and a room-change note previously displaced the
                # ready-document shortcut below the fixed mobile navigation.
                for name, changed in [('long-title', False), ('long-title-room-change', True), ('live-long-title-room-change', True)]:
                    fixture = json.loads(json.dumps(payload))
                    fixture['next']['discipline'] = 'Теория международных отношений и дипломатический протокол'
                    fixture['next']['room'] = '3047'
                    fixture['next']['change'] = {'type': 'room', 'from': '1023', 'reason': 'В ауд. 1023 меняют проектор'} if changed else None
                    if name.startswith('live-'):
                        # Freeze Date, not timers, so the current-lesson wording is
                        # covered independently of the real time when QA runs.
                        page.clock.set_fixed_time('2026-11-09T08:10:00Z')
                        fixture['next'].update({'date': '2026-11-09', 'start': '10:30', 'end': '11:50'})
                    page.evaluate('location.hash = "#/profile"')
                    page.locator('[data-pw]').wait_for()
                    page.route('**/api/home', lambda interception: interception.fulfill(status=200, content_type='application/json', body=json.dumps(fixture)), times=1)
                    home(page)
                    expect(page.locator('.next-title')).to_have_text(fixture['next']['discipline'])
                    if changed:
                        expect(page.locator('.next-change')).to_contain_text('1023')
                        expect(page.locator('.next-change')).to_contain_text(fixture['next']['change']['reason'])
                    if name.startswith('live-'):
                        expect(page.locator('.next-count-mobile')).to_contain_text('Ещё 40 мин')
                    mobile_first_screen(page, name)
            check(f'{width}: home has no horizontal overflow', page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'))

            # Change accounts in the same SPA, so a fresh page cannot mask stale data.
            page.locator('[data-me]').click()
            page.locator('.menu [data-out]').click()
            page.wait_for_url('**/#/login')
            login(page, 't.aliev')
            second = page.evaluate('async () => (await fetch("/api/home")).json()')
            check(f'{width}: first-year account has a direct first-request route',
                  not second['requests'] and page.locator('[data-home-priority="request"]').get_attribute('href') == '#/requests/new/study')
            if width == 360:
                expect(page.locator('[data-home-priority="request"]')).to_contain_text('Заказать первую справку')
                check('360: account switch resets the daily disclosure', not page.locator('[data-sec="day"]').evaluate('(el) => el.open'))
                page.locator('[data-home-priority="request"]').click()
                page.locator('[data-form]').wait_for()
                check('360: newcomer shortcut reaches the prefilled study-certificate form', page.locator('[data-submit]').count() == 1)
            else:
                page.evaluate('location.hash = "#/profile"')
                page.locator('.profile-layout').wait_for()

            # Explicit empty-state fixture; this is not evidence about real grades.
            fixture = json.loads(json.dumps(second))
            fixture['grades']['risk'] = []
            fixture['grades']['summary']['tips'] = []
            fixture['grades']['summary']['risk'] = 0
            fixture['grades']['summary']['debts'] = 0
            fixture['grades']['summary']['headline'] = 'Учебных рисков нет'
            fixture['next'] = None
            for name in ['today', 'tomorrow']:
                fixture[name]['items'] = []
                fixture[name]['holiday'] = None
            page.route('**/api/home', lambda interception: interception.fulfill(status=200, content_type='application/json', body=json.dumps(fixture)), times=1)
            home(page)
            check(f'{width}: no-risk fixture keeps a useful study destination', page.locator('[data-home-priority="study"]').get_attribute('href') == '#/grades')
            if width == 360:
                expect(page.locator('[data-home-priority="study"]')).to_contain_text('Ваш первый семестр')
                page.locator('[data-sec="day"] > summary').click()
            expect(page.locator('.day-empty')).to_contain_text('Пар нет')
            check(f'{width}: empty day has an explicit state and schedule access', page.locator('[data-sec="day"] a[href="#/schedule"]:visible').count() > 0)
            ctx.close()
        browser.close()
    check('Home priority scenarios: no uncaught JavaScript errors', not errors)
finally:
    report = {'base': BASE, 'checks': checks, 'browser_errors': errors, 'measurements': measurements,
              'fixtures': 'Long-title and room-change mobile /api/home responses; one no-risk, empty-day response per viewport. No academic DB changes.'}
    (OUT / 'browser-home-priority.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')

print(json.dumps({'checks': len(checks), 'failed': [item for item in checks if not item['passed']]}, ensure_ascii=False))
