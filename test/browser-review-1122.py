"""Правки по рецензии 22 ноября — на изолированном сервере с демо-кабинетами, как на стенде.

Сборщик scripts/collect-evidence.py запускает сервер с DEMO_SANDBOXES=1 и передаёт набору папку кабинетов
(QA_SANDBOX_DIR): набор сам удаляет игровой профиль и оценки в базе своего демо-кабинета.
Проверяет: кабинет появляется только после верного пароля, три одновременных входа из одного браузера дают
один кабинет, сброс — только из сеанса (п. 2); ссылка и код проверки справки не открывают кабинет (п. 1);
заявка сохраняется и показывает номер и статус при сбое игрового слоя, повтор после сетевой ошибки
не создаёт копию, маршрут жюри до отказа второму студенту (п. 3, 6); карточка главной открывает конкретную
пару, «Сегодня пар нет» и «Сегодня занятия закончились» различаются при подменённых часах браузера,
«Сессия» без оценок — «Недостаточно данных для прогноза» (п. 4); версия выпуска на входе, в подвале
и в /api/health совпадает с package.json (п. 8).
"""
from datetime import datetime, timedelta
import json
import os
from pathlib import Path
import re
import sqlite3
import sys
from urllib.parse import urlparse
from zoneinfo import ZoneInfo
from playwright.sync_api import sync_playwright, expect
from pypdf import PdfReader

if len(sys.argv) != 2 or urlparse(sys.argv[1]).hostname not in ('127.0.0.1', 'localhost', '::1'):
    raise SystemExit('Pass the URL of an isolated local QA server started with DEMO_SANDBOXES=1.')
if not os.environ.get('QA_SANDBOX_DIR'):
    raise SystemExit('Set QA_SANDBOX_DIR to the SANDBOX_DIR of that server; scripts/collect-evidence.py does it.')
BASE = sys.argv[1].rstrip('/')
ROOT = Path(__file__).resolve().parents[1]
BOXES = Path(os.environ['QA_SANDBOX_DIR'])
OUT = Path(os.environ.get('QA_OUTPUT_DIR') or ROOT / 'docs/evidence/review-1122')
OUT.mkdir(parents=True, exist_ok=True)
VERSION = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
MSK = ZoneInfo('Europe/Moscow')
PHONE = {'viewport': {'width': 360, 'height': 800}, 'is_mobile': True, 'has_touch': True, 'reduced_motion': 'reduce'}
DESKTOP = {'viewport': {'width': 1366, 'height': 900}, 'reduced_motion': 'reduce'}
SHOT = {'animations': 'disabled', 'style': '#toast-root {visibility:hidden}'}
checks, errors, measurements = [], [], []


def check(name, condition):
    checks.append({'check': name, 'passed': bool(condition)})
    print(('PASS ' if condition else 'FAIL ') + name, flush=True)
    assert condition, name


def watch(page):
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.set_default_timeout(15000)
    return page


def login(page, account):
    page.goto(BASE + '/#/login')
    page.locator(f'[data-login="{account}"]').click()
    page.wait_for_url(re.compile(r'.*#/(home|dean)$'))
    page.wait_for_timeout(400)
    if page.locator('.modal-overlay [data-close]').count():
        page.locator('.modal-overlay [data-close]').first.click()
        expect(page.locator('.modal-overlay')).to_have_count(0)


def api(page, path, method='GET', body=None):
    return page.evaluate('''async ([path, method, body]) => {
      const s = await (await fetch('/api/auth/session')).json();
      const r = await fetch(path, {method, headers: {'X-CSRF-Token': s.csrf || '', 'Content-Type': 'application/json'},
        body: body ? JSON.stringify(body) : undefined});
      let data = null;
      try { data = await r.json(); } catch (e) { data = null; }
      return {status: r.status, data};
    }''', [path, method, body])


def cabinet_of(context):
    return next((c['value'] for c in context.cookies() if c['name'].endswith('mm_demo')), None)


def cabinets():
    return {path.name[:-3] for path in BOXES.glob('*.db')}


def sql(cabinet, statement, *params):
    con = sqlite3.connect(BOXES / f'{cabinet}.db', timeout=10)
    try:
        rows = con.execute(statement, params).fetchall()
        con.commit()
        return rows
    finally:
        con.close()


def study_form(page, place):
    page.goto(BASE + '/#/requests/new/study')
    page.locator('[data-form]').wait_for()
    page.locator('input[name="delivery"][value="electronic"]').check()
    page.locator('[name="place"]').fill(place)


def count_requests(page):
    return len(api(page, '/api/requests')['data']['requests'])


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    # 1. Кабинет создаётся только после верного пароля; одновременные входы из одного браузера (п. 2)
    alina_ctx = browser.new_context(**PHONE)
    alina = watch(alina_ctx.new_page())
    alina.goto(BASE + '/#/login')
    alina.locator('[data-login="a.morozova"]').wait_for()
    reserved = cabinet_of(alina_ctx) or ''
    check('login page: the browser holds a reserved cabinet code, the cabinet itself does not exist yet',
          re.fullmatch(r'[a-z2-7]{16}', reserved) is not None and reserved not in cabinets()
          and api(alina, '/api/demo')['data'] == {'sandboxes': True, 'id': None})
    check(f'login page names release {VERSION}', f'Версия {VERSION}' in alina.locator('[data-release]').inner_text())
    before = cabinets()
    alina.locator('[name="login"]').fill('a.morozova')
    alina.locator('[name="password"]').fill('not-the-password')
    alina.locator('[data-submit]').click()
    expect(alina.locator('.auth-error')).to_be_visible()
    check('wrong password: an error and no new cabinet database', cabinets() == before and api(alina, '/api/demo')['data']['id'] is None)
    statuses = alina.evaluate('''async () => {
      const once = () => fetch('/api/auth/login', {method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({login: 'a.morozova', password: 'mgimo2026'})}).then((r) => r.status);
      return Promise.all([once(), once(), once()]);
    }''')
    created = cabinets() - before
    measurements.append({'simultaneous_sign_ins': statuses, 'cabinets_created': len(created)})
    check('three simultaneous sign-ins from one browser: all succeed and create exactly one cabinet with the reserved code',
          statuses == [200, 200, 200] and created == {reserved} and cabinet_of(alina_ctx) == reserved)
    alina.goto(BASE + '/#/home')
    alina.reload()
    alina.locator('[data-sec="next"]').wait_for()
    if alina.locator('.modal-overlay [data-close]').count():
        alina.locator('.modal-overlay [data-close]').first.click()
    check('after the simultaneous sign-ins the cabinet opens normally', api(alina, '/api/demo')['data']['id'] == reserved)

    # 2. «Начать с чистого кабинета» — только из открытого сеанса (п. 2)
    guest_ctx = browser.new_context(**DESKTOP)
    guest_ctx.add_cookies([{'name': 'mm_demo', 'value': reserved, 'url': BASE}])
    guest = watch(guest_ctx.new_page())
    guest.goto(BASE + '/#/login')
    guest.locator('[data-login="a.morozova"]').wait_for()
    reset_status = guest.evaluate("fetch('/api/demo/new', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'}).then((r) => r.status)")
    guest.locator('#concept [data-sandbox]').click()
    guest.locator('[data-sandbox-link]').wait_for()
    check('without a session the cabinet cannot be reset: the API answers 401, the dialog has no reset button',
          reset_status == 401 and guest.locator('[data-sandbox-new]').count() == 0 and cabinet_of(guest_ctx) == reserved)
    guest_ctx.close()

    # 3. Игровой профиль недоступен при отправке: номер и статус заявки всё равно на экране (п. 3)
    student = sql(reserved, "SELECT student_id FROM users WHERE login = 'a.morozova'")[0][0]
    saved_play = sql(reserved, 'SELECT student_id, state, updated_at FROM play_state WHERE student_id = ?', student)[0]
    sql(reserved, 'DELETE FROM play_state WHERE student_id = ?', student)
    total = count_requests(alina)
    study_form(alina, 'Для проверки жюри — без игрового слоя')
    alina.locator('[data-submit]').click()
    alina.wait_for_url(re.compile(r'.*#/requests/\d+$'))
    rid = int(alina.url.rsplit('/', 1)[1])
    req = api(alina, f'/api/requests/{rid}')['data']['request']
    expect(alina.locator('main', has_text=req['number'])).to_be_visible()
    check('game profile missing: the request is saved once, its page shows the number and the status «Подана»',
          req['status'] == 'submitted' and 'Подана' in alina.locator('main').inner_text() and count_requests(alina) == total + 1)
    alina.screenshot(path=str(OUT / '360-request-saved-without-game.png'), **SHOT)
    sql(reserved, 'INSERT INTO play_state (student_id, state, updated_at) VALUES (?, ?, ?)', *saved_play)

    # 4. Повтор отправки после сетевой ошибки не создаёт копию (п. 6 — то, что проверяется без телефона)
    total = count_requests(alina)
    study_form(alina, 'Повтор после сбоя сети')
    alina_ctx.set_offline(True)
    alina.locator('[data-submit]').click()
    expect(alina.locator('[data-form-error]', has_text='Нет связи с сервером')).to_be_visible()
    kept = alina.locator('[name="place"]').input_value() == 'Повтор после сбоя сети'
    alina.screenshot(path=str(OUT / '360-request-offline-error.png'), **SHOT)
    alina_ctx.set_offline(False)
    alina.locator('[data-submit]').click()
    alina.wait_for_url(re.compile(r'.*#/requests/\d+$'))
    check('offline: a clear error, the form keeps the text; the retry sends exactly one request', kept and count_requests(alina) == total + 1)

    total = count_requests(alina)
    study_form(alina, 'Ответ потерялся в сети')

    def lose_answer(route):
        if route.request.method == 'POST':
            route.fetch()   # сервер принял и сохранил заявку,
            route.abort()   # а телефон ответа не получил
        else:
            route.continue_()
    alina.route('**/api/requests', lose_answer)
    alina.locator('[data-submit]').click()
    expect(alina.locator('[data-form-error]', has_text='Нет связи с сервером')).to_be_visible()
    alina.unroute('**/api/requests', lose_answer)
    alina.locator('[data-submit]').click()
    expect(alina.locator('#toast-root .toast', has_text='открываем её')).to_be_visible()
    alina.wait_for_url(re.compile(r'.*#/requests/\d+$'))
    check('the answer was lost after the server saved the request: the retry opens that request, no copy', count_requests(alina) == total + 1)

    # 5. Маршрут жюри: решение деканата → PDF → проверка в чистом браузере → отказ второму студенту (п. 1, 3)
    dean_ctx = browser.new_context(**DESKTOP)
    dean = watch(dean_ctx.new_page())
    dean.goto(f'{BASE}/?demo={reserved}')
    login(dean, 'dekanat.mo')
    item = dean.locator(f'[data-req="{rid}"]')
    item.wait_for()
    if item.locator('[data-act="in_work"]').count():
        item.locator('[data-act="in_work"]').click()
    item.locator('[data-act="ready"]').wait_for()
    dean.locator(f'#c-{rid}').fill('Справка готова')
    item.locator('[data-act="ready"]').click()
    expect(dean.locator(f'[data-req="{rid}"]')).to_have_count(0)
    check("the dean opens the cabinet by its link, finds the request and issues the certificate", True)
    dean_ctx.close()

    alina.goto(f'{BASE}/#/requests/{rid}/doc')
    alina.locator('article.doc').wait_for()
    page_link = alina.locator('.doc-qr a').get_attribute('href') or ''
    code = alina.locator('.doc-qr b').inner_text().strip()
    check('certificate page: the verification link has no demo cabinet code',
          page_link == f'{BASE}/#/verify/{code}' and 'demo=' not in page_link)
    alina.screenshot(path=str(OUT / '360-certificate-verify-link.png'), **SHOT)
    with alina.expect_download() as info:
        alina.locator('[data-pdf]').click()
    pdf_path = OUT / 'certificate-1122.pdf'
    info.value.save_as(str(pdf_path))
    reader = PdfReader(str(pdf_path))
    uris = [str(a.get_object()['/A']['/URI']) for page_ in reader.pages for a in page_.get('/Annots', [])]
    text = '\n'.join(page_.extract_text() for page_ in reader.pages)
    check('PDF: the same link and code, no demo cabinet code anywhere in the file',
          page_link in uris and code in text and 'demo=' not in pdf_path.read_bytes().decode('latin1'))

    clean_ctx = browser.new_context(**PHONE)
    clean = watch(clean_ctx.new_page())
    clean.goto(page_link)
    expect(clean.locator('text=Справка действительна')).to_be_visible()
    check('a clean browser confirms the certificate by the link and is not attached to any cabinet',
          cabinet_of(clean_ctx) is None and api(clean, '/api/demo')['data']['id'] is None)
    clean.screenshot(path=str(OUT / '360-verify-clean-browser.png'), **SHOT)
    clean.goto(BASE + '/#/verify')
    clean.reload()
    clean.locator('[name="code"]').fill(code)
    clean.locator('[data-form] button[type="submit"]').click()
    expect(clean.locator('text=Справка действительна')).to_be_visible()
    check('the code typed by hand confirms the certificate too, still without a cabinet', cabinet_of(clean_ctx) is None)
    login(clean, 'a.morozova')
    own = cabinet_of(clean_ctx)
    check("signing in on that browser afterwards opens a new cabinet, not the certificate owner's",
          own is not None and own != reserved and api(clean, f'/api/requests/{rid}')['status'] == 404)
    clean_ctx.close()

    timur_ctx = browser.new_context(**PHONE)
    timur = watch(timur_ctx.new_page())
    timur.goto(f'{BASE}/?demo={reserved}')
    login(timur, 't.aliev')
    timur.goto(f'{BASE}/#/requests/{rid}')
    expect(timur.locator('main', has_text='Заявка не найдена')).to_be_visible()
    timur.goto(f'{BASE}/#/requests/{rid}/doc')
    expect(timur.locator('main', has_text='Заявка не найдена')).to_be_visible()
    pdf_status = timur.evaluate(f"fetch('/api/requests/{rid}/document.pdf').then((r) => r.status)")
    check("second student in the same cabinet: «Заявка не найдена» for the request and the certificate, the PDF answers 404",
          api(timur, f'/api/requests/{rid}/document')['status'] == 404 and pdf_status == 404)
    timur.screenshot(path=str(OUT / '360-second-student-refused.png'), **SHOT)

    # 6. «Сессия» без единой оценки — «Недостаточно данных для прогноза» (п. 4)
    sql(reserved, "UPDATE assessments SET points = NULL, graded_at = NULL WHERE student_id = (SELECT student_id FROM users WHERE login = 't.aliev')")
    timur.goto(BASE + '/#/grades/session')
    card = timur.locator('[data-admission]')
    card.wait_for()
    card_text = card.inner_text()
    check('session tab without grades: «Недостаточно данных для прогноза» instead of «идёт по плану»',
          card.get_attribute('data-admission') == 'nodata' and 'Недостаточно данных для прогноза' in card_text and 'идёт по плану' not in card_text)
    card.scroll_into_view_if_needed()
    timur.screenshot(path=str(OUT / '360-session-no-grades.png'), **SHOT)
    timur.goto(BASE + '/#/grades')
    timur.locator('.disc-forecast').first.wait_for()
    forecasts = timur.locator('.disc-forecast').all_inner_texts()
    check('current semester without grades: every discipline says «Пока нет данных для прогноза»',
          forecasts and all('Пока нет данных для прогноза' in f for f in forecasts))
    timur_ctx.close()
    alina.goto(BASE + '/#/grades/session')
    alina.locator('[data-admission]').wait_for()
    check('with a discipline at risk the session forecast stays «под вопросом»', alina.locator('[data-admission]').get_attribute('data-admission') == 'risk')

    # 7. Главная: изменение расписания открывает конкретную пару (п. 4)
    alina.goto(BASE + '/#/home')
    changes = alina.locator('[data-sec="changes"] a.chg')
    changes.first.wait_for()
    hrefs = changes.evaluate_all('(els) => els.map((el) => el.getAttribute("href"))')
    check('home: every schedule change links to its date and pair', hrefs and all(re.fullmatch(r'#/schedule/\d{4}-\d{2}-\d{2}/\d', h) for h in hrefs))
    target = hrefs[0]
    changes.first.click()
    alina.wait_for_url(re.compile(re.escape(target) + '$'))
    expect(alina.locator('.modal-overlay .modal')).to_be_visible()
    check('one tap on the home card opens that lesson with its change', alina.locator('.lesson.target').count() >= 1)
    alina.screenshot(path=str(OUT / '360-home-change-opens-pair.png'), **SHOT)
    alina.keyboard.press('Escape')
    expect(alina.locator('.modal-overlay')).to_have_count(0)
    alina.goto(BASE + '/#/home')
    alina.locator('[data-sec="next"]').wait_for()
    lessons = alina.locator('[data-sec="day"] a.day-item').evaluate_all('(els) => els.map((el) => el.getAttribute("href"))')
    check('home: lessons of the day link to their pair, not to the whole week', all(re.fullmatch(r'#/schedule/\d{4}-\d{2}-\d{2}/\d', h) for h in lessons))

    # 8. «Сегодня пар нет» и «Сегодня занятия закончились» — разные ответы; часы браузера подменены (п. 4)
    week = api(alina, '/api/schedule')['data']
    held = lambda d: [it for it in d['items'] if it['status'] not in ('cancelled', 'moved')]
    study_days = [d for d in week['days'] if not d['holiday'] and held(d)]
    last = study_days[-1]
    end = max(it['end'] for it in held(last))

    def schedule_at(moment):
        page = watch(alina_ctx.new_page())
        page.clock.set_fixed_time(moment)
        page.goto(BASE + '/#/schedule')
        page.locator('.day-col').first.wait_for()
        return page

    at = lambda date, hhmm: datetime.fromisoformat(f'{date}T{hhmm}:00').replace(tzinfo=MSK)
    page = schedule_at(at(last['date'], '23:30'))
    note = page.locator('.today-note')
    expect(note).to_be_visible()
    check(f'evening after the last lesson of the week ({last["date"]}, till {end}): «Сегодня занятия закончились в {end}», not «пар нет»',
          note.inner_text().startswith(f'Сегодня занятия закончились в {end}'))
    check('the schedule moved to the next week by itself and says so', page.locator('.schedule-context').is_visible())
    page.screenshot(path=str(OUT / '360-schedule-day-ended.png'), **SHOT)
    page.close()
    sunday = (datetime.fromisoformat(week['monday']) + timedelta(days=6)).date().isoformat()
    page = schedule_at(at(sunday, '12:00'))
    note = page.locator('.today-note')
    expect(note).to_be_visible()
    check('on Sunday: «Сегодня пар нет» and the nearest lesson', note.inner_text().startswith('Сегодня пар нет') and 'Ближайшее занятие' in note.inner_text())
    page.screenshot(path=str(OUT / '360-schedule-no-lessons.png'), **SHOT)
    page.close()
    page = schedule_at(at(study_days[0]['date'], '07:00'))
    check('before the first lesson of a study day there is no «Сегодня» note', page.locator('.today-note').count() == 0)
    page.close()
    measurements.append({'week': week['week'], 'last_study_day': last['date'], 'last_lesson_end': end, 'sunday': sunday})

    # 9. Одна версия выпуска: подвал кабинета и /api/health совпадают с package.json (п. 8)
    desk_ctx = browser.new_context(**DESKTOP)
    desk = watch(desk_ctx.new_page())
    login(desk, 'a.morozova')
    foot = desk.locator('#foot')
    foot.scroll_into_view_if_needed()
    health = desk.evaluate("fetch('/api/health').then((r) => r.json())")
    check(f'release {VERSION}: the footer and /api/health name the same version',
          f'Версия {VERSION}' in foot.inner_text() and health.get('version') == VERSION)
    foot.screenshot(path=str(OUT / '1366-footer-version.png'), **SHOT)
    desk_ctx.close()
    alina_ctx.close()
    browser.close()

check('Review 22 November: no uncaught JavaScript errors', not errors)
report = {'base': BASE, 'checks': checks, 'browser_errors': errors, 'measurements': measurements}
(OUT / 'browser-review-1122.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'checks': len(checks), 'failed': [x for x in checks if not x['passed']]}, ensure_ascii=False))
