# SPEC.md — требования и где они выполнены

Состояние на 19 ноября 2026 · код `fe1191c` · `npm test` — 47/47 (проверено при составлении файла).
Основа: текст задания конкурса, `docs/CONTEST_AUDIT.md`, тесты в `test/`.
Правило: требование без строки «Как проверить» не считается выполненным. «Вручную» значит, что автоматической проверки нет.
Браузерные наборы запускай по `AGENTS.md` (временная база, ключи ИИ пустые).

## Обязательное ядро

| ID | Требование | Где реализовано | Как проверить |
|---|---|---|---|
| CORE-1 | Вход и профиль: ФИО, факультет, направление, профиль, курс, группа, куратор, контакты деканата | `server/routes/auth.js`, `server/routes/student.js` (`profileOf`, `/api/me`), `public/js/views/login.js`, `profile.js`; куратор — `groups.curator` в `server/schema.sql` | `security.test.js` «неверный пароль не пускает…», «перебор паролей блокируется»; `test/browser-smoke.py`. Куратор: тестов нет; вручную `a.morozova` → профиль → «Куратор» |
| CORE-2 | Расписание: сегодня и неделя, аудитория, преподаватель, заметные изменения и переносы | `server/domain/schedule.js`, `public/js/views/schedule.js` | `domain.test.js` «расписание: изменения видны в неделе»; `browser-schedule-readability.py`, `browser-polish.py` |
| CORE-3 | Успеваемость: оценки и зачёты, сессия, картина «как у меня дела» | `server/domain/grades.js`, `public/js/views/grades.js` | `domain.test.js` «100-балльная шкала»; `browser-grades-compact.py`, `browser-review.py` |
| CORE-4 | Заявки и справки: заказ онлайн и статус | `server/domain/requests.js`, `server/routes/requests.js`, `server/routes/dean.js`, `public/js/views/requests.js`, `dean.js` | `domain.test.js` «сценарий: справка подана, деканат взял в работу…»; `stipend.test.js`; `browser-flows.py`, `browser-request-compact.py`, `browser-stipend.py` |
| CORE-5 | Уведомления: новости деканата, дедлайны, изменения | `server/domain/notifications.js`, `public/js/views/notifications.js` | `backend-regressions.test.js` «прочитать все очищает длинную историю…»; `browser-accessibility.py`, `browser-focus-contrast.py` (фильтры) |

## Требования к прототипу

| ID | Требование | Где реализовано | Как проверить |
|---|---|---|---|
| REQ-01 | Работающий прототип по ссылке: войти, расписание, оценки, заявка, статус | https://ai.neblanki.tech/; `deploy/compose.vps.yaml`, `docs/DEPLOYMENT.md` | `docs/evidence/deployment/quality-fixes-browser/public-acceptance.json` (25/25, 9 ноября); текущий стенд после 9 ноября не проверялся |
| REQ-02 | Адекватный и масштабируемый стек | `docs/ARCHITECTURE.md`, `docs/ai/DECISIONS.md` | Чтение; нагрузочных измерений нет |
| REQ-03 | Код пишут ИИ-ассистенты | `docs/PROCESS.md`, `AGENTS.md`, `docs/ai/PROMPTS_LOG.md`, `docs/evidence/*-session.json` | Чтение; история Git — `git log` |
| REQ-04 | Все основные сценарии от 360 px | `public/css/responsive.css` | `scripts/collect-evidence.py`: наборы на 360 и 1366 px |
| REQ-05 | Только вымышленные данные, без систем вуза | `server/seed/data.js`, `server/seed/seed.js` | Вручную: чтение сида (инвариант 12) |
| REQ-06 | Понятно, что это концепт | `public/js/app.js` (`paintConcept`), подвал, пометка на образце справки (`public/js/views/requests.js`) | Вручную: любой экран кабинета |
| REQ-07 | Без логотипа вуза | `public/img/logo.svg`, `public/js/art/logo.js` | Вручную |
| REQ-08 | Сторонние материалы с лицензией | `THIRD_PARTY.md`, `public/fonts/OFL-Onest.txt` | Сверка с `node_modules/*/LICENSE` (E-12) |
| REQ-09 | Чужой профиль и чужую заявку не открыть подстановкой адреса | `server/routes/requests.js` (`own()`), `server/security/auth.js` | `security.test.js` «студент не открывает чужую заявку…», «профиль и оценки — только свои»; `backend-regressions.test.js` «подстановка student_id…» |
| REQ-10 | Пароли не в открытом виде | `server/security/password.js` | `security.test.js` «пароли хранятся только в виде хеша scrypt»; `domain.test.js` «хеширование паролей…» |
| REQ-11 | Ключи сервисов не в коде и не в браузере | `server/config.js`, `.gitignore`, `.env.example` | `security.test.js` «ключ ИИ не уходит в браузер»; `assistant.test.js` «OpenRouter получает только снимок…»; `security-gaps.test.js` «в истории Git нет ключей…» |
| REQ-12 | Открывается из России без VPN до 28 ноября | `docs/DEPLOYMENT.md` | **Не проверено агентами**: проверку из российской сети делает человек |
| REQ-13 | Минимум два студента с разными данными и сотрудник | `server/seed/seed.js` (`DEMO_ACCOUNTS`: три студента, один сотрудник) | `security.test.js` «деканат видит только свой факультет…» |
| REQ-14 | Данные сохраняются | `server/db.js`, том в `deploy/compose.vps.yaml`, `DEMO_RESEED_HOURS=0` | `backend-regressions.test.js` «заявка, история, уведомления и сессия сохраняются…»; `docs/evidence/deployment/production-persistence.json` |

## Подача

| ID | Требование | Где | Как проверить |
|---|---|---|---|
| SUB-01 | Описание процесса (PDF со скриншотами) | `docs/PROCESS.pdf`, `docs/PROCESS.md`; сборка `scripts/build-process.py` | Открыть PDF; числа сверить с `docs/evidence/*/run-summary.json` |
| SUB-02 | Ключевые промпты и диалоги с привязкой к этапам | `docs/PROMPTS.json`, `docs/ai/PROMPTS_LOG.md`, `docs/evidence/subagents-2026-11-19/` | Происхождение каждого текста указано в записи |
| SUB-03 | Перечень ИИ-инструментов и для чего | `docs/PROCESS.md`, раздел 11 | Чтение |
| SUB-04 | Как устроены вход, хранение и защита простыми словами | `docs/PROCESS.md` («Защита простыми словами»), `docs/SECURITY.md` | Сверка с инвариантами 1–5 |
| SUB-05 | Исходный код с доступом для жюри | Репозиторий; `scripts/package-source.py` (архив) | Видимость репозитория меняет только человек |
| SUB-06 | Видео до 5 минут — по желанию | Не сделано: по `docs/PROCESS.md` автор отложил необязательный ролик | — |

## Сверх ядра

| ID | Что | Где | Как проверить |
|---|---|---|---|
| X-01 | Кабинет деканата только своего факультета | `server/routes/dean.js`, `public/js/views/dean.js` | `security.test.js` «деканат видит только свой факультет…»; `dean-limits.test.js` |
| X-02 | «Спросить деканат» с резервными правилами | `server/domain/assistant.js`, `server/routes/assistant.js` | `assistant.test.js` (9 тестов) |
| X-03 | Игровой слой: кампус, питомец, забег, Лавка | `server/domain/play.js`, `public/js/views/game.js`, `campus.js`, `shop.js` | `security.test.js` «счёт забега…», «закрытую вещь…» |
| X-04 | Проверка справки по коду без входа | `server/routes/requests.js` (`/api/verify/:code`), `public/js/views/verify.js` | `test/qr-mentions.test.js` «то, что квиз обещает вместо QR, есть…» |
| X-05 | Экспорт расписания в календарь | `server/routes/student.js` (`/api/schedule.ics`) | Вручную |

## Качество (критерий 4)
Состояния загрузки, пустоты и ошибки, клавиатура, контраст — правила в `docs/ai/DESIGN.md`; проверки —
`browser-accessibility.py`, `browser-focus-contrast.py`, `browser-audit-fixes.py`. Полный аудит WCAG не проводился.

## Поля профиля и где они проходят
Группа → профиль → студент. `groups` (`server/schema.sql`: code, faculty_id, course, program, profile, curator) →
`server/security/auth.js` (выборка студента с `g.curator`) → `profileOf()` в `server/routes/student.js` → `/api/me` →
`public/js/views/profile.js`. Новое поле группы проходит все пять мест плюс `server/seed/data.js` (массив `GROUPS`).
