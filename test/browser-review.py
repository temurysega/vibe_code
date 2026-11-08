"""Review-driven UX checks on a disposable demo server, at 360 and 1366 px.

python test/browser-review.py [http://127.0.0.1:3100]
Set QA_OUTPUT_DIR to keep screenshots and measurements outside the source tree.
"""
import json
import os
from pathlib import Path
import sys
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:3100'
OUT = Path(os.environ.get('QA_OUTPUT_DIR') or Path(__file__).resolve().parents[1] / 'docs/evidence/final')
OUT.mkdir(parents=True, exist_ok=True)
checks, errors, measurements = [], [], []


def check(name, condition):
    checks.append({'check': name, 'passed': bool(condition)})
    print(('PASS ' if condition else 'FAIL ') + name, flush=True)
    assert condition, name


def route(page, path, selector):
    page.evaluate('(path) => { location.hash = path; }', '#/' + path)
    page.locator(selector).first.wait_for()


def login(page, user):
    page.locator(f'[data-login="{user}"]').click()
    page.wait_for_url('**/#/home')
    page.locator('[data-sec="next"]').wait_for()
    page.wait_for_timeout(500)
    close = page.locator('.modal-overlay [data-close]')
    if close.count():
        close.first.click()
        expect(page.locator('.modal-overlay')).to_have_count(0)


def grades(page):
    return page.evaluate('async () => (await fetch("/api/grades")).json()')


def visible_ids(page):
    return sorted(page.locator('#grade-disciplines [data-disc]').evaluate_all(
        '(els) => els.map(el => Number(el.dataset.disc))'))


try:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        for width in [360, 1366]:
            ctx = browser.new_context(viewport={'width': width, 'height': 800 if width == 360 else 900}, reduced_motion='reduce')
            page = ctx.new_page()
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(BASE)
            login(page, 'a.morozova')

            if width == 1366:
                cards = page.locator('.home-trio > .card').evaluate_all('(els) => els.map(el => Math.round(el.getBoundingClientRect().height))')
                deadlines = page.locator('[data-home-more="deadlines"] > summary')
                deadlines.click()
                expanded = page.locator('.home-trio > .card').evaluate_all('(els) => els.map(el => Math.round(el.getBoundingClientRect().height))')
                check('1366: expanding deadlines does not stretch adjacent overview cards',
                      expanded[1] > cards[1] and expanded[0] == cards[0] and expanded[2] == cards[2])
                deadlines.click()
                check('1366: four study destinations remain directly accessible', page.locator('.header .nav > a').count() == 4)
                life = page.locator('[data-life]')
                life.focus()
                page.keyboard.press('Enter')
                expect(page.locator('.menu')).to_be_visible()
                links = page.locator('.menu a').evaluate_all('(els) => els.map(el => el.getAttribute("href"))')
                check('1366: all four student-life destinations remain available', links == ['#/campus', '#/wardrobe', '#/shop', '#/game'])
                expect(page.locator('.menu a').first).to_be_focused()
                check('1366: keyboard enters the student-life menu', page.locator('.menu a').first.evaluate('(el) => el === document.activeElement'))
                page.screenshot(path=str(OUT / '1366-life-menu.png'), animations='disabled')
                page.keyboard.press('Escape')
                expect(page.locator('.menu')).to_have_count(0)
                check('1366: Escape restores focus to student-life opener', life.evaluate('(el) => el === document.activeElement') and life.get_attribute('aria-expanded') == 'false')
                life.click()
                page.locator('.menu a[href="#/wardrobe"]').click()
                page.wait_for_url('**/#/wardrobe')
                # The hash changes before the route's lazy import finishes on a
                # network connection; wait for the rendered navigation state.
                expect(page.locator('[data-life]')).to_have_class('on')
                check('1366: student-life link opens the existing route', page.locator('[data-life]').get_attribute('class') == 'on')
                check('1366: header navigation fits without scrolling', page.locator('.header .nav').evaluate('(el) => el.scrollWidth <= el.clientWidth + 1'))
            else:
                sizes = page.locator('#tabbar a').evaluate_all('(els) => els.map(el => parseFloat(getComputedStyle(el).fontSize))')
                check('360: all bottom navigation labels are at least 11px', len(sizes) == 5 and min(sizes) >= 11)

            route(page, 'grades', '[data-grade-filter="all"]')
            data = grades(page)
            expected = sorted(c['id'] for c in data['current'])
            risk = sorted(c['id'] for c in data['current'] if c['status'] == 'risk')
            check(f'{width}: all disciplines appear before filtering', visible_ids(page) == expected)
            complete = all(str(c['earned']) in page.locator(f'[data-disc="{c["id"]}"] .disc-points').inner_text()
                           and c['controlLabel'] in page.locator(f'[data-disc="{c["id"]}"] .disc-meta').inner_text()
                           for c in data['current'])
            check(f'{width}: compact overview preserves every score and assessment type', complete)
            check(f'{width}: grades fit the viewport', page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'))
            heights = page.locator('#grade-disciplines .disc').evaluate_all('(els) => els.map(el => Math.round(el.getBoundingClientRect().height))')
            measurements.append({'viewport': width, 'grades_all_height': page.evaluate('document.documentElement.scrollHeight'),
                                 'discipline_count': len(expected), 'discipline_card_heights': heights})
            if width == 360:
                check('360: each overview card is under 180px high', max(heights) < 180)
                check('360: detailed advice stays out of the compact overview', not page.locator('#grade-disciplines .disc-advice').first.is_visible())
            else:
                check('1366: desktop retains the detailed cards and scales', page.locator('#grade-disciplines .disc-advice').first.is_visible() and page.locator('#grade-disciplines .scale').first.is_visible())
            page.screenshot(path=str(OUT / f'{width}-grades-review.png'), full_page=True, animations='disabled')

            attention = page.locator('[data-grade-filter="attention"]')
            attention.focus()
            page.keyboard.press('Enter')
            check(f'{width}: keyboard filter shows exactly the current risks', bool(risk) and visible_ids(page) == risk)
            check(f'{width}: filter keeps keyboard focus and exposes its selected state', attention.evaluate('(el) => el === document.activeElement') and attention.get_attribute('aria-pressed') == 'true')
            expect(page.locator('[data-grade-count]')).to_have_text(f'Показано {len(risk)} из {len(expected)} дисциплин')
            check(f'{width}: live result count matches filtered list', True)
            measurements[-1]['grades_attention_height'] = page.evaluate('document.documentElement.scrollHeight')
            page.screenshot(path=str(OUT / f'{width}-grades-attention.png'), full_page=True, animations='disabled')

            card = page.locator('#grade-disciplines [data-disc]').first
            selected = next(c for c in data['current'] if c['id'] == int(card.get_attribute('data-disc')))
            card.focus()
            page.keyboard.press('Enter')
            dialog = page.locator('.modal-overlay:not(.closing) [role="dialog"]')
            expect(dialog).to_be_visible()
            expect(dialog).to_contain_text(selected['name'])
            expect(dialog).to_contain_text(selected['advice'])
            check(f'{width}: keyboard opens full discipline details and all control points', dialog.locator('.items-tbl tbody tr').count() == len(selected['items']))
            page.keyboard.press('Escape')
            expect(page.locator('.modal-overlay')).to_have_count(0)
            check(f'{width}: closing details preserves the filter and restores card focus', visible_ids(page) == risk and card.evaluate('(el) => el === document.activeElement'))
            page.locator('[data-grade-filter="all"]').focus()
            page.keyboard.press('Space')
            check(f'{width}: Space returns all disciplines', visible_ids(page) == expected)

            # Switch within this SPA so module state cannot be hidden by a reload.
            attention.click()
            page.locator('[data-me]').click()
            page.locator('.menu [data-out]').click()
            page.wait_for_url('**/#/login')
            login(page, 't.aliev')
            route(page, 'grades', '[data-grade-filter="all"]')
            second = grades(page)
            second_ids = sorted(c['id'] for c in second['current'])
            check(f'{width}: account switch resets the filter and shows only the new student courses',
                  visible_ids(page) == second_ids and page.locator('[data-grade-filter="all"]').get_attribute('aria-pressed') == 'true'
                  and expected != second_ids)
            page.locator('a[href="#/grades/session"]').click()
            page.locator('.exam-row').first.wait_for()
            check(f'{width}: session remains reachable', page.locator('.exam-row').count() > 0)
            page.locator('a[href="#/grades/history"]').click()
            expect(page.locator('#main')).to_contain_text('Зачётка пока пустая')
            check(f'{width}: first-year empty record book remains reachable', True)

            # Controlled no-risk API scenario: verifies the filter's empty state,
            # without changing grades in the database or claiming it as real data.
            fixture = json.loads(json.dumps(second))
            for course in fixture['current']:
                course['status'] = 'ok'
            page.route('**/api/grades', lambda interception: interception.fulfill(status=200, content_type='application/json', body=json.dumps(fixture)), times=1)
            route(page, 'grades', '[data-grade-filter="all"]')
            page.locator('[data-grade-filter="attention"]').click()
            expect(page.locator('.disc-empty')).to_contain_text('Дисциплин в зоне риска нет')
            check(f'{width}: no-risk API fixture gives a clear empty state', not visible_ids(page))
            page.locator('[data-grade-filter="all"]').click()
            check(f'{width}: all courses remain available after the empty state', visible_ids(page) == second_ids)
            ctx.close()
        browser.close()
    check('Review scenarios: no uncaught JavaScript errors', not errors)
finally:
    report = {'base': BASE, 'checks': checks, 'browser_errors': errors, 'measurements': measurements,
              'fixtures': 'No-risk response is intercepted in the browser; database grades are unchanged.'}
    (OUT / 'browser-review.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')

print(json.dumps({'checks': len(checks), 'failed': [item for item in checks if not item['passed']]}, ensure_ascii=False))
