# Локальный запуск НМОУ Вектор

Короткая инструкция для запуска проекта на этом компьютере.

## Один раз

Из корня проекта:

```bash
cd /Users/artemiz/WebProjects/SMB
npm install
```

Проверить frontend env:

```bash
cat .env
```

Для локального запуска там должно быть:

```text
VITE_SMB_APP_ENV=test
VITE_SMB_REMOTE_API_URL=http://127.0.0.1:3000
```

Проверить backend env:

```bash
cat server/.env
```

Для локального Docker там должно быть:

```text
SMB_APP_ENV=test
PORT=3000
DATABASE_URL=mysql://smb_monitor:smb_monitor_dev_password@127.0.0.1:3306/smb_monitor
CORS_ORIGIN=http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5174,http://localhost:5174
RUN_MIGRATIONS_ON_START=true
DEV_ACCESS_ENABLED=true
SESSION_COOKIE_NAME=smb_test_session
SESSION_TTL_HOURS=12
```

Локальный режим `test` оставляет экран выбора роли и dev-session. В режиме
`production` frontend показывает форму логина/пароля, backend отключает
`/api/dev/access-session`, не использует клиентский fallback и проверяет
dispatcher/admin действия по серверной session.

Для локальной проверки двух frontend-сборок можно использовать mode-файлы:

```bash
cp .env.test.example .env.test
cp .env.production.example .env.production
npm run build:web:test
npm run build:web:production
```

Vite читает `.env.test` при `--mode test` и `.env.production` при
`--mode production`. Это тот же механизм, который используется для Jino deploy.

## Локальный Docker для БД

Запустить Docker Desktop:

```bash
open -a Docker
docker info
```

Запустить MariaDB:

```bash
docker compose up -d mariadb
docker compose ps mariadb
```

Если первый pull `mariadb:10.11` зависает на Docker credentials, скачать образ через временный пустой Docker config:

```bash
TMP_DOCKER_CONFIG=$(mktemp -d)
DOCKER_CONFIG="$TMP_DOCKER_CONFIG" docker pull mariadb:10.11
docker compose up -d mariadb
```

Остановить БД без удаления данных:

```bash
docker compose stop mariadb
```

Не использовать `docker compose down -v`, если нужно сохранить локальные данные.

## Локальный сервер

Терминал 1: backend API.

```bash
npm run dev:api
```

Проверка:

```bash
curl -i http://127.0.0.1:3000/health
```

Терминал 2: frontend.

```bash
npm run dev:web -- --host 127.0.0.1
```

Открыть URL из вывода Vite. Обычно:

```text
http://127.0.0.1:5173/
```

### Если браузер показывает старые стили или старое поведение

Сначала убедиться, что один checkout не запущен сразу несколькими Vite-процессами:

```bash
lsof -nP -iTCP:5173 -sTCP:LISTEN
lsof -nP -iTCP:5174 -sTCP:LISTEN
```

Сравнить с исходниками реально отдаваемые браузеру CSS/JS и их `Cache-Control` через `curl`. Если сервер отдаёт актуальный код, но обычный браузер отличается от встроенного preview, открыть приложение в новой вкладке на чистом origin — временно запустить Vite на `5174` с принудительной пересборкой:

```bash
npm run dev:web -- --host 127.0.0.1 --port 5174 --strictPort --force
```

Если на новом origin проблема исчезла, причина была в устаревшей вкладке или HMR-состоянии, а не в текущем CSS. После проверки остановить лишний Vite-процесс и продолжать работу с одним стандартным сервером на `http://127.0.0.1:5173/`.

## Локальная production-проверка

Если нужно проверить production login вместо выбора роли, временно выставить:

```text
VITE_SMB_APP_ENV=production
SMB_APP_ENV=production
DEV_ACCESS_ENABLED=false
SESSION_COOKIE_NAME=smb_session
```

После миграций создать нового тестового пользователя в локальной БД:

```bash
SMB_AUTH_LOGIN=admin \
SMB_AUTH_PASSWORD='local-secret' \
SMB_AUTH_DISPLAY_NAME='Администратор' \
SMB_AUTH_ACCOUNT_TYPE=admin \
npm --workspace server run auth:create-user
```

`auth:create-user` создаёт только новый логин. Повторный логин отклоняется и не
обновляет существующую роль или пароль; для смены пароля использовать отдельное
действие сброса в админском интерфейсе/API.

Для `business_owner`, `dispatcher` и `worker` достаточно тех же четырёх
переменных с нужным `SMB_AUTH_ACCOUNT_TYPE`. Backend сам назначает всем
неадминистративным аккаунтам общий organization scope; дополнительные scope ID
и переменные бизнеса не используются.

Пароль не коммитить и не выводить в ответы/логи.

Backend-команды можно запускать с явным env-файлом, чтобы не перезаписывать
`server/.env`:

```bash
SMB_SERVER_ENV_FILE=server/.env.production npm --workspace server run db:migrate
```

## Остановка

Backend и frontend остановить через `Ctrl+C` в их терминалах.

MariaDB можно оставить запущенной или остановить:

```bash
docker compose stop mariadb
```
