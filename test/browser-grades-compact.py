"""Check the mobile grades overview and its complete desktop counterpart.

Run against a disposable local demo server. QA_OUTPUT_DIR controls report output.
The checks read grades and use demo login/logout; they never edit academic data.
"""
import json
import os
from pathlib import Path
import sys
from playwright.sync_api import sync_playwright, expect

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:3100').rstrip('/')
OUT = Path(os.environ.get('QA_OUTPUT_DIR') or Path(__file__).resolve().parents[1] / 'artifacts/grades-compact')
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


def open_grades(page):
    page.evaluate('location.hash = "#/grades"')
    page.locator('[data-grade-filter="all"]').wait_for()
    return page.evaluate('async () => (await fetch("/api/grades")).json()')


def ids(page):
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
            data = open_grades(page)
            # Capture the settled page, once the temporary login toast has gone.
            expect(page.locator('#toast-root .toast')).to_have_count(0, timeout=10000)
            expected = sorted(course['id'] for course in data['current'])
            overview = page.locator('[data-grade-overview]')
            summary = overview.locator('summary')
            check(f'{width}: every discipline remains available', ids(page) == expected)
            check(f'{width}: no horizontal page overflow', page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'))
            metric = page.evaluate('''() => ({
              viewport: innerWidth, height: document.documentElement.scrollHeight,
              filter_top: document.querySelector('.grade-filters').getBoundingClientRect().top,
              filter_bottom: document.querySelector('.grade-filters').getBoundingClientRect().bottom,
              first_discipline_top: document.querySelector('[data-disc]').getBoundingClientRect().top,
              first_discipline_bottom: document.querySelector('[data-disc]').getBoundingClientRect().bottom,
              bottom_navigation_top: document.querySelector('#tabbar').getBoundingClientRect().top
            })''')
            measurements.append(metric)
            page.screenshot(path=str(OUT / f'{width}-grades-compact-viewport.png'), animations='disabled')
            page.screenshot(path=str(OUT / f'{width}-grades-compact.png'), full_page=True, animations='disabled')

            if width == 360:
                check('360: extended statistics start collapsed', not overview.evaluate('(el) => el.open'))
                check('360: filters fit in the first screen above the bottom navigation',
                      metric['filter_top'] >= 0 and metric['filter_bottom'] < metric['bottom_navigation_top'])
                check('360: first discipline fits completely in the first screen', metric['first_discipline_bottom'] < metric['bottom_navigation_top'])
                nav = page.locator('#tabbar a').evaluate_all('''els => els.map(el => {
                  const text = [...el.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
                  const range = document.createRange(); range.selectNode(text);
                  return {font: parseFloat(getComputedStyle(el).fontSize), width: el.clientWidth, textWidth: range.getBoundingClientRect().width};
                })''')
                check('360: bottom labels are at least 12px and fit their controls',
                      len(nav) == 5 and all(label['font'] >= 12 and label['textWidth'] <= label['width'] + 1 for label in nav))
                summary.focus()
                page.keyboard.press('Enter')
                expect(overview.locator('.stat-row')).to_be_visible()
                check('360: Enter reveals full statistics and keeps focus', overview.evaluate('(el) => el.open') and summary.evaluate('(el) => el === document.activeElement'))
                metric['expanded_height'] = page.evaluate('document.documentElement.scrollHeight')
                check('360: collapsed overview saves meaningful scrolling', metric['expanded_height'] - metric['height'] > 400)
            else:
                check('1366: full overview is expanded without an extra action', overview.evaluate('(el) => el.open') and not summary.is_visible())

            expect(overview.locator('.stat-row')).to_contain_text(str(data['summary']['excellent']))
            expect(overview.locator('.ring-wrap')).to_contain_text(f"{data['summary']['earned']} из {data['summary']['possible']} баллов")
            expect(overview.locator('.ring-wrap')).to_contain_text(f"{data['summary']['rank']['place']} из {data['summary']['rank']['of']}")
            expect(overview.locator('.note')).to_contain_text(data['summary']['stipend']['label'])
            check(f'{width}: scores, ranking, attendance and scholarship stay accessible',
                  overview.locator('.stat-row').is_visible() and overview.locator('.ring').is_visible()
                  and 'посещаемость' in overview.inner_text())
            page.screenshot(path=str(OUT / f'{width}-grades-statistics.png'), full_page=True, animations='disabled')

            if width == 360:
                summary.focus()
                page.keyboard.press('Space')
                expect(overview.locator('.stat-row')).not_to_be_visible()
                check('360: Space closes statistics and keeps focus', not overview.evaluate('(el) => el.open') and summary.evaluate('(el) => el === document.activeElement'))
                page.set_viewport_size({'width': 1366, 'height': 900})
                expect(overview.locator('.stat-row')).to_be_visible()
                check('Resize: desktop automatically restores the complete overview', overview.evaluate('(el) => el.open'))
                page.set_viewport_size({'width': 360, 'height': 800})
                expect(overview.locator('.stat-row')).not_to_be_visible()
                check('Resize: mobile overview returns to its compact state', not overview.evaluate('(el) => el.open'))

            attention = page.locator('[data-grade-filter="attention"]')
            attention.focus()
            page.keyboard.press('Enter')
            risk = sorted(course['id'] for course in data['current'] if course['status'] == 'risk')
            check(f'{width}: keyboard filter shows precisely the courses needing attention', bool(risk) and ids(page) == risk)
            card = page.locator('#grade-disciplines [data-disc]').first
            selected = next(course for course in data['current'] if course['id'] == int(card.get_attribute('data-disc')))
            card.focus()
            page.keyboard.press('Enter')
            dialog = page.locator('.modal-overlay:not(.closing) [role="dialog"]')
            expect(dialog).to_be_visible()
            expect(dialog).to_contain_text(selected['advice'])
            check(f'{width}: full course details retain every assessment', dialog.locator('.items-tbl tbody tr').count() == len(selected['items']))
            page.keyboard.press('Escape')
            expect(page.locator('.modal-overlay')).to_have_count(0)
            check(f'{width}: Escape restores focus and preserves the selected filter', card.evaluate('(el) => el === document.activeElement') and ids(page) == risk)

            if width == 360:
                summary.click()
                expect(overview.locator('.stat-row')).to_be_visible()
            page.locator('[data-me]').click()
            page.locator('.menu [data-out]').click()
            page.wait_for_url('**/#/login')
            login(page, 't.aliev')
            second = open_grades(page)
            second_ids = sorted(course['id'] for course in second['current'])
            check(f'{width}: same-tab account switch resets the filter and all course data',
                  expected != second_ids and ids(page) == second_ids
                  and page.locator('[data-grade-filter="all"]').get_attribute('aria-pressed') == 'true')
            check(f'{width}: new account receives the default overview state', overview.evaluate('(el) => el.open') == (width > 720))
            page.locator('a[href="#/grades/session"]').click()
            page.locator('.exam-row').first.wait_for()
            check(f'{width}: session remains one tab away', page.locator('.exam-row').count() > 0)
            page.locator('a[href="#/grades/history"]').click()
            expect(page.locator('#main')).to_contain_text('Зачётка пока пустая')
            check(f'{width}: first-year record book has its correct empty state', True)
            ctx.close()
        browser.close()
    check('Compact grades: no uncaught JavaScript errors', not errors)
finally:
    (OUT / 'browser-grades-compact.json').write_text(json.dumps({
        'base': BASE, 'checks': checks, 'browser_errors': errors, 'measurements': measurements,
        'scope': 'Demo login/logout and read-only academic data; no grades or requests modified.'
    }, ensure_ascii=False, indent=2), encoding='utf-8')

print(json.dumps({'checks': len(checks), 'failed': [item for item in checks if not item['passed']]}, ensure_ascii=False))
