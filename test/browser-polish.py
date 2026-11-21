"""Exercise the mobile disclosure and end-of-week navigation on an isolated server."""
from datetime import datetime, timedelta
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


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for width in [360, 1366]:
        ctx = browser.new_context(viewport={'width': width, 'height': 800 if width == 360 else 900}, reduced_motion='reduce')
        page = ctx.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(BASE)
        page.locator('[data-login="a.morozova"]').click()
        page.wait_for_url('**/#/home')
        page.locator('[data-sec="next"]').wait_for()
        page.wait_for_timeout(500)
        if page.locator('.modal-overlay [data-close]').count():
            page.locator('.modal-overlay [data-close]').first.click()
        play = page.locator('[data-home-more="play"]')
        initial_height = page.evaluate('document.documentElement.scrollHeight')
        if width == 360:
            check('360: secondary game content starts collapsed', not play.evaluate('(el) => el.open'))
            play.locator('summary').focus()
            # Событие toggle приходит асинхронно: ждём его, иначе смена ширины ниже опередит обработчик страницы
            page.evaluate('''() => { window.__playToggled = new Promise((r) => document.querySelector('[data-home-more="play"]').addEventListener('toggle', r, {once: true})); }''')
            page.keyboard.press('Enter')
            page.evaluate('() => window.__playToggled')
            expect(play.locator('[data-focus-start]')).to_be_visible()
            check('360: keyboard reveals the pet and study timer', play.evaluate('(el) => el.open'))
            expanded_height = page.evaluate('document.documentElement.scrollHeight')
            check('360: collapsed secondary content reduces scrolling', expanded_height > initial_height)
            page.set_viewport_size({'width': 1366, 'height': 900})
            expect(play.locator('[data-focus-start]')).to_be_visible()
            check('Resize: desktop retains access to all game content', play.evaluate('(el) => el.open'))
            page.set_viewport_size({'width': 360, 'height': 800})
            # Смена медиазапроса доходит до страницы в следующем кадре: ждём его до нажатия
            page.evaluate('() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))')
            play.locator('summary').click()
            expect(play.locator('[data-focus-start]')).not_to_be_visible()
            check('Resize: mobile disclosure remains operable', not play.evaluate('(el) => el.open'))
            more = page.locator('[data-home-more="deadlines"]')
            if more.count():
                more.locator('summary').focus()
                page.keyboard.press('Enter')
                check('360: keyboard reveals further deadlines', more.evaluate('(el) => el.open'))
            measurements.append({'viewport': width, 'home_collapsed_height': initial_height, 'home_expanded_height': expanded_height})
        else:
            check('1366: optional game content starts collapsed', not play.evaluate('(el) => el.open'))
            play.locator('summary').focus()
            page.keyboard.press('Enter')
            expect(play.locator('[data-focus-start]')).to_be_visible()
            check('1366: one keyboard action reaches the study timer', play.evaluate('(el) => el.open'))
            page.keyboard.press('Space')
            expect(play.locator('[data-focus-start]')).not_to_be_visible()
            check('1366: optional content can be collapsed again', not play.evaluate('(el) => el.open'))
            check('1366: every navigation label fits without clipping', page.locator('.header .nav').evaluate('(el) => el.scrollWidth <= el.clientWidth + 1'))
        check(f'{width}: home fits viewport', page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'))

        page.goto(BASE + '/#/requests/new/study')
        page.locator('[data-form]').wait_for()
        page.locator('.header [data-ask]').click()
        page.locator('.drawer input').wait_for()
        check(f'{width}: assistant opens from header on the request form', page.locator('.drawer input').is_visible())
        page.locator('.drawer [data-x]').click()
        expect(page.locator('[data-submit]')).to_be_enabled()
        page.locator('[data-submit]').scroll_into_view_if_needed()
        clear = page.locator('[data-submit]').evaluate('''el => {
          const r = el.getBoundingClientRect();
          const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return top === el || el.contains(top);
        }''')
        check(f'{width}: request submit is unobscured and usable', clear)

        # Freeze only the browser clock at the Sunday of the actual server week.
        # The API still returns real schedule data; explicit week links stay testable.
        current = page.evaluate('async () => (await fetch("/api/schedule")).json()')
        sunday = (datetime.fromisoformat(current['monday']) + timedelta(days=6)).date().isoformat()
        page.clock.set_fixed_time(sunday + 'T12:00:00+03:00')
        page.goto(BASE + '/#/schedule')
        page.locator('[data-day="' + current['next'] + '"]').wait_for()
        check(f'{width}: Sunday opens the next study week', page.locator('[data-day]').first.get_attribute('data-day') == current['next'])
        page.locator('a', has_text='К текущей неделе').click()
        page.locator('[data-day="' + current['monday'] + '"]').wait_for()
        check(f'{width}: explicit current-week link does not advance again', page.locator('[data-day]').first.get_attribute('data-day') == current['monday'])
        if width == 360:
            page.screenshot(path=str(OUT / '360-schedule-past.png'), full_page=True, animations='disabled')
        ctx.close()
    browser.close()

check('Polish scenarios: no uncaught JavaScript errors', not errors)
report = {'base': BASE, 'checks': checks, 'browser_errors': errors, 'measurements': measurements,
          'clock': 'Browser clock frozen to Sunday for the schedule regression only; API schedule is real.'}
(OUT / 'browser-polish.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'checks': len(checks), 'failed': [x for x in checks if not x['passed']]}, ensure_ascii=False))
