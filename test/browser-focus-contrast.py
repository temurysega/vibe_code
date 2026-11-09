"""Keyboard position during real view refreshes, and rendered text contrast.

Run against a disposable demo server: this suite marks demo notifications as read.
python test/browser-focus-contrast.py http://127.0.0.1:3100
QA_OUTPUT_DIR controls the report directory; otherwise reports go to TEMP.
"""
import json
import os
from pathlib import Path
import sys
import tempfile
import traceback

from playwright.sync_api import expect, sync_playwright

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:3100'
OUT = Path(os.environ.get('QA_OUTPUT_DIR') or tempfile.mkdtemp(prefix='mgimo-focus-contrast-'))
OUT.mkdir(parents=True, exist_ok=True)
checks, errors, contrast, focus = [], [], [], []


def check(name, condition):
    checks.append({'check': name, 'passed': bool(condition)})
    print(('PASS ' if condition else 'FAIL ') + name, flush=True)


# Keep real intervals, and allow an individual refresh to run without waiting a minute.
# This invokes the application's registered callback and performs its normal API calls.
TIMERS = """() => {
    const timers = new Map();
    const start = window.setInterval.bind(window), stop = window.clearInterval.bind(window);
    window.setInterval = (fn, ms, ...args) => {
      const id = start(fn, ms, ...args); timers.set(id, {fn, ms, args}); return id;
    };
    window.clearInterval = id => { timers.delete(id); stop(id); };
    window.__qaTick = async ms => {
      const entries = [...timers.values()].filter(t => t.ms === ms && typeof t.fn === 'function');
      await Promise.all(entries.map(t => t.fn(...t.args))); return entries.length;
    };
}"""

# Composite real computed colors through transparent ancestors. Only visible text
# nodes are measured; decorative SVGs, hidden content and gradient artwork are excluded.
CONTRAST = """() => {
    const rgba = s => (s.match(/[\\d.]+/g) || []).map(Number);
    const over = (fg, bg) => {
      const a = fg[3] ?? 1;
      return fg.slice(0, 3).map((v, i) => a * v + (1 - a) * bg[i]);
    };
    const luminance = c => c.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
      .reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    const selectors = '.muted, .card-sub, .field-label, .field-hint, .badge, .st, .lesson-tag, .lesson-teacher, .lesson-sub, .n-meta, .n-day, .disc-points small, .letter, .tabbar a';
    return [...document.querySelectorAll(selectors)].filter(el => el.getClientRects().length &&
      getComputedStyle(el).visibility === 'visible' && [...el.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim()))
      .flatMap(el => {
        let bg = [255, 255, 255], opacity = 1;
        const chain = []; for (let node = el; node; node = node.parentElement) chain.unshift(node);
        for (const node of chain) {
          const style = getComputedStyle(node);
          if (style.backgroundImage !== 'none') return [];
          bg = over(rgba(style.backgroundColor), bg); opacity *= Number(style.opacity);
        }
        if (opacity < .99) return [];
        const color = getComputedStyle(el).color, fg = over(rgba(color), bg);
        const light = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
        return [{text: el.textContent.trim().slice(0, 100), classes: el.className,
          foreground: color, background: bg.map(v => Math.round(v)), ratio: (light[0] + .05) / (light[1] + .05)}];
      });
}"""


def measure(page, width, route):
    rows = page.evaluate(CONTRAST)
    contrast.append({'width': width, 'route': route, 'measurements': rows})
    check(f'{width}px {route}: text colors were measured on rendered backgrounds', len(rows) >= 3)
    bad = [r for r in rows if r['ratio'] < 4.5]
    check(f'{width}px {route}: muted text and status labels have contrast at least 4.5:1', not bad)
    for row in bad:
        print('  Low contrast: ' + json.dumps(row, ensure_ascii=False), flush=True)


def remember(page, selector):
    page.locator(selector).first.focus()
    page.evaluate('window.__qaFocused = document.activeElement')


def kept(page, selector, width, scenario):
    state = page.evaluate('''selector => ({
      activeTag: document.activeElement.tagName,
      activeKey: document.activeElement.getAttribute('data-focus-key'),
      activeHref: document.activeElement.getAttribute('href'),
      oldNodeRemoved: !window.__qaFocused.isConnected,
      expectedFocused: document.activeElement === document.querySelector(selector)
    })''', selector)
    focus.append({'width': width, 'scenario': scenario, **state})
    check(f'{width}px {scenario}: refreshed content keeps the same keyboard action', state['oldNodeRemoved'] and state['expectedFocused'])


try:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        for width in [360, 1366]:
            ctx = browser.new_context(viewport={'width': width, 'height': 800}, reduced_motion='reduce')
            ctx.add_init_script('(' + TIMERS + ')()')
            page = ctx.new_page()
            page.on('pageerror', lambda e, w=width: errors.append(f'{w}px: {e}'))
            page.goto(BASE + '/#/login')
            page.locator('[data-login="a.morozova"]').click()
            page.wait_for_url('**/#/home')
            page.locator('[data-sec="day"]').wait_for()
            page.wait_for_timeout(300)
            if page.locator('.modal-overlay').count():
                page.locator('.modal-overlay').last.locator('[data-close]').first.click()
                expect(page.locator('.modal-overlay')).to_have_count(0)


            home_action = '.next-card .btn-light' if width == 1366 else '.quick a[href="#/schedule"]'
            remember(page, home_action)
            check(f'{width}px home: 30-second refresh callback ran', page.evaluate('window.__qaTick(30000)') > 0)
            home_state = page.evaluate('''selector => ({
              activeTag: document.activeElement.tagName,
              activeHref: document.activeElement.getAttribute('href'),
              oldNodeRemoved: !window.__qaFocused.isConnected,
              expectedFocused: document.activeElement === document.querySelector(selector)
            })''', home_action)
            focus.append({'width': width, 'scenario': 'home timed refresh', **home_state})
            check(f'{width}px home: scheduled refresh keeps the current study action focused', not home_state['oldNodeRemoved'] and home_state['expectedFocused'])
            page.keyboard.press('Enter')
            page.wait_for_url('**/#/schedule')
            page.locator('.week').wait_for()
            check(f'{width}px home: Enter still opens the weekly schedule after refresh', page.locator('.week').is_visible())
            page.goto(BASE + '/#/home')
            page.locator('[data-sec="next"]').wait_for()
            page.evaluate('''window.__qaHomeNext = document.querySelector('[data-sec="next"]')''')
            page.locator('[data-start-guide]').focus()
            page.evaluate('window.__qaTick(30000)')
            check(f'{width}px home: next lesson refresh resumes when focus is outside the card', page.evaluate('!window.__qaHomeNext.isConnected'))
            page.keyboard.press('Enter')
            page.locator('.modal-overlay [role="dialog"]').wait_for()
            expect(page.locator('#main')).to_have_attribute('inert', '')
            page.evaluate('''window.__qaHomeNext = document.querySelector('[data-sec="next"]'); window.__qaHomeDay = document.querySelector('[data-sec="day"]')''')
            page.evaluate('window.__qaTick(30000)')
            check(f'{width}px home: modal background cards wait until the dialog is closed', page.evaluate('window.__qaHomeNext.isConnected && window.__qaHomeDay.isConnected'))
            page.keyboard.press('Escape')
            expect(page.locator('.modal-overlay')).to_have_count(0)

            page.goto(BASE + '/#/notifications')
            page.locator('[data-f="deadline"]').wait_for()
            remember(page, '[data-f="deadline"]')
            page.keyboard.press('Enter')
            expect(page.locator('[data-f="deadline"]')).to_have_attribute('aria-pressed', 'true')
            kept(page, '[data-f="deadline"]', width, 'notification filter')
            check(f'{width}px notifications: exactly one filter is announced as selected', page.locator('[data-f][aria-pressed="true"]').count() == 1)
            page.keyboard.press('Tab')
            check(f'{width}px notifications: Tab continues to the following filter', page.locator('[data-f="request"]').evaluate('(el) => el === document.activeElement'))
            page.locator('[data-f="all"]').click()
            measure(page, width, 'notifications')
            if page.locator('[data-readall]').count():
                page.locator('[data-f="unread"]').click()
                page.locator('[data-readall]').focus()
                page.keyboard.press('Enter')
                expect(page.locator('[data-readall]')).to_have_count(0)
                check(f'{width}px notifications: removed read-all action returns focus to selected filter', page.locator('[data-f="unread"]').evaluate('(el) => el === document.activeElement'))

            page.goto(BASE + '/#/requests')
            card = page.locator('.req-card').first
            card.wait_for()
            href = card.get_attribute('href')
            card_selector = '.req-card[href="' + href + '"]'
            remember(page, card_selector)
            check(f'{width}px requests: automatic refresh callback ran', page.evaluate('window.__qaTick(15000)') > 0)
            kept(page, card_selector, width, 'request list refresh')
            measure(page, width, 'requests')
            page.keyboard.press('Enter')
            page.wait_for_url('**/' + href)
            page.locator('.req-detail').wait_for()
            back = '[data-focus-key="request-back"]'
            remember(page, back)
            check(f'{width}px request detail: automatic refresh callback ran', page.evaluate('window.__qaTick(8000)') > 0)
            kept(page, back, width, 'request detail refresh')
            page.keyboard.press('Enter')
            page.wait_for_url('**/#/requests')
            page.locator('.req-list').wait_for()
            check(f'{width}px requests: preserved action remains operable with Enter', page.locator('.req-list').is_visible())

            page.goto(BASE + '/#/schedule')
            page.locator('.week').wait_for()
            lesson = page.locator('.lesson:visible').first
            key = lesson.get_attribute('data-focus-key')
            lesson_selector = '[data-focus-key="' + key + '"]'
            remember(page, lesson_selector)
            scroll_before = page.evaluate('scrollY')
            check(f'{width}px schedule: minute refresh callback ran', page.evaluate('window.__qaTick(60000)') > 0)
            kept(page, lesson_selector, width, 'schedule minute refresh')
            check(f'{width}px schedule: refresh does not jump the reading position', abs(page.evaluate('scrollY') - scroll_before) <= 1)
            page.keyboard.press('Enter')
            page.locator('.modal-overlay [role="dialog"]').wait_for()
            page.keyboard.press('Escape')
            expect(page.locator('.modal-overlay')).to_have_count(0)
            check(f'{width}px schedule: lesson details return focus to refreshed lesson', page.locator(lesson_selector).evaluate('(el) => el === document.activeElement'))
            page.locator('[data-bell]').focus()
            page.evaluate('window.__qaTick(60000)')
            check(f'{width}px schedule: background refresh does not steal header focus', page.locator('[data-bell]').evaluate('(el) => el === document.activeElement'))
            page.evaluate('window.__qaFocused = document.activeElement')
            page.evaluate("async () => (await import('/js/lib/bus.js')).setUnread(5)")
            check(f'{width}px header: unread update keeps the focused bell DOM node', page.locator('[data-bell]').evaluate('(el) => el === document.activeElement && el === window.__qaFocused && el.isConnected'))
            expect(page.locator('[data-bell]')).to_have_attribute('aria-label', 'Уведомления: 5 новых')
            page.keyboard.press('Enter')
            page.locator('.menu').wait_for()
            page.locator('.menu [data-go]').first.wait_for()
            page.locator('.menu [data-go]').first.focus()
            page.evaluate("async () => (await import('/js/lib/bus.js')).setUnread(0)")
            check(f'{width}px header: cleared unread count removes badge without replacing opener', page.locator('[data-bell] .badge-dot').count() == 0 and page.locator('[data-bell]').evaluate('(el) => el === window.__qaFocused && el.isConnected'))
            page.keyboard.press('Escape')
            expect(page.locator('.menu')).to_have_count(0)
            check(f'{width}px header: Escape restores menu opener after unread update', page.locator('[data-bell]').evaluate('(el) => el === document.activeElement'))
            measure(page, width, 'schedule')

            page.goto(BASE + '/#/grades')
            page.locator('.disc').first.wait_for()
            measure(page, width, 'grades')
            page.goto(BASE + '/#/profile')
            page.locator('[data-pw]').wait_for()
            measure(page, width, 'profile')
            check(f'{width}px: affected views produce no horizontal page overflow', page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'))
            ctx.close()
        browser.close()
except Exception:
    errors.append(traceback.format_exc())

result = {'base': BASE, 'checks': checks, 'browser_errors': errors, 'focus': focus, 'contrast': contrast}
(OUT / 'browser-focus-contrast.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8', newline='\n')
print(json.dumps({'checks': len(checks), 'failed': [c for c in checks if not c['passed']], 'browser_errors': errors, 'output': str(OUT)}, ensure_ascii=False))
sys.exit(1 if errors or any(not c['passed'] for c in checks) else 0)
