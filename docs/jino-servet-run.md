# Jino deploy: одна ветка, test и production

## Топология

- `smb.aonmou.ru` — production: `VITE_SMB_APP_ENV=production`, `SMB_APP_ENV=production`, отдельная production MariaDB/MySQL.
- `test.smb.aonmou.ru` — test/staging: `VITE_SMB_APP_ENV=test`, `SMB_APP_ENV=test`, отдельная test MariaDB/MySQL или текущая тестовая БД.
- Оба домена могут деплоиться из одной ветки, по умолчанию `main`.
- Frontend собирается два раза из одного кода: `npm run build:web:test` и `npm run build:web:production`.
- Backend runtime должен быть раздельным для каждого домена, потому что у test и production разные `server/.env`, `DATABASE_URL`, cookie и CORS.
- Production не должен включать `DEV_ACCESS_ENABLED=true`; `/api/dev/access-session` в production отключён.

## Каталоги на Jino

Production:

```text
~/domains/smb.aonmou.ru/app
~/domains/smb.aonmou.ru/public_html
~/domains/smb.aonmou.ru/app.js
```

Test:

```text
~/domains/test.smb.aonmou.ru/app
~/domains/test.smb.aonmou.ru/public_html
~/domains/test.smb.aonmou.ru/app.js
```

Оба каталога `app` — checkout одного и того же репозитория и одной ветки.
Разница хранится только в непубличных env-файлах.

## Первый setup env

Production frontend env:

```bash
cd ~/domains/smb.aonmou.ru/app
cp .env.production.example .env.production
```

Production `.env.production`:

```text
VITE_SMB_APP_ENV=production
VITE_SMB_REMOTE_API_URL=https://smb.aonmou.ru
```

Production backend env:

```bash
cp server/.env.production.example server/.env
```

Production `server/.env` должен содержать реальные секреты и production БД:

```text
SMB_APP_ENV=production
DEV_ACCESS_ENABLED=false
SESSION_COOKIE_NAME=smb_session
CORS_ORIGIN=https://smb.aonmou.ru
DATABASE_URL=...
```

Test frontend env:

```bash
cd ~/domains/test.smb.aonmou.ru/app
cp .env.test.example .env.test
```

Test `.env.test`:

```text
VITE_SMB_APP_ENV=test
VITE_SMB_REMOTE_API_URL=https://test.smb.aonmou.ru
```

Test backend env:

```bash
cp server/.env.test.example server/.env
```

Test `server/.env` должен содержать test БД:

```text
SMB_APP_ENV=test
DEV_ACCESS_ENABLED=true
SESSION_COOKIE_NAME=smb_test_session
CORS_ORIGIN=https://test.smb.aonmou.ru
DATABASE_URL=...
```

Секреты, пароли, service account JSON и реальные значения `.env` не коммитить.

## Один deploy для двух сред

Запускать из production checkout после того, как в репозитории уже есть
`scripts/deploy-jino-dual-env.sh`:

```bash
cd ~/domains/smb.aonmou.ru/app
git pull --ff-only origin main
SMB_DEPLOY_BRANCH=main npm run deploy:jino:dual
```

Скрипт делает для `test` и `production`:

- проверяет нужные `.env.test` / `.env.production` и `server/.env`;
- подтягивает одну и ту же ветку;
- устанавливает зависимости через `npm ci`;
- запускает typecheck;
- применяет миграции с env конкретной среды;
- собирает backend;
- собирает frontend в нужном Vite mode;
- проверяет наличие `dist/.htaccess` с HTTP → HTTPS redirect и security headers;
- копирует `dist`, включая tracked `.htaccess`, в `public_html`;
- обновляет `app.js` и трогает `tmp/restart.txt`.

Опционально:

```bash
SMB_RUN_TESTS=true SMB_DEPLOY_BRANCH=main npm run deploy:jino:dual
SMB_SKIP_NPM_CI=true SMB_DEPLOY_BRANCH=main npm run deploy:jino:dual
SMB_SKIP_CHECKS=true SMB_DEPLOY_BRANCH=main npm run deploy:jino:dual
```

Не использовать `SMB_SKIP_CHECKS=true` для обычного production deploy.

## Ручная проверка отдельных frontend-сборок

В test checkout:

```bash
npm run build:web:test
```

В production checkout:

```bash
npm run build:web:production
```

Vite сам прочитает `.env.test` или `.env.production` по mode.

## Принудительный HTTPS

Оба домена должны обслуживать приложение только через HTTPS. Файл
`public/.htaccess` попадает в `dist/.htaccess` при Vite-сборке и затем
публикуется deploy-скриптом в `public_html`. Правило учитывает Jino proxy header
`X-Forwarded-Protocol`, поэтому не должно зацикливать HTTPS-запросы.

Как дополнительную защиту в панели Jino для каждого домена отдельно включить:
`Домены` → настройки домена → `SSL-сертификат` → `Всегда использовать только HTTPS`.

Не добавлять `http://smb.aonmou.ru` в `CORS_ORIGIN` и не убирать `Secure` у
production-cookie. HTTP-origin должен перенаправляться до загрузки frontend,
а не получать доступ к production API.

## Smoke после deploy

```bash
for host in test.smb.aonmou.ru smb.aonmou.ru; do
  curl -sS -o /dev/null -w "$host /: %{http_code} %{redirect_url}\n" \
    "http://$host/"
  curl -sS -o /dev/null -w "$host /health: %{http_code} %{redirect_url}\n" \
    "http://$host/health"
  curl -sS -o /dev/null -w "$host /api/access/profile: %{http_code} %{redirect_url}\n" \
    "http://$host/api/access/profile"
  curl -fsS -D - "https://$host/health" -o /dev/null | \
    grep -Ei '^(HTTP/|strict-transport-security:|x-content-type-options:|referrer-policy:|x-frame-options:|permissions-policy:)'
done
```

Ожидаемое поведение:

- HTTP `/`, `/health` и `/api/access/profile` возвращают `301` на тот же host/path через HTTPS;
- HTTPS `/health` возвращает `200`, HSTS и остальные базовые security headers;
- `https://test.smb.aonmou.ru` показывает тестовый выбор роли.
- `https://smb.aonmou.ru` требует login/password.
- Production `/api/dev/access-session` возвращает отказ и не создаёт dev-сессию.

## Первый production пользователь

После production-миграций создать нового пользователя через env, не выводя пароль в логи:

```bash
cd ~/domains/smb.aonmou.ru/app

SMB_AUTH_LOGIN=admin \
SMB_AUTH_PASSWORD='replace-with-secret' \
SMB_AUTH_DISPLAY_NAME='Администратор' \
SMB_AUTH_ACCOUNT_TYPE=admin \
npm --workspace server run auth:create-user
```

Каждый запуск создаёт отдельный login identity/access. Повторный логин
отклоняется и не меняет существующую роль или пароль; для смены пароля
использовать отдельное действие сброса в админском интерфейсе/API.

Для `business_owner`, `dispatcher` и `worker` scope ID необязательны. Например,
диспетчера можно создать без ручного задания business/department ID:

```bash
SMB_AUTH_LOGIN=dispatcher \
SMB_AUTH_PASSWORD='replace-with-secret' \
SMB_AUTH_DISPLAY_NAME='Диспетчер' \
SMB_AUTH_ACCOUNT_TYPE=dispatcher \
npm --workspace server run auth:create-user
```

Без scope-переменных backend автоматически назначает владельцу и диспетчеру
общий business scope, диспетчеру — стандартное подразделение, а работнику
создаёт отдельный department ID. `SMB_AUTH_BUSINESS_ACCOUNT_ID` и
`SMB_AUTH_DEPARTMENT_ID` остаются необязательными явными overrides;
`SMB_AUTH_BUSINESS_DISPLAY_NAME` и `SMB_AUTH_DEPARTMENT_DISPLAY_NAME` также
необязательны.
