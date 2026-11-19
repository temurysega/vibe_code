# Развёртывание

Публичный стенд: **https://ai.neblanki.tech/** — Docker-контейнер на VPS за HTTPS-прокси Caddy.
Стенд работает до объявления итогов конкурса; демо-данные не сбрасываются автоматически.

## Как устроен стенд

| Часть | Как сделано | Зачем |
|---|---|---|
| Образ | [`Dockerfile`](../Dockerfile): Node.js 24, `npm ci --omit=dev`, процесс от пользователя `node`, проверка здоровья | Минимум зависимостей и прав внутри контейнера |
| Запуск | [`deploy/compose.vps.yaml`](../deploy/compose.vps.yaml): `NODE_ENV=production`, `COOKIE_SECURE=1`, `TRUST_PROXY=1`, порт только на localhost | Cookie `__Host-` + `Secure`, наружу смотрит только прокси |
| Данные | SQLite в постоянном томе `mgimo-mania-data` (`/data/mgimo.db`), `DEMO_RESEED_HOURS=0` | Заявки, история и сеансы переживают перезапуск и обновление |
| Секреты | `/opt/mgimo-mania/.env` на сервере с правами `0600`; в контейнер — через окружение | Ключ ИИ не попадает в Git, образ, архив и браузер |
| HTTPS | Caddy ([`deploy/ai.neblanki.tech.caddy`](../deploy/ai.neblanki.tech.caddy)): сертификат Let's Encrypt, HSTS, `reverse_proxy mgimo-mania:3000` | Caddy не доверяет присланному посетителем `X-Forwarded-For`, поэтому лимиты входа считаются по настоящему IP |

Каждая версия разворачивается в отдельный каталог `/opt/mgimo-mania/releases/<commit>`,
ссылка `current` указывает на активную. Прежний образ и каталог остаются для отката.

## Обновление

```bash
cd /opt/mgimo-mania/releases/<commit>
docker compose --env-file /opt/mgimo-mania/.env -p mgimo-mania -f deploy/compose.vps.yaml config --quiet
APP_VERSION=<commit> docker compose --env-file /opt/mgimo-mania/.env -p mgimo-mania -f deploy/compose.vps.yaml up -d --build
docker inspect mgimo-mania --format '{{.State.Health.Status}}'
```

Перед заменой контейнера снимается резервная копия SQLite (`integrity_check=ok`, права `0600`).
При обычном обновлении нельзя выполнять `docker compose down -v` и `npm run seed`:
первое удаляет том, второе пересоздаёт демо-данные.

## Приёмка после обновления

1. Контейнер в состоянии `healthy`, публичные файлы совпадают с проверенным коммитом.
2. Вход двумя студентами и сотрудником деканата; чужая заявка по прямой ссылке — «Заявка не найдена».
3. Заявка, созданная до замены контейнера, открывается после неё с теми же полями и историей.
4. Браузерные сценарии на опубликованном адресе (ширины 360 и 1366 px):
   `python test/browser-smoke.py https://ai.neblanki.tech` и остальные наборы из `test/`.

**Последнее обновление, 9 ноября:** код `3b722e9`, версия `review-ad34040a18b8`.
Резервная копия SQLite проверена; прежние заявки, история и сеансы сохранились,
соседние контейнеры не менялись. Все 52 публичных файла совпали с подготовленным кодом;
на HTTPS-адресе прошли 25/25 браузерных проверок без ошибок JavaScript.
[Протокол публикации](evidence/deployment/quality-fixes-deployment.json) ·
[Браузерная приёмка](evidence/deployment/quality-fixes-browser/public-acceptance.json).

Последняя публикация — 19 ноября, `review-d7a91e220757` (код `babcd1d`): 16/16 проверок,
52/52 публичных файла, данные сохранены — [протокол](evidence/deployment/nov19-deployment.json),
[страница входа снаружи](evidence/deployment/nov19-public/public-login.json); скрипт — `artifacts/deploy-nov19.py`
(в репозиторий не входит). Результаты публикаций 8 ноября: [протокол публикации](evidence/deployment/finalization-deployment.json),
[браузерная приёмка HTTPS-версии](evidence/deployment/finalization-browser/run-summary.json),
[сохранение данных после перезапуска контейнера](evidence/deployment/production-persistence.json),
[живые ответы ИИ-помощника](evidence/deployment/finalization-ai.json).

## Возврат посетителей прежнего сайта

Раньше на этом домене работало другое приложение с офлайн-кешем. После замены у прежних
посетителей установленный service worker продолжал показывать старую страницу. Поэтому по
адресу `/sw.js` оставлен миграционный worker: он удаляет только кеши прежнего приложения,
снимает его регистрацию и перезагружает открытые вкладки. Новый кабинет офлайн-worker не
регистрирует. Файл отдаётся с `Cache-Control: no-store`; сценарий воспроизводится в
`test/browser-migration.py`, результат на стенде — [migration-deployed.json](evidence/deployment/migration-deployed.json).

## Другие варианты размещения

- **Docker локально:** `docker compose up --build -d`, затем http://localhost:3000.
  Именованный том сохраняет базу между перезапусками.
- **Render:** [`render.yaml`](../render.yaml) описывает сервис с постоянным диском для SQLite;
  ключ `OPENROUTER_API_KEY` задаётся в панели Render.
- **Масштабирование:** сейчас это один процесс с файловой SQLite. Для нескольких экземпляров
  нужны PostgreSQL, общие лимиты в Redis и вынесенные фоновые задачи — см. [ARCHITECTURE.md](ARCHITECTURE.md).
