"""Запись демонстрации кабинета на экране телефона: Chromium, 390×844, сенсорный ввод.

Сначала запустите сервер на временной базе (как для браузерных тестов), затем:
  python scripts/demo/record-demo.py http://127.0.0.1:<порт> <папка-результата>
Скрипт проходит маршрут жюри (Алина → справка → деканат → документ → Тимур и чужая ссылка)
и сохраняет кадры экрана (JPEG) и timeline.json с подписями к шагам.
Видео из кадров собирает scripts/demo/encode-demo.swift (macOS, AVFoundation).
"""
import asyncio
import base64
import json
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from playwright.async_api import async_playwright

BASE = sys.argv[1].rstrip('/')
OUT = Path(sys.argv[2])
FRAMES = OUT / 'frames'
FRAMES.mkdir(parents=True, exist_ok=True)
W, H, DPR = 390, 844, 2
frames, captions = [], []
# Отметка нажатия: зритель видит, куда коснулся палец. Только на время записи.
RIPPLE = """([x, y]) => {
  const d = document.createElement('div');
  d.style.cssText = `position:fixed;left:${x - 24}px;top:${y - 24}px;width:48px;height:48px;border-radius:50%;`
    + 'background:rgba(215,179,77,.35);border:3px solid rgba(215,179,77,.95);z-index:2147483647;'
    + 'pointer-events:none;transform:scale(.55);transition:transform .35s ease,opacity .45s ease .3s';
  document.body.appendChild(d);
  requestAnimationFrame(() => requestAnimationFrame(() => { d.style.transform = 'scale(1.15)'; d.style.opacity = '0'; }));
  setTimeout(() => d.remove(), 1000);
}"""


def caption(title, subtitle=''):
    captions.append({'t': time.time(), 'title': title, 'subtitle': subtitle})


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={'width': W, 'height': H}, device_scale_factor=DPR,
                                        is_mobile=True, has_touch=True, locale='ru-RU', timezone_id='Europe/Moscow')
        page = await ctx.new_page()
        page.set_default_timeout(20000)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        cdp = await ctx.new_cdp_session(page)
        pending = set()

        async def save(params):
            index = len(frames)
            name = f'frames/{index:05d}.jpg'
            frames.append({'file': name, 't': time.time()})
            (OUT / name).write_bytes(base64.b64decode(params['data']))
            try:
                await cdp.send('Page.screencastFrameAck', {'sessionId': params['sessionId']})
            except Exception:
                pass

        def on_frame(params):
            task = asyncio.ensure_future(save(params))
            pending.add(task)
            task.add_done_callback(pending.discard)

        cdp.on('Page.screencastFrame', on_frame)

        async def pause(seconds):
            await asyncio.sleep(seconds)

        async def tap(locator, after=0.7):
            await locator.scroll_into_view_if_needed()
            box = await locator.bounding_box()
            await page.evaluate(RIPPLE, [box['x'] + box['width'] / 2, box['y'] + box['height'] / 2])
            await pause(0.3)
            await locator.tap()
            await pause(after)

        async def scroll(y, wait=1.6):
            await page.evaluate("(y) => window.scrollTo({top: y, behavior: 'smooth'})", y)
            await pause(wait)

        async def settle():
            close = page.locator('.modal-overlay:not(.closing) [data-close]')
            if await close.count():
                await tap(close.first, 0.9)

        async def login(user, landing='home'):
            await tap(page.locator(f'[data-login="{user}"]'), 0.2)
            await page.wait_for_url(f'**/#/{landing}')
            await pause(1.2)
            await settle()

        async def logout():
            await scroll(0, 0.6)
            await tap(page.locator('[data-me]:visible').first, 0.6)
            await tap(page.locator('[data-out]:visible').first, 0.3)
            await page.wait_for_url('**/#/login')
            await page.locator('[data-login="t.aliev"]').wait_for()
            await pause(1.0)

        await page.goto(BASE)
        await page.locator('[data-login="a.morozova"]').wait_for()
        await pause(1.0)
        await cdp.send('Page.startScreencast', {'format': 'jpeg', 'quality': 86, 'maxWidth': W * DPR,
                                                 'maxHeight': H * DPR, 'everyNthFrame': 1})
        await pause(0.6)

        caption('1 · Вход', 'Тестовые аккаунты — одним нажатием. Полоса сверху напоминает: это концепт для конкурса')
        await pause(4.5)
        await login('a.morozova')

        caption('2 · Главная', 'Ближайшая пара, изменения в расписании и что сделать сейчас')
        await pause(4.2)
        await scroll(560, 3.0)
        await scroll(0, 1.8)
        guide = page.locator('[data-start-guide]:visible')
        if await guide.count():
            caption('2 · «С чего начать»', 'Три прямых действия: расписание, оценки, справки')
            await tap(guide.first, 4.0)
            await settle()

        caption('3 · Расписание', 'Аудитория и преподаватель; переносы, отмены и замены выделены цветом')
        await tap(page.locator('#tabbar a[href="#/schedule"]'), 3.2)
        await scroll(650, 3.0)
        await scroll(1300, 3.0)
        await scroll(0, 1.6)

        caption('4 · Успеваемость', 'Баллы по 100-балльной шкале и сколько не хватает до зачёта или «отлично»')
        await tap(page.locator('#tabbar a[href="#/grades"]'), 3.2)
        attention = page.locator('[data-grade-filter="attention"]:visible')
        if await attention.count():
            await tap(attention.first, 2.6)
        discipline = page.locator('#grade-disciplines [data-disc]:visible')
        if await discipline.count():
            await tap(discipline.first, 4.6)
            await settle()

        caption('5 · Справка онлайн', 'ФИО, факультет и группа подставлены из профиля — остаётся указать, куда нужна справка')
        await tap(page.locator('#tabbar a[href="#/requests"]'), 1.8)
        await tap(page.locator('a.btn-primary[href="#/requests/new"]').first, 1.6)
        await tap(page.locator('[data-type="study"]').first, 1.4)
        await page.locator('[data-form]').wait_for()
        place = page.locator('[name="place"]')
        await tap(place, 0.3)
        moscow = datetime.now(timezone(timedelta(hours=3))).strftime('%H:%M')
        await place.press_sequentially(f'Для проверки жюри, {moscow}', delay=65)
        await pause(1.4)
        await tap(page.locator('[data-submit]'), 0.2)
        await page.wait_for_url(re.compile(r'.*/#/requests/\d+$'))
        request_id = re.search(r'/requests/(\d+)$', page.url).group(1)
        caption('5 · Заявка отправлена', 'Статус и история видны, как у посылки; ссылку на заявку сохраняем для шага 8')
        await pause(4.0)
        await scroll(520, 2.8)
        await scroll(0, 1.4)

        caption('6 · Кабинет деканата', 'Сотрудник видит заявки только своего факультета и принимает решение')
        await logout()
        await login('dekanat.mo', 'dean')
        item = page.locator(f'[data-req="{request_id}"]')
        await item.wait_for()
        await item.scroll_into_view_if_needed()
        await pause(2.4)
        if await item.locator('[data-act="in_work"]').count():
            comment = item.locator('[data-comment]')
            await tap(comment, 0.2)
            await comment.press_sequentially('Данные проверены', delay=55)
            await tap(item.locator('[data-act="in_work"]'), 1.6)
        await item.locator('[data-act="ready"]').wait_for()
        comment = item.locator('[data-comment]')
        await tap(comment, 0.2)
        await comment.press_sequentially('Справка готова, можно скачать', delay=55)
        await tap(item.locator('[data-act="ready"]'), 1.4)
        caption('6 · Решение принято', 'Статус «Готова» записан в историю, студенту ушло уведомление')
        await pause(4.2)

        caption('7 · Уведомление', 'Алина открывает уведомление: статус «Готова», комментарий сотрудника, история')
        await logout()
        await login('a.morozova')
        await tap(page.locator('[data-bell]:visible').first, 2.6)
        notice = page.locator(f'.notif[data-go="#/requests/{request_id}"]')
        await notice.first.wait_for()
        await tap(notice.first, 1.8)
        await page.wait_for_url(f'**/#/requests/{request_id}')
        await pause(2.6)
        await scroll(480, 3.0)
        caption('7 · Документ', 'Образец электронной справки с кодом проверки; PDF сохраняется через печать браузера')
        await tap(page.locator(f'a[href="#/requests/{request_id}/doc"]').first, 2.4)
        await page.locator('article.doc').wait_for()
        await pause(2.6)
        await scroll(520, 3.0)
        await scroll(1100, 3.2)

        caption('8 · Чужие данные закрыты', 'Тимур открывает ту же ссылку на заявку Алины — сервер отвечает «Заявка не найдена»')
        await logout()
        await login('t.aliev')
        await page.evaluate('(hash) => { location.hash = hash; }', f'#/requests/{request_id}')
        await page.locator('.error-box').wait_for()
        await pause(5.5)

        await cdp.send('Page.stopScreencast')
        await pause(0.5)
        if pending:
            await asyncio.gather(*pending)
        (OUT / 'timeline.json').write_text(json.dumps({
            'frame_size': [W * DPR, H * DPR], 'viewport': [W, H], 'device_scale_factor': DPR,
            'request_id': request_id, 'page_errors': errors, 'frames': frames, 'captions': captions,
        }, ensure_ascii=False, indent=1), encoding='utf-8')
        print(f'frames: {len(frames)}, captions: {len(captions)}, request: {request_id}, page errors: {len(errors)}')
        await browser.close()


asyncio.run(main())
