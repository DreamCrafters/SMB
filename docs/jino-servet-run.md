# Jino deploy: test и production

## Среды

- `smb.aonmou.ru` — production, ветка `main` или `Production`, `VITE_SMB_APP_ENV=production`, `SMB_APP_ENV=production`, отдельная production MariaDB/MySQL.
- `test.smb.aonmou.ru` — test/staging, ветка `Dev`, `VITE_SMB_APP_ENV=test`, `SMB_APP_ENV=test`, отдельная test MariaDB/MySQL или текущая тестовая БД.
- Production не должен включать `DEV_ACCESS_ENABLED=true`; `/api/dev/access-session` в production отключён.

## Production deploy

```bash
cd ~/domains/smb.aonmou.ru/app

git pull --ff-only origin main

npm config set registry https://registry.npmmirror.com/
npm config set replace-registry-host always
npm ci --no-audit --no-fund --prefer-online

grep -E 'SMB_APP_ENV|DEV_ACCESS_ENABLED|SESSION_COOKIE_NAME|EMAIL_NOTIFICATIONS_ENABLED|SMTP_HOST|MAX_NOTIFICATIONS_ENABLED|MAX_API_BASE_URL|MAX_RECIPIENT_ID_TYPE|MAX_CA_CERT_FILE|GOOGLE_SHEETS_NOTIFICATION_EMAILS_COLUMN|GOOGLE_SHEETS_MAX_USER_IDS_COLUMN' server/.env

npm --workspace server run db:migrate
npm run build

rm -rf ../public_html/*
cp -R dist/. ../public_html/

printf 'import("./app/server/dist/index.js");\n' > ../app.js
mkdir -p ../tmp
touch ../tmp/restart.txt

curl -i https://smb.aonmou.ru/
curl -i https://smb.aonmou.ru/health
```

Production `server/.env` должен содержать:

```text
SMB_APP_ENV=production
DEV_ACCESS_ENABLED=false
SESSION_COOKIE_NAME=smb_session
CORS_ORIGIN=https://smb.aonmou.ru
DATABASE_URL=...
```

Production frontend `.env` перед сборкой должен содержать:

```text
VITE_SMB_APP_ENV=production
VITE_SMB_REMOTE_API_URL=https://smb.aonmou.ru
```

## Test deploy

```bash
cd ~/domains/test.smb.aonmou.ru/app

git pull --ff-only origin Dev

npm config set registry https://registry.npmmirror.com/
npm config set replace-registry-host always
npm ci --no-audit --no-fund --prefer-online

npm --workspace server run db:migrate
npm run build

rm -rf ../public_html/*
cp -R dist/. ../public_html/

printf 'import("./app/server/dist/index.js");\n' > ../app.js
mkdir -p ../tmp
touch ../tmp/restart.txt

curl -i https://test.smb.aonmou.ru/
curl -i https://test.smb.aonmou.ru/health
```

Test `server/.env` должен содержать:

```text
SMB_APP_ENV=test
DEV_ACCESS_ENABLED=true
SESSION_COOKIE_NAME=smb_test_session
CORS_ORIGIN=https://test.smb.aonmou.ru
DATABASE_URL=...
```

Test frontend `.env` перед сборкой должен содержать:

```text
VITE_SMB_APP_ENV=test
VITE_SMB_REMOTE_API_URL=https://test.smb.aonmou.ru
```

## Первый production пользователь

После миграций создать или обновить пользователя через env, не выводя пароль в логи:

```bash
SMB_AUTH_LOGIN=admin \
SMB_AUTH_PASSWORD='replace-with-secret' \
SMB_AUTH_DISPLAY_NAME='Администратор' \
SMB_AUTH_ACCOUNT_TYPE=admin \
npm --workspace server run auth:create-user
```

Для dispatcher/worker нужен business и department:

```bash
SMB_AUTH_LOGIN=dispatcher \
SMB_AUTH_PASSWORD='replace-with-secret' \
SMB_AUTH_DISPLAY_NAME='Диспетчер' \
SMB_AUTH_ACCOUNT_TYPE=dispatcher \
SMB_AUTH_BUSINESS_ACCOUNT_ID=prod-business \
SMB_AUTH_BUSINESS_DISPLAY_NAME='Основной бизнес' \
SMB_AUTH_DEPARTMENT_ID=dispatch \
SMB_AUTH_DEPARTMENT_DISPLAY_NAME='Диспетчерская' \
npm --workspace server run auth:create-user
```
