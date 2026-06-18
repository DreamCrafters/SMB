# Настройка сервера на другом ПК

Эта инструкция описывает сценарий, где frontend открывается на одном компьютере, а backend API и PostgreSQL работают на другом компьютере в той же локальной сети.

## Схема

```text
ПК с браузером и frontend
  -> http://SERVER_LAN_IP:3000
  -> backend из server/
  -> PostgreSQL в Docker volume smb_monitor_postgres_data
```

Frontend не подключается к PostgreSQL напрямую. Он отправляет запросы только в backend API, а backend уже валидирует данные и пишет их в БД.

## Что понадобится на серверном ПК

На компьютере, где будет работать backend:

- Node.js 20 или новее;
- npm;
- Git;
- Docker или Docker Desktop;
- доступ к этой машине по локальной сети;
- открытый входящий TCP-порт `3000` для backend API.

PostgreSQL-порт `5432` не нужно открывать наружу для других компьютеров. БД должна быть доступна backend-серверу локально.

## 1. Получить код проекта на серверном ПК

Если проект уже в Git:

```bash
git clone <repo-url> SMB
cd SMB
```

Если репозиторий пока не опубликован, перенеси папку проекта на серверный ПК без `node_modules`, `dist`, `.env` и приватных файлов.

Установи зависимости:

```bash
npm install
```

## 2. Настроить backend env

На серверном ПК создай backend env:

```bash
cp server/.env.example server/.env
```

Открой `server/.env` и проверь значения:

```text
PORT=3000
DATABASE_URL=postgresql://smb_monitor:smb_monitor_dev_password@127.0.0.1:5432/smb_monitor
CORS_ORIGIN=http://FRONTEND_PC_IP:5173,http://127.0.0.1:5173,http://localhost:5173
RUN_MIGRATIONS_ON_START=true
```

`FRONTEND_PC_IP` — IP компьютера, на котором ты открываешь frontend в браузере. Например:

```text
CORS_ORIGIN=http://192.168.1.25:5173,http://127.0.0.1:5173,http://localhost:5173
```

Если frontend будет открыт не по IP, а по домену, добавь этот origin:

```text
CORS_ORIGIN=https://app.example.com,http://192.168.1.25:5173
```

Не коммить реальные `.env` файлы.

## 3. Запустить PostgreSQL на серверном ПК

Из корня проекта:

```bash
docker compose up -d postgres
```

Проверить состояние:

```bash
docker compose ps
```

Данные PostgreSQL хранятся в Docker volume:

```text
smb_monitor_postgres_data
```

Перезапуск контейнера или компьютера данные не удаляет. Данные будут удалены, если выполнить команду с удалением volume:

```bash
docker compose down -v
```

Эту команду нельзя выполнять, если нужно сохранить БД.

## 4. Запустить backend на серверном ПК

Для разработки:

```bash
npm run dev:api
```

Для более стабильного запуска без watch-режима:

```bash
npm --workspace server run build
npm --workspace server start
```

Если в `server/.env` стоит:

```text
RUN_MIGRATIONS_ON_START=true
```

сервер применит миграции при старте. Миграции также можно запустить вручную:

```bash
npm run db:migrate
```

## 5. Узнать IP серверного ПК

На macOS или Linux:

```bash
ifconfig
```

или:

```bash
ip addr
```

На Windows:

```powershell
ipconfig
```

Нужен локальный IPv4-адрес вида:

```text
192.168.1.40
```

Дальше в инструкции он называется `SERVER_LAN_IP`.

## 6. Проверить backend на серверном ПК

На серверном ПК:

```bash
curl -i http://127.0.0.1:3000/health
```

Ожидаемый ответ:

```json
{"ok":true}
```

## 7. Проверить backend с frontend-ПК

На компьютере, где будет открываться сайт:

```bash
curl -i http://SERVER_LAN_IP:3000/health
```

Пример:

```bash
curl -i http://192.168.1.40:3000/health
```

Если ответ не приходит:

- проверь, что backend запущен;
- проверь IP серверного ПК;
- открой входящий TCP-порт `3000` в firewall серверного ПК;
- убедись, что оба компьютера находятся в одной сети;
- проверь, не блокирует ли роутер обращения между устройствами.

## 8. Настроить frontend на основном ПК

На компьютере, где запускается frontend, создай `.env`:

```bash
cp .env.example .env
```

В `.env` укажи адрес backend на другом ПК:

```text
VITE_SMB_REMOTE_API_URL=http://SERVER_LAN_IP:3000
```

Пример:

```text
VITE_SMB_REMOTE_API_URL=http://192.168.1.40:3000
```

После изменения `.env` перезапусти Vite:

```bash
npm run dev:web -- --host 127.0.0.1
```

Открой:

```text
http://127.0.0.1:5173/
```

## 9. Проверить сценарий через UI

1. На серверном ПК запущены PostgreSQL и backend.
2. На frontend-ПК в `.env` указан `VITE_SMB_REMOTE_API_URL=http://SERVER_LAN_IP:3000`.
3. Frontend запущен заново после изменения `.env`.
4. В браузере выбери профиль `Диспетчер`.
5. Заполни диспетчерскую форму и отправь.
6. Если сервер недоступен, интерфейс должен показать ошибку подключения.
7. Если отправка успешна, выбери профиль `Владелец бизнеса`.
8. Открой вкладку `Диспетчерская`.
9. Отправленная запись должна прийти из backend/БД.

## 10. Проверить API вручную

С frontend-ПК можно отправить тестовый запрос:

```bash
curl -i \
  -H "Content-Type: application/json" \
  -H "X-SMB-Account-Id: dev-dispatcher-account" \
  -d '{
    "businessAccountId": "dev-business-boundary",
    "period": "2026-06",
    "metricCode": "dispatcher.metric",
    "rawValue": "42",
    "comment": "remote pc check"
  }' \
  http://SERVER_LAN_IP:3000/api/dispatcher/submissions
```

Проверить историю:

```bash
curl -i http://SERVER_LAN_IP:3000/api/dispatcher/submissions
```

## 11. Firewall и безопасность

Для локальной сети достаточно открыть только backend API:

```text
TCP 3000
```

PostgreSQL-порт `5432` не нужно открывать для сети. В текущем `docker-compose.yml` порт PostgreSQL опубликован как `5432:5432`, поэтому на серверном ПК обязательно ограничь доступ firewall-ом или, если нужен только локальный доступ backend к БД, измени публикацию порта на:

```yaml
ports:
  - "127.0.0.1:5432:5432"
```

Не открывай backend в интернет без дополнительных production-мер:

- HTTPS;
- домен;
- reverse proxy;
- production auth/session;
- серверные проверки capabilities;
- секреты вне репозитория;
- резервные копии БД;
- мониторинг и логирование без приватных payload.

Текущий backend ещё не production-ready: временный `submittedByAccountId` берётся из заголовка `X-SMB-Account-Id` или dev-default, а полноценная серверная авторизация и server-side capability checks ещё должны быть реализованы.

## 12. Если сервер будет не в локальной сети

Если backend находится на VPS или удалённом ПК через интернет:

1. Подними backend и PostgreSQL на сервере.
2. Закрой прямой доступ к PostgreSQL.
3. Настрой reverse proxy, например Nginx или Caddy.
4. Выпусти HTTPS-сертификат.
5. Укажи в frontend:

```text
VITE_SMB_REMOTE_API_URL=https://api.example.com
```

6. Добавь frontend origin в `server/.env`:

```text
CORS_ORIGIN=https://app.example.com
```

До реализации production auth такой режим подходит только для закрытого тестового стенда, а не для реального продакшена.

## 13. Частые проблемы

### `curl http://127.0.0.1:3000/health` работает на серверном ПК, но не работает с другого ПК

Причина обычно в firewall, неверном IP или сетевой изоляции устройств. Открой TCP `3000` и проверь, что оба устройства в одной сети.

### UI пишет, что сервер не подключён

Проверь:

- есть ли `.env` на frontend-ПК;
- указан ли `VITE_SMB_REMOTE_API_URL=http://SERVER_LAN_IP:3000`;
- перезапущен ли Vite после изменения `.env`;
- доступен ли `GET /health` с frontend-ПК.

### В браузере CORS error

Добавь адрес frontend в `CORS_ORIGIN` в `server/.env` и перезапусти backend.

Пример:

```text
CORS_ORIGIN=http://192.168.1.25:5173,http://127.0.0.1:5173
```

### Backend не подключается к БД

Проверь:

- запущен ли контейнер PostgreSQL;
- совпадает ли `DATABASE_URL` с настройками `docker-compose.yml`;
- не занят ли порт `5432`;
- применились ли миграции.

Команды:

```bash
docker compose ps
npm run db:migrate
```

### Данные пропали после перезапуска

Обычный перезапуск не удаляет данные. Проверь, не выполнялась ли команда:

```bash
docker compose down -v
```

Она удаляет Docker volume с БД.

## 14. Минимальный чеклист запуска

На серверном ПК:

```bash
npm install
cp server/.env.example server/.env
docker compose up -d postgres
npm run dev:api
curl -i http://127.0.0.1:3000/health
```

На frontend-ПК:

```bash
cp .env.example .env
```

В `.env`:

```text
VITE_SMB_REMOTE_API_URL=http://SERVER_LAN_IP:3000
```

Проверка:

```bash
curl -i http://SERVER_LAN_IP:3000/health
npm run dev:web -- --host 127.0.0.1
```
