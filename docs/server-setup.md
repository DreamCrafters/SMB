# Серверная часть SMB Monitor

Этот файл описывает текущую backend-часть проекта: где лежит код, как запустить MariaDB/MySQL, как применить миграции, как подключить frontend и что уже сохраняется в БД.

Для короткого запуска уже настроенного локального сервера смотри `docs/local-server-run.md`.

Для запуска backend и MariaDB/MySQL на другом компьютере смотри отдельную инструкцию: `docs/remote-server-pc-setup.md`.

## Структура

```text
server/
  src/
    config/      # чтение env-настроек
    db/          # MariaDB/MySQL pool и миграции
    domain/      # валидация и преобразование данных
    http/        # HTTP API
    repositories/# запросы к БД
```

Backend находится в этом же репозитории как npm workspace `@smb-monitor/server`.

## Что уже реализовано

Сервер реализует:

- `GET /health` — проверка, что API запущен;
- `GET /api/access/profile` — вернуть текущий временный dev-профиль доступа или пустой профиль;
- `POST /api/dev/access-session` — создать временную dev-сессию выбранного типа аккаунта;
- `DELETE /api/dev/access-session` — очистить временную dev-сессию;
- `GET /api/dispatcher/forms` — вернуть серверные определения 6 диспетчерских форм;
- `POST /api/dispatcher/submissions` — сохранить диспетчерскую отправку в MariaDB/MySQL;
- `GET /api/dispatcher/submissions` — вернуть последние диспетчерские отправки, фильтры и счётчики для вкладки владельца `Диспетчерская`.

Для анкет из переданных Apps Script backend повторяет основные правила исходных скриптов: оборудование не принимает пустую строку отчёта и выводит месяц из даты, инцидент использует исходные списки типов/критичности и получает серверный номер `INC-год-номер`, закрытие инцидента требует поля закрытия, посетитель получает время входа на сервере.

Сохраняемые данные:

- `businessAccountId`;
- `formId`;
- `payload`;
- `summary`;
- `status`;
- `submittedByAccountId`;
- `submittedAt`;
- `receivedAt`.

Старые колонки `period`, `metric_code`, `raw_value`, `comment` остаются в таблице для совместимости миграции, но новая рабочая модель пишет `form_id`, `payload` JSON и `summary`.

## Локальные env-файлы

Скопировать frontend env:

```bash
cp .env.example .env
```

Текущее значение для локальной разработки:

```bash
VITE_SMB_REMOTE_API_URL=http://127.0.0.1:3000
```

Скопировать backend env:

```bash
cp server/.env.example server/.env
```

Локальные backend-настройки:

```bash
PORT=3000
DATABASE_URL=mysql://smb_monitor:smb_monitor_dev_password@127.0.0.1:3306/smb_monitor
CORS_ORIGIN=http://127.0.0.1:5173,http://localhost:5173,https://smb-umber.vercel.app,https://smb-*-artemi-z-s-projects.vercel.app
RUN_MIGRATIONS_ON_START=true
```

Для внешней MariaDB/MySQL, например БД хостинга, `DATABASE_URL` меняется на:

```text
DATABASE_URL=mysql://DB_USER:DB_PASSWORD@DB_HOST:3306/DB_NAME
```

Если в пароле есть спецсимволы вроде `@`, `/`, `:` или `#`, их нужно URL-encoded записать в `DATABASE_URL`.

Если frontend открыт с другого origin, добавь этот точный origin в `CORS_ORIGIN`. Для Vercel preview можно использовать hostname-паттерн с `*`, например `https://smb-*-artemi-z-s-projects.vercel.app`. Backend возвращает конкретный origin запроса, если он совпал с паттерном. Для dev-доступа backend также принимает заголовок `X-SMB-Dev-Session`, а CORS preflight разрешает `POST` и `DELETE` для создания и очистки временной dev-сессии.

Текущие Vercel origins frontend:

```text
https://smb-umber.vercel.app
https://smb-*-artemi-z-s-projects.vercel.app
```

Vercel dashboard URL вида `https://vercel.com/artemi-z-s-projects/...` не является browser origin сайта и не нужен в `CORS_ORIGIN`.

Не коммитить реальные `.env` файлы.

## Установка зависимостей

Из корня проекта:

```bash
npm install
```

Это установит зависимости frontend и `server/` workspace.

## Запуск MariaDB/MySQL

Нужен Docker.

```bash
docker compose up -d mariadb
```

Данные MariaDB хранятся в Docker volume `smb_monitor_mariadb_data`.

В `docker-compose.yml` для контейнера включён `restart: unless-stopped`, поэтому Docker будет поднимать MariaDB снова после перезапуска Docker/ПК, пока контейнер не остановлен вручную.

MariaDB опубликована только на локальном интерфейсе серверного ПК:

```text
127.0.0.1:3306
```

Не открывай порт `3306` в локальную сеть: frontend и другие ПК должны обращаться только к backend API.

Перезапуск контейнера данные не удаляет:

```bash
docker compose restart mariadb
```

Удалит данные только команда с `-v`:

```bash
docker compose down -v
```

## Миграции БД

Если в `server/.env` стоит:

```bash
RUN_MIGRATIONS_ON_START=true
```

сервер применит миграции при старте.

Также можно запустить вручную:

```bash
npm run db:migrate
```

## Запуск backend

В отдельном терминале:

```bash
npm run dev:api
```

Проверка:

```bash
curl -i http://127.0.0.1:3000/health
```

Ожидаемый ответ:

```json
{"ok":true}
```

Проверка dev access/profile через backend:

```bash
curl -i http://127.0.0.1:3000/api/access/profile
```

Ожидаемый пустой ответ до выбора dev-доступа:

```json
{"profile":null}
```

Проверка списка диспетчерских форм:

```bash
curl -i http://127.0.0.1:3000/api/dispatcher/forms
```

## Постоянный запуск backend на Windows

Для server-PC профиля без watch-режима используй скрипты:

```powershell
.\scripts\start-remote-server.ps1
```

Он запускает MariaDB, собирает backend и стартует API через `npm --workspace server start`. Лог пишется в `logs/remote-api.log`.

Чтобы зарегистрировать автозапуск через Windows Task Scheduler:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\register-windows-startup-task.ps1
```

По умолчанию задача стартует при входе пользователя в Windows. Подробности по firewall, CORS и сетевому IP смотри в `docs/remote-server-pc-setup.md`.

## Запуск frontend

В другом терминале:

```bash
npm run dev:web -- --host 127.0.0.1
```

Открыть:

```text
http://127.0.0.1:5173/
```

## Проверка отправки

Прямой POST в backend:

```bash
curl -i \
  -H "Content-Type: application/json" \
  -H "X-SMB-Account-Id: dev-dispatcher-account" \
  -d '{
    "businessAccountId": "dev-business-boundary",
    "formId": "equipment",
    "payload": {
      "reportDate": "2026-06-18",
      "equipment": "Пресс №1",
      "productionTons": "42"
    }
  }' \
  http://127.0.0.1:3000/api/dispatcher/submissions
```

Проверка истории:

```bash
curl -i http://127.0.0.1:3000/api/dispatcher/submissions
```

Проверка истории с фильтрами:

```bash
curl -i "http://127.0.0.1:3000/api/dispatcher/submissions?formId=equipment&dateFrom=2026-06-01&dateTo=2026-06-30"
```

## Как проверить через UI

1. Запустить MariaDB.
2. Запустить backend.
3. Запустить frontend.
4. В браузере выбрать профиль `Диспетчер`.
5. Выбрать одну из диспетчерских форм, заполнить поля и отправить.
6. Сменить доступ на `Владелец бизнеса`.
7. Открыть вкладку `Диспетчерская`.
8. Запись должна появиться из backend/БД; фильтры и быстрые счётчики должны обновиться из live feed.

## Локальный тестовый fallback без backend

Для быстрой проверки интерфейса диспетчерских форм можно запустить только frontend через `npm run dev:web -- --host 127.0.0.1`. Если backend не настроен или недоступен, Vite dev-режим использует локальный тестовый fallback:

- временный dev-вход может вернуться к локальным Vite endpoints `/api/access/profile` и `/api/dev/access-session`, а если эти `/api` endpoints отсутствуют на static/frontend-хостинге — к клиентской тестовой dev-сессии в `sessionStorage`;
- формы берутся из локальной тестовой копии 6 диспетчерских форм;
- отправки сохраняются в `localStorage` текущего браузера;
- вкладка владельца `Диспетчерская` читает эту же локальную историю и применяет фильтры;
- интерфейс показывает, что это локальный тестовый режим.

Это не production-auth, не production-хранение и не проверка MariaDB/MySQL. Для реальных данных, работы с другого устройства и подготовки к арендованному серверу запускать backend и БД по основной инструкции.

## Важные ограничения текущего backend

- Auth пока не production-ready.
- `access/profile` и `dev/access-session` в backend пока являются только временным dev-контуром для тестового стенда.
- `submittedByAccountId` временно берётся из заголовка `X-SMB-Account-Id` или dev-default `dev-dispatcher-account`.
- Серверная проверка ролей и capabilities будет отдельным следующим шагом.
- Нельзя считать frontend-gating защитой: защищённые действия должны проверяться backend.
- Для remote/server-PC режима открывать в сеть только API-порт `3000`; MariaDB/MySQL оставлять локальной для backend или доступной только по разрешённому приватному/hosting IP.
- Не логировать payload с приватными данными, токены и секреты.

## Проверки

Из корня проекта:

```bash
npm test
npm run typecheck
npm run build
```
