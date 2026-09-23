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
PRODUCTION_SNAPSHOT_ENABLED=false
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
SMB_AUTH_BOOTSTRAP_ROOT=true \
SMB_AUTH_LOGIN=initial-owner \
SMB_AUTH_PASSWORD='local-secret' \
SMB_AUTH_DISPLAY_NAME='Администратор' \
SMB_AUTH_ACCOUNT_TYPE=admin \
npm --workspace server run auth:create-user
```

`auth:create-user` создаёт только новый логин. Повторный логин отклоняется и не
обновляет существующую роль или пароль; для смены пароля использовать отдельное
действие сброса в админском интерфейсе/API или описанное ниже восстановление root через консоль.
`SMB_AUTH_BOOTSTRAP_ROOT=true` нужен только для первого корневого аккаунта: повторный bootstrap запрещён даже с другим логином. После создания флаг убрать; обычным аккаунтам его не задавать.

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

## Локальная проверка снимка production → test

По умолчанию опасная операция отключена. Чтобы проверить её на двух локальных
БД, в `server/.env` тестового backend-а дополнительно указать:

```text
PRODUCTION_SNAPSHOT_ENABLED=true
PRODUCTION_DATABASE_URL=mysql://readonly_user:secret@127.0.0.1:3306/smb_production
PRODUCTION_SNAPSHOT_TARGET_DATABASE=smb_monitor
```

`PRODUCTION_SNAPSHOT_TARGET_DATABASE` должен дословно совпадать с именем БД из
`DATABASE_URL`, а production и test обязаны иметь разные имена БД. Для
`PRODUCTION_DATABASE_URL` использовать отдельного пользователя production с
правами только чтения; URL и пароль не коммитить и не выводить в логи.

Операция доступна только администратору test-среды во вкладке `БД`. Backend
требует одинаковые таблицы, DDL и историю миграций, а также InnoDB без
триггеров. Затем он одной транзакцией заменяет строки всех test-таблиц данными
production и оставляет `auth_sessions` пустой. Общий advisory lock не допускает
параллельных записей; при любой ошибке транзакция целиком откатывается и прежнее
состояние test остаётся доступным.

## Остановка

Backend и frontend остановить через `Ctrl+C` в их терминалах.

MariaDB можно оставить запущенной или остановить:

```bash
docker compose stop mariadb
```

## Напоминания по поручениям гендиректора

После обновления с задачей 117 применить `npm run db:migrate` (миграция
`086_director_assignment_reminders`) и перезапустить backend. Напоминания
работают внутри Node-процесса, отдельный cron не требуется. По умолчанию они
включены только при `SMB_APP_ENV=production`; в test для контролируемой проверки
нужно явно задать `DIRECTOR_ASSIGNMENT_REMINDERS_ENABLED=true` и настроить
тестовые контакты/каналы. Значение `false` выключает фоновую проверку в любой
среде. Политика дней и правила получателей описаны в `docs/director-assignments.md`.


## Корневой доступ и забытый пароль

Перед запуском обновлённого backend применить `npm run db:migrate`
(миграция `087_root_admin_identity`), собрать приложение и перезапустить backend.
Миграция один раз переносит полномочия прежнего исходного администратора в
`app_users.is_root_admin`; пароль, логин и выданные права не меняет. После этого
переименование не лишает аккаунт корневых полномочий. Сам по себе логин `admin`
не даёт привилегий. Поле root отсутствует в обычных API изменения аккаунта и
общем редакторе БД; флажок `Защита` не выдаёт root.

Если действующий корневой администратор забыл пароль, нужен доступ к SSH
или консоли хостинга. Из корня нужного экземпляра проекта выполнить:

```bash
npm --workspace server run auth:recover-root
```

Команда запрашивает текущий логин и дважды новый пароль (8–1024 символа).
Ввод скрыт; старый пароль и вход на сайт не нужны. Не передавать новый пароль
аргументом команды: он не должен попадать в историю shell или список процессов.
Для собранного production без dev-зависимостей доступен тот же CLI:

```bash
node server/dist/db/recoverRootPassword.js
```

По умолчанию используется `server/.env` выбранного экземпляра. Другую среду
выбирать явно через `SMB_SERVER_ENV_FILE` с абсолютным путём; команда меняет
пароль только в указанной БД. Она проверяет активный root-признак, меняет пароль,
отзывает все старые сессии и записывает событие `Консоль сервера` одной
транзакцией. При сбое аудита изменения откатываются. После сообщения об успехе
войти на сайт с тем же логином и новым паролем. Аккаунт, документы и назначения
не пересоздаются и не меняются. Отключённый или архивный аккаунт эта команда
не восстанавливает, новых root-пользователей не создаёт.

Если введённый логин не подходит, сначала проверить выбранный экземпляр/БД,
актуальный логин и факт применения миграции 087. Повторный `auth:create-user`
не является восстановлением пароля существующего аккаунта. Команда recovery
не выставляется наружу как endpoint; владение серверной консолью является
основанием операции.
