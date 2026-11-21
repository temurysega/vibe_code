"""Исправления по независимой рецензии 21 ноября — на изолированном сервере с демо-кабинетами, как на стенде.

Сборщик scripts/collect-evidence.py запускает сервер для этого набора с DEMO_SANDBOXES=1.
Проверяет: свой кабинет у каждого проверяющего и ссылку для второго окна; вход, когда игровой слой
не отвечает; повторную заявку, которая открывает существующую; поиск в очереди деканата, прямую ссылку
и черновик комментария при автообновлении; справку файлом PDF на телефоне и проверку по ссылке из файла;
уведомление об изменении, которое ведёт к паре; «Сегодня» в расписании; ручной демо-тур из «Ещё»;
вкладки зачётки с клавиатуры; прогноз допуска; ответ помощника о группе.
"""
from datetime import datetime
import json
import os
from pathlib import Path
import re
import sys
from urllib.parse import urlparse
from zoneinfo import ZoneInfo
from playwright.sync_api import sync_playwright, expect
from pypdf import PdfReader

if len(sys.argv) != 2 or urlparse(sys.argv[1]).hostname not in ('127.0.0.1', 'localhost', '::1'):
    raise SystemExit('Pass the URL of an isolated local QA server started with DEMO_SANDBOXES=1.')
BASE = sys.argv[1].rstrip('/')
OUT = Path(os.environ.get('QA_OUTPUT_DIR') or Path(__file__).resolve().parents[1] / 'docs/evidence/review-fixes')
OUT.mkdir(parents=True, exist_ok=True)
PHONE = {'viewport': {'width': 360, 'height': 800}, 'is_mobile': True, 'has_touch': True, 'reduced_motion': 'reduce'}
DESKTOP = {'viewport': {'width': 1366, 'height': 900}, 'reduced_motion': 'reduce'}
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


def more_menu(page, item):
    page.locator('#tabbar [data-more]').click()
    page.locator(f'.menu {item}').click()


def submit_study(page, place):
    page.goto(BASE + '/#/requests/new/study')
    page.locator('[data-form]').wait_for()
    page.locator('input[name="delivery"][value="electronic"]').check()
    page.locator('[name="place"]').fill(place)
    page.locator('[data-submit]').click()


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    # 1. Игровой слой не отвечает — вход и учебная главная всё равно работают (рецензия, п. 2)
    ctx = browser.new_context(**PHONE)
    page = watch(ctx.new_page())
    ctx.route('**/api/play**', lambda route: route.fulfill(status=503, content_type='application/json', body='{"error":"Игровой слой недоступен"}'))
    login(page, 'a.morozova')
    expect(page.locator('[data-sec="next"]')).to_be_visible()
    check('play API answers 503: sign-in still opens the study home', page.locator('[data-sec="requests"]').count() == 1)
    page.goto(BASE + '/#/schedule')
    page.locator('.day-col').first.wait_for()
    check('play API answers 503: schedule opens and the header has no broken coins or avatar', page.locator('.day-col').count() >= 5)
    ctx.close()

    # 2. Первый проверяющий на телефоне: свой кабинет и ссылка для второго окна (п. 1)
    alina_ctx = browser.new_context(**PHONE)
    alina = watch(alina_ctx.new_page())
    login(alina, 'a.morozova')
    sandbox = api(alina, '/api/demo')['data']
    sid = sandbox.get('id') or ''
    check('first sign-in creates a personal demo cabinet', sandbox.get('sandboxes') is True and re.fullmatch(r'[a-z2-7]{16}', sid) is not None)
    more_menu(alina, '[data-sandbox]')
    link = alina.locator('[data-sandbox-link]')
    link.wait_for()
    check('«Ещё» → «Ваш демо-кабинет» shows a link to the same cabinet', link.input_value() == f'{BASE}/?demo={sid}')
    alina.screenshot(path=str(OUT / '360-sandbox-link.png'), animations='disabled', style='#toast-root {visibility:hidden}')
    alina.locator('.modal-overlay [data-close]').first.click()
    expect(alina.locator('.modal-overlay')).to_have_count(0)

    # 3. Повторная такая же заявка открывает существующую, а не вторую копию (п. 4)
    submit_study(alina, 'Для проверки жюри')
    alina.wait_for_url(re.compile(r'.*#/requests/\d+$'))
    rid = int(alina.url.rsplit('/', 1)[1])
    number = api(alina, f'/api/requests/{rid}')['data']['request']['number']
    total = len(api(alina, '/api/requests')['data']['requests'])
    submit_study(alina, 'Для проверки жюри')
    expect(alina.locator('#toast-root .toast', has_text='открываем её')).to_be_visible()
    alina.wait_for_url(re.compile(rf'.*#/requests/{rid}$'))
    check('a duplicate request opens the existing one instead of creating a copy', len(api(alina, '/api/requests')['data']['requests']) == total)

    # 4. Второй проверяющий без ссылки получает свой кабинет и не видит чужую заявку
    other_ctx = browser.new_context(**PHONE)
    other = watch(other_ctx.new_page())
    login(other, 'a.morozova')
    other_id = api(other, '/api/demo')['data'].get('id')
    check('another reviewer gets a different cabinet', other_id and other_id != sid)
    check("another reviewer cannot open the first reviewer's request", api(other, f'/api/requests/{rid}')['status'] == 404)
    other_ctx.close()

    # 5. Деканат во втором окне по ссылке: тот же кабинет, поиск по номеру, прямая ссылка, черновик (п. 9)
    dean_ctx = browser.new_context(**DESKTOP)
    dean = watch(dean_ctx.new_page())
    dean.goto(f'{BASE}/?demo={sid}')
    login(dean, 'dekanat.mo')
    item = dean.locator(f'[data-req="{rid}"]')
    item.wait_for()
    check("the link opens the same cabinet: the dean sees the reviewer's request", item.count() == 1)
    search = dean.locator('#dean-q')
    for query in [number, str(int(number.split('/')[1]))]:
        search.fill(query)
        search.press('Enter')
        expect(dean.locator('.q-item')).to_have_count(1)
        check(f'search «{query}» finds exactly this request', dean.locator(f'.q-item[data-req="{rid}"]').count() == 1)
    search.fill('99999')
    search.press('Enter')
    expect(dean.locator('.card.empty', has_text='не найдена')).to_be_visible()
    check('search for a missing number says so instead of an empty queue', True)
    dean.locator('[data-search-clear]').click()
    expect(dean.locator('.q-item').first).to_be_visible()
    dean.locator(f'[data-req="{rid}"] a[href="#/dean/{rid}"]').click()
    dean.wait_for_url(re.compile(rf'.*#/dean/{rid}$'))
    expect(dean.locator('.q-item')).to_have_count(1)
    check('the request number is a direct link that opens only this request', dean.locator('a[href="#/dean"]', has_text='Вся очередь').is_visible())
    dean.screenshot(path=str(OUT / '1366-dean-direct-link.png'), animations='disabled', style='#toast-root {visibility:hidden}')
    dean.goto(BASE + '/#/dean')
    field = dean.locator(f'#c-{rid}')
    field.wait_for()
    label = dean.locator(f'label[for="c-{rid}"]').inner_text()
    check('the comment field has a visible label with the request number', number in label and 'Комментарий студенту' in label)
    fetched = []
    dean.on('request', lambda r: fetched.append(r.url) if '/api/dean/requests' in r.url else None)
    draft = 'Черновик: данные сверены'
    field.fill(draft)
    dean.wait_for_timeout(11500)
    check('while typing, the 10-second refresh keeps the text and the focus',
          fetched and field.input_value() == draft and field.evaluate('(el) => el === document.activeElement'))
    dean.evaluate("document.querySelector('.queue').dataset.before = '1'")
    dean.locator('h1').click()
    dean.wait_for_timeout(11500)
    check('after the focus leaves, the refresh repaints the queue and keeps the unsent comment',
          dean.evaluate("!document.querySelector('.queue').dataset.before") and dean.locator(f'#c-{rid}').input_value() == draft)
    # Готовность: деканат берёт заявку и выдаёт электронную справку
    item = dean.locator(f'[data-req="{rid}"]')
    if item.locator('[data-act="in_work"]').count():
        item.locator('[data-act="in_work"]').click()
    item.locator('[data-act="ready"]').wait_for()
    dean.locator(f'#c-{rid}').fill('Справка готова')
    item.locator('[data-act="ready"]').click()
    expect(dean.locator(f'[data-req="{rid}"]')).to_have_count(0)
    dean_ctx.close()

    # 6. Справка файлом PDF прямо на телефоне, ссылка из файла ведёт в этот же кабинет (п. 10)
    alina.goto(f'{BASE}/#/requests/{rid}/doc')
    alina.locator('article.doc').wait_for()
    pdf_link = alina.locator('[data-pdf]')
    check('360: «Скачать PDF» is the first action on the certificate page', pdf_link.is_visible() and 'Скачать PDF' in pdf_link.inner_text())
    alina.screenshot(path=str(OUT / '360-certificate-actions.png'), animations='disabled', style='#toast-root {visibility:hidden}')
    with alina.expect_download() as info:
        pdf_link.click()
    download = info.value
    check('360: the certificate downloads as a PDF file', re.fullmatch(r'spravka-\d{4}-\d{5}\.pdf', download.suggested_filename) is not None)
    path = OUT / 'study-certificate.pdf'
    download.save_as(str(path))
    reader = PdfReader(str(path))
    text = '\n'.join(page_.extract_text() for page_ in reader.pages).replace('\xa0', ' ')
    measurements.append({'pdf_bytes': path.stat().st_size, 'pdf_pages': len(reader.pages)})
    check('PDF: Cyrillic text is real text, with the student, the place and the sample mark',
          'СПРАВКА ОБ ОБУЧЕНИИ' in text and 'Настоящая справка подтверждает, что Морозова Алина Дмитриевна' in text
          and 'Для проверки жюри' in text and 'ОБРАЗЕЦ' in text)
    uris = [str(a.get_object()['/A']['/URI']) for page_ in reader.pages for a in page_.get('/Annots', [])]
    verify = next((u for u in uris if '#/verify/' in u), '')
    check('PDF: the verification link leads to the same demo cabinet', verify.startswith(f'{BASE}/?demo={sid}#/verify/'))
    check_ctx = browser.new_context(**PHONE)
    checker = watch(check_ctx.new_page())
    checker.goto(verify)
    expect(checker.locator('text=Справка действительна')).to_be_visible()
    check('a person without an account opens the link from the PDF and sees the certificate is valid', True)
    check_ctx.close()

    # 7. Уведомление об изменении расписания ведёт к дате и паре (п. 6)
    alina.goto(BASE + '/#/notifications')
    alina.locator('.n-item').first.wait_for()
    change = alina.locator('.n-item[data-link^="#/schedule/2"]').first
    check('a schedule change notification carries a link to the date and pair', change.count() == 1)
    target = change.get_attribute('data-link')
    change.click()
    alina.wait_for_url(re.compile(r'.*#/schedule/\d{4}-\d{2}-\d{2}/\d$'))
    expect(alina.locator('.modal-overlay .modal')).to_be_visible()
    check('one tap opens the changed lesson with its details', alina.locator('.lesson.target').count() >= 1 and target in alina.url)
    alina.screenshot(path=str(OUT / '360-schedule-change-from-notification.png'), animations='disabled', style='#toast-root {visibility:hidden}')
    alina.keyboard.press('Escape')
    expect(alina.locator('.modal-overlay')).to_have_count(0)

    # 8. Явное «Сегодня» в расписании: после пар и в выходной (п. 6)
    alina.goto(BASE + '/#/schedule')
    alina.locator('.day-col').first.wait_for()
    now = datetime.now(ZoneInfo('Europe/Moscow'))
    week = api(alina, '/api/schedule')['data']
    today = next((d for d in week['days'] if d['date'] == now.strftime('%Y-%m-%d')), None)
    upcoming = [x for x in (today['items'] if today else []) if x.get('status') not in ('cancelled', 'moved') and x['end'] > now.strftime('%H:%M')]
    note = alina.locator('.today-note')
    if upcoming:
        check('schedule: with lessons still ahead today, no «Сегодня пар нет» note', note.count() == 0)
    else:
        expect(note).to_be_visible()
        check('schedule: after the last lesson or on a day off, the page says so and names the nearest lesson', note.inner_text().startswith('Сегодня'))
    measurements.append({'schedule_checked_at_msk': now.isoformat(timespec='minutes'), 'lessons_ahead_today': len(upcoming)})

    # 9. Демо-тур из «Ещё» листается вручную (п. 11)
    alina.goto(BASE + '/#/home')
    alina.locator('[data-sec="next"]').wait_for()
    more_menu(alina, '[data-tourm]')
    bar = alina.locator('.demo-bar')
    bar.wait_for()
    first = bar.locator('.demo-n').inner_text()
    alina.wait_for_timeout(6000)
    check('tour: no auto-advance — after 6 s the first step is still shown', bar.locator('.demo-n').inner_text() == first and first.startswith('1 /'))
    bar.locator('[data-next]').click()
    expect(bar.locator('.demo-n')).to_have_text(re.compile(r'^2 /'))
    alina.screenshot(path=str(OUT / '360-demo-tour.png'), animations='disabled', style='#toast-root {visibility:hidden}')
    bar.locator('[data-prev]').click()
    expect(bar.locator('.demo-n')).to_have_text(re.compile(r'^1 /'))
    bar.locator('[data-stop]').click()
    expect(alina.locator('.demo-bar')).to_have_count(0)
    check('tour: «Дальше», «Назад» and «Закрыть» work', True)

    # 10. Зачётка: вкладки семестров с клавиатуры; прогноз допуска назван прогнозом (п. 7, 11)
    alina.goto(BASE + '/#/grades/history')
    tabs = alina.locator('.sem-tabs [role="tab"]')
    tabs.first.wait_for()
    selected = alina.locator('.sem-tabs [role="tab"][aria-selected="true"]')
    before = selected.inner_text()
    selected.focus()
    alina.keyboard.press('ArrowLeft' if tabs.count() > 1 and before != tabs.first.inner_text() else 'ArrowRight')
    expect(alina.locator('.sem-tabs [role="tab"][aria-selected="true"]')).not_to_have_text(before)
    check('grades: arrow keys switch semesters and keep the focus on the selected tab',
          alina.evaluate("document.activeElement.getAttribute('role') === 'tab' && document.activeElement.getAttribute('aria-selected') === 'true'"))
    alina.goto(BASE + '/#/grades/session')
    alina.locator('.exam-row').first.wait_for()
    body = alina.locator('main').inner_text()
    check('session: admission is called a forecast, with when the dean sets the real one', 'Прогноз допуска' in body and 'Фактический допуск' in body)

    # 11. Помощник отвечает о группе по профилю, без внешней модели (п. 12)
    more_menu(alina, '[data-askm]')
    question = alina.locator('.chat-form input[name="q"]')
    question.wait_for()
    question.fill('Какая у меня группа?')
    question.press('Enter')
    answer = alina.locator('.msg.bot', has_text='МО-25-03')
    expect(answer).to_be_visible()
    check('assistant: «Какая у меня группа?» is answered from the profile', 'группа МО-25-03' in answer.inner_text())
    alina_ctx.close()
    browser.close()

check('Review fixes: no uncaught JavaScript errors', not errors)
report = {'base': BASE, 'checks': checks, 'browser_errors': errors, 'measurements': measurements}
(OUT / 'browser-review-fixes.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'checks': len(checks), 'failed': [x for x in checks if not x['passed']]}, ensure_ascii=False))
