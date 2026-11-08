# Развёртывание на VPS

Адрес кабинета: https://ai.neblanki.tech/.

Приложение размещается отдельно от остальных проектов сервера:

- `/opt/mgimo-mania/releases/<commit>` — версия исходников;
- `/opt/mgimo-mania/current` — ссылка на активную версию;
- `/opt/mgimo-mania/.env` — серверный ключ OpenRouter и модель, права `0600`;
- контейнер `mgimo-mania`, localhost-порт `8790`;
- постоянный Docker volume `mgimo-mania-data`, SQLite `/data/mgimo.db`;
- существующий Caddy и сеть `predel_default` обслуживают HTTPS.

Контейнер работает от пользователя `node`; сброс базы отключён. Ключи не входят
в Git, образ приложения и архив исходников. Секрет передаётся контейнеру через окружение.
Общие проекты, тома и сеть удалять при обновлении кабинета нельзя.

## Обновление

Развернуть архив нужного коммита в новый каталог `releases/<commit>`, затем:

```bash
cd /opt/mgimo-mania/releases/<commit>
docker compose --env-file /opt/mgimo-mania/.env -p mgimo-mania -f deploy/compose.vps.yaml config --quiet
docker compose --env-file /opt/mgimo-mania/.env -p mgimo-mania -f deploy/compose.vps.yaml up -d --build
docker inspect mgimo-mania --format '{{.State.Health.Status}}'
```

Для маркировки образа задаётся `APP_VERSION=<commit>` в окружении команды.
После проверки обновляется ссылка `current`. Постоянное имя тома сохраняет данные
при смене версии. Не использовать `down -v` и `npm run seed` при обычном обновлении.

Если меняется только код, конфигурацию Caddy трогать не нужно. При первичной замене
старого сервиса изменяется только upstream внутри блока `ai.neblanki.tech`:
`reverse_proxy mgimo-mania:3000`. Сначала проверить конфигурацию, затем выполнить reload:

```bash
docker exec predel-caddy-1 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker exec predel-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

Caddy сохраняет исходный Host и по умолчанию не доверяет переданному посетителем
X-Forwarded-For; это нужно для проверки Origin и ограничения входов.
См. [официальную документацию reverse_proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#headers).

## Приёмка

Проверить вход двух студентов, изоляцию заявок, работу деканата, secure-cookie,
реальный ответ OpenRouter и сохранение заявки после перезапуска контейнера.
После переключения также проверить доступность остальных доменов сервера.

По данным владельца VPS оплачен до **28 ноября 2026, 18:42**. Для доступности до конца
дня подведения итогов потребуется продление. Оплату выполняет владелец.
