"""Regression scenarios for the fixes after the 9 November audit, on an isolated server.

Covers: login hero chips vs. lead text, tap areas of small links, paged notifications,
and the explicit "Заявка не найдена" state for another student's request link.
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


def login(page, account):
    page.goto(BASE + '/#/login')
    page.locator(f'[data-login="{account}"]').click()
    page.wait_for_url('**/#/home')
    page.wait_for_timeout(500)
    if page.locator('.modal-overlay [data-close]').count():
        page.locator('.modal-overlay [data-close]').first.click()


def logout(page):
    page.evaluate('''async () => {
      const s = await (await fetch('/api/auth/session')).json();
      await fetch('/api/auth/logout', {method: 'POST', headers: {'X-CSRF-Token': s.csrf, 'Content-Type': 'application/json'}, body: '{}'});
    }''')
    page.goto(BASE + '/#/login')
    page.reload()


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    # 1. Плашки на обложке входа не наезжают на подзаголовок во всех фазах анимации «парения»
    for width in [320, 360, 414, 768]:
        ctx = browser.new_context(viewport={'width': width, 'height': 800}, is_mobile=width < 768, has_touch=width < 768)
        page = ctx.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(BASE + '/#/login')
        page.locator('[data-login]').first.wait_for()
        gap = page.evaluate('''async () => {
          await document.fonts.ready;  // мерим с фирменным шрифтом, а не с запасным до его загрузки
          let worst = Infinity;
          for (let i = 0; i < 36; i++) {
            // Подзаголовок и плашки сравниваются в одном кадре: у экрана есть анимация появления
            const lead = document.querySelector('.auth-lead').getBoundingClientRect();
            document.querySelectorAll('.auth-float').forEach((chip) => {
              const r = chip.getBoundingClientRect();
              if (!r.width || getComputedStyle(chip).display === 'none') return;
              if (r.right > lead.left && r.left < lead.right) worst = Math.min(worst, r.top - lead.bottom);
            });
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          return worst;
        }''')
        measurements.append({'viewport': width, 'min_gap_chip_to_lead_px': gap})
        check(f'{width}: login chips stay below the lead text (min gap {gap:.0f} px)', gap >= 0)
        if width == 360:
            page.screenshot(path=str(OUT / '360-login-hero.png'), animations='disabled')
        ctx.close()

    ctx = browser.new_context(viewport={'width': 360, 'height': 800}, is_mobile=True, has_touch=True, reduced_motion='reduce')
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    login(page, 'a.morozova')

    # 2. Маленькие ссылки получают область нажатия без сдвига вёрстки
    areas = page.evaluate('''() => [...document.querySelectorAll('.link-arrow, .concept-links button')]
      .filter((el) => el.getBoundingClientRect().width)
      .map((el) => {
        const r = el.getBoundingClientRect();
        const after = getComputedStyle(el, '::after');
        return {text: el.textContent.trim().slice(0, 24), visible: Math.round(r.height),
                hit: Math.round(r.height - parseFloat(after.top) - parseFloat(after.bottom))};
      })''')
    measurements.append({'viewport': 360, 'tap_areas': areas})
    check('360: card links and concept bar have tap areas of at least 32 px', areas and all(a['hit'] >= 32 for a in areas))
    link = page.locator('.card[data-sec="requests"] .link-arrow')
    link.scroll_into_view_if_needed()
    page.evaluate('window.scrollBy(0, -160)')
    box = link.bounding_box()
    page.mouse.click(box['x'] + box['width'] / 2, box['y'] - 8)
    page.wait_for_url('**/#/requests')
    check('360: a tap 8 px above the "Все" link still opens requests', True)

    # 3. Лента уведомлений приходит порциями и не теряет фокус
    page.goto(BASE + '/#/notifications')
    page.locator('.n-item').first.wait_for()
    first = page.locator('.n-item').count()
    total = page.evaluate("async () => (await (await fetch('/api/notifications')).json()).list.length")
    more = page.locator('[data-more-n]')
    check('360: notifications open with at most 12 cards', first == min(12, total))
    check('360: "Показать ещё" appears only when more notifications exist', (more.count() == 1) == (total > 12))
    if more.count():
        more.click()
        expect(page.locator('.n-item')).to_have_count(min(24, total))
        check('360: "Показать ещё" adds the next cards and focuses the first new one',
              page.evaluate("document.activeElement.classList.contains('n-item')"))
    page.locator('[data-f="schedule"]').click()
    check('360: changing the filter starts the list from the first page', page.locator('.n-item').count() <= 12)
    page.locator('[data-f="all"]').click()
    page.screenshot(path=str(OUT / '360-notifications-paged.png'), full_page=True, animations='disabled')
    measurements.append({'viewport': 360, 'notifications_total': total, 'notifications_first_page': first,
                         'notifications_page_height_px': page.evaluate('document.documentElement.scrollHeight')})

    # 4. Ссылка на чужую заявку называет, что именно недоступно, и не раскрывает данные
    created = page.evaluate('''async () => {
      const s = await (await fetch('/api/auth/session')).json();
      const r = await fetch('/api/requests', {method: 'POST', headers: {'X-CSRF-Token': s.csrf, 'Content-Type': 'application/json'},
        body: JSON.stringify({type: 'study', delivery: 'electronic', lang: 'ru', fields: {place: 'Проверка чужой ссылки', copies: 1}})});
      return {status: r.status, id: (await r.json()).request.id};
    }''')
    check('360: Alina creates a request for the isolation check', created['status'] == 201)
    logout(page)
    login(page, 't.aliev')
    page.goto(BASE + f"/#/requests/{created['id']}")
    box = page.locator('.error-box')
    box.wait_for()
    text = box.inner_text()
    check('360: another student sees "Заявка не найдена"', 'Заявка не найдена' in text)
    check('360: the unavailable state reveals nothing about the owner or the request', 'Морозова' not in text and 'Проверка чужой ссылки' not in text)
    page.screenshot(path=str(OUT / '360-foreign-request.png'), animations='disabled')
    ctx.close()
    browser.close()

check('Audit fixes: no uncaught JavaScript errors', not errors)
report = {'base': BASE, 'checks': checks, 'browser_errors': errors, 'measurements': measurements}
(OUT / 'browser-audit-fixes.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'checks': len(checks), 'failed': [x for x in checks if not x['passed']]}, ensure_ascii=False))
