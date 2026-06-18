# Серверная часть SMB Monitor

Этот файл описывает текущую backend-часть проекта: где лежит код, как запустить PostgreSQL, как применить миграции, как подключить frontend и что уже сохраняется в БД.

Для короткого запуска уже настроенного локального сервера смотри `docs/local-server-run.md`.

Для запуска backend и PostgreSQL на другом компьютере смотри отдельную инструкцию: `docs/remote-server-pc-setup.md`.

## Структура

```text
server/
  src/
    config/      # чтение env-настроек
    db/          # PostgreSQL pool и миграции
    domain/      # валидация и преобразование данных
    http/        # HTTP API
    repositories/# запросы к БД
```

Backend находится в этом же репозитории как npm workspace `@smb-monitor/server`.

## Что уже реализовано

Сервер реализует:

- `GET /health` — проверка, что API запущен;
- `POST /api/dispatcher/submissions` — сохранить диспетчерскую отправку в PostgreSQL;
- `GET /api/dispatcher/submissions` — вернуть последние диспетчерские отправки для вкладки владельца `Диспетчерская`.

Сохраняемые данные:

- `businessAccountId`;
- `period`;
- `metricCode`;
- `rawValue`;
- `comment`;
- `status`;
- `submittedByAccountId`;
- `submittedAt`;
- `receivedAt`.

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
DATABASE_URL=postgresql://smb_monitor:smb_monitor_dev_password@127.0.0.1:5432/smb_monitor
CORS_ORIGIN=http://127.0.0.1:5173,http://localhost:5173
RUN_MIGRATIONS_ON_START=true
```

Не коммитить реальные `.env` файлы.

## Установка зависимостей

Из корня проекта:

```bash
npm install
```

Это установит зависимости frontend и `server/` workspace.

## Запуск PostgreSQL

Нужен Docker.

```bash
docker compose up -d postgres
```

Данные PostgreSQL хранятся в Docker volume `smb_monitor_postgres_data`.

Перезапуск контейнера данные не удаляет:

```bash
docker compose restart postgres
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
    "period": "2026-06",
    "metricCode": "dispatcher.metric",
    "rawValue": "42",
    "comment": "manual check"
  }' \
  http://127.0.0.1:3000/api/dispatcher/submissions
```

Проверка истории:

```bash
curl -i http://127.0.0.1:3000/api/dispatcher/submissions
```

## Как проверить через UI

1. Запустить PostgreSQL.
2. Запустить backend.
3. Запустить frontend.
4. В браузере выбрать профиль `Диспетчер`.
5. Заполнить форму и отправить.
6. Сменить доступ на `Владелец бизнеса`.
7. Открыть вкладку `Диспетчерская`.
8. Запись должна появиться из backend/БД.

## Важные ограничения текущего backend

- Auth пока не production-ready.
- `submittedByAccountId` временно берётся из заголовка `X-SMB-Account-Id` или dev-default `dev-dispatcher-account`.
- Серверная проверка ролей и capabilities будет отдельным следующим шагом.
- Нельзя считать frontend-gating защитой: защищённые действия должны проверяться backend.
- Не логировать payload с приватными данными, токены и секреты.

## Проверки

Из корня проекта:

```bash
npm test
npm run typecheck
npm run build
```
