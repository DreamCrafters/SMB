# Постоянный удалённый сервер на ПК

Эта инструкция описывает сценарий, где этот или другой Windows-ПК работает как постоянный backend-сервер SMB Monitor: frontend открывается в браузере, а backend API и PostgreSQL живут на серверном ПК в локальной сети.

## Схема

```text
ПК с браузером и frontend
  -> http://SERVER_LAN_IP:3000
  -> backend из server/ для access/profile, dev access и dispatcher submissions
  -> PostgreSQL в Docker volume smb_monitor_postgres_data
```

Frontend не подключается к PostgreSQL напрямую. Он отправляет запросы только в backend API, а backend валидирует данные и пишет их в БД.

## Что понадобится на серверном ПК

- Node.js 20 или новее;
- npm;
- Git;
- Docker Desktop или Docker Engine;
- стабильный локальный IP для серверного ПК;
- открытый входящий TCP-порт `3000` для backend API;
- автозапуск Docker Desktop после входа в Windows, если используется Docker Desktop.

PostgreSQL-порт `5432` не нужно открывать наружу для других компьютеров. В текущем `docker-compose.yml` PostgreSQL опубликован только на `127.0.0.1:5432`, поэтому БД доступна backend-серверу локально и не является сетевой точкой входа.

## 1. Закрепить IP серверного ПК

Для постоянного сервера IP не должен случайно меняться. Предпочтительный вариант — сделать DHCP reservation в роутере для Ethernet/Wi-Fi MAC-адреса серверного ПК.

Узнать текущий IPv4 на Windows:

```powershell
ipconfig
```

Нужен адрес вида:

```text
192.168.0.103
```

Дальше в инструкции он называется `SERVER_LAN_IP`.

## 2. Получить код проекта на серверном ПК

Если проект уже в Git:

```bash
git clone <repo-url> SMB
cd SMB
```

Если репозиторий пока не опубликован, перенеси папку проекта на серверный ПК без `node_modules`, `dist`, `.env` и приватных файлов.

Установить зависимости:

```bash
npm install
```

## 3. Настроить env для серверного ПК

Frontend env:

```bash
cp .env.example .env
```

В `.env` укажи backend на серверном ПК:

```text
VITE_SMB_REMOTE_API_URL=http://SERVER_LAN_IP:3000
```

Если браузер открывает сайт с другого ПК, не оставляй здесь `127.0.0.1` или `localhost`: для браузера это текущий ПК с сайтом, а не backend-сервер.

Backend env:

```bash
cp server/.env.example server/.env
```

В `server/.env`:

```text
PORT=3000
DATABASE_URL=postgresql://smb_monitor:smb_monitor_dev_password@127.0.0.1:5432/smb_monitor
CORS_ORIGIN=http://127.0.0.1:5173,http://localhost:5173,http://SERVER_LAN_IP:5173
RUN_MIGRATIONS_ON_START=true
```

Если frontend запускается на другом ПК, добавь origin того ПК:

```text
CORS_ORIGIN=http://FRONTEND_PC_IP:5173,http://127.0.0.1:5173,http://localhost:5173,http://SERVER_LAN_IP:5173
```

В `CORS_ORIGIN` должен попасть точный origin из адресной строки браузера: схема, IP или домен и порт. Например, если сайт открыт как `http://192.168.0.25:5173/`, в backend env нужно добавить `http://192.168.0.25:5173` и перезапустить API.

Backend разрешает dev-заголовок `X-SMB-Dev-Session`, который нужен удалённому frontend для временного выбора роли. Отдельно добавлять его в env не нужно.

Если frontend будет открыт по домену, добавь домен:

```text
CORS_ORIGIN=https://app.example.com,http://SERVER_LAN_IP:5173
```

Для текущего Vercel frontend используй origins сайта:

```text
CORS_ORIGIN=https://smb-umber.vercel.app,https://smb-*-artemi-z-s-projects.vercel.app
```

Если нужно оставить локальный Vite и Vercel одновременно:

```text
CORS_ORIGIN=http://127.0.0.1:5173,http://localhost:5173,https://smb-umber.vercel.app,https://smb-*-artemi-z-s-projects.vercel.app
```

Backend понимает `*` только внутри hostname, например `https://smb-*-artemi-z-s-projects.vercel.app`, и отдаёт конкретный origin запроса, если он совпал с паттерном. Это покрывает новые Vercel preview deployments с меняющейся частью домена.

Ссылка `https://vercel.com/artemi-z-s-projects/...` открывает dashboard Vercel. Её не добавлять в `CORS_ORIGIN`, потому что браузер открывает сайт с `https://smb-umber.vercel.app` или preview hostname.

Не коммить реальные `.env` файлы.

## 4. Запустить PostgreSQL

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

Контейнер имеет `restart: unless-stopped`, поэтому Docker будет поднимать его снова после перезапуска Docker/ПК, пока контейнер не остановлен вручную.

Обычный перезапуск данные не удаляет:

```bash
docker compose restart postgres
```

Данные будут удалены только командой с удалением volume:

```bash
docker compose down -v
```

Эту команду нельзя выполнять, если нужно сохранить БД.

## 5. Проверить backend вручную

Для разового стабильного запуска без watch-режима:

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

На серверном ПК:

```bash
curl -i http://127.0.0.1:3000/health
```

Ожидаемый ответ:

```json
{"ok":true}
```

С другого ПК в той же сети:

```bash
curl -i http://SERVER_LAN_IP:3000/health
```

Проверить, что remote backend отдаёт access/profile:

```bash
curl -i http://SERVER_LAN_IP:3000/api/access/profile
```

До выбора временного dev-доступа ожидается:

```json
{"profile":null}
```

## 6. Сделать запуск постоянным на Windows

В проекте есть скрипт постоянного запуска:

```powershell
.\scripts\start-remote-server.ps1
```

Он:

- ждёт доступности Docker engine;
- запускает PostgreSQL через `docker compose up -d postgres`;
- собирает backend API;
- запускает `npm --workspace server start`;
- пишет лог в `logs/remote-api.log`.

Зарегистрировать задачу Windows Task Scheduler:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\register-windows-startup-task.ps1
```

По умолчанию задача стартует при входе пользователя в Windows (`AtLogOn`). Это лучший режим для Docker Desktop, потому что Docker Desktop обычно запускается в пользовательской сессии.

Если сервер должен стартовать до входа пользователя, можно зарегистрировать `AtStartup`, но это требует подходящей системной установки Docker и обычно административных прав:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\register-windows-startup-task.ps1 -Trigger AtStartup
```

Проверить задачу:

```powershell
Get-ScheduledTask -TaskName "SMB Monitor Remote Server"
```

Запустить задачу вручную:

```powershell
Start-ScheduledTask -TaskName "SMB Monitor Remote Server"
```

Удалить задачу:

```powershell
Unregister-ScheduledTask -TaskName "SMB Monitor Remote Server" -Confirm:$false
```

## 7. Открыть firewall для API

Для локальной сети достаточно открыть только backend API:

```text
TCP 3000
```

PowerShell от имени администратора:

```powershell
New-NetFirewallRule -DisplayName "SMB Monitor API 3000" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000
```

Или через `netsh`:

```powershell
netsh advfirewall firewall add rule name="SMB Monitor API 3000" dir=in action=allow protocol=TCP localport=3000
```

PostgreSQL `5432` не открывать в firewall для локальной сети и интернета.

## 8. Настроить frontend

На ПК, где запускается frontend, в `.env`:

```text
VITE_SMB_REMOTE_API_URL=http://SERVER_LAN_IP:3000
```

Для backend на другом ПК значение `http://127.0.0.1:3000` не подходит: оно заставит браузер искать API на frontend-ПК. Сначала проверь с frontend-ПК:

```bash
curl -i http://SERVER_LAN_IP:3000/health
```

После изменения `.env` перезапусти Vite:

```bash
npm run dev:web -- --host 127.0.0.1
```

Если frontend должен открываться с других устройств, запускай Vite на сетевом интерфейсе:

```bash
npm run dev:web -- --host 0.0.0.0
```

Тогда браузер на другом ПК открывает:

```text
http://SERVER_LAN_IP:5173/
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

## 11. Если сервер будет не в локальной сети

Если backend находится на VPS или удалённом ПК через интернет:

1. Подними backend и PostgreSQL на сервере.
2. Закрой прямой доступ к PostgreSQL.
3. Настрой reverse proxy, например Nginx или Caddy.
4. Выпусти HTTPS-сертификат.
5. Укажи в frontend:

```text
VITE_SMB_REMOTE_API_URL=https://api.example.com
```

Для Vercel deployment `VITE_SMB_REMOTE_API_URL` тоже должен быть HTTPS URL backend API. Значение `http://SERVER_LAN_IP:3000` подходит для локальной сети, но не для сайта, открытого с `https://smb-umber.vercel.app`.

6. Добавь frontend origin в `server/.env`:

```text
CORS_ORIGIN=https://app.example.com
```

Для текущего Vercel frontend:

```text
CORS_ORIGIN=https://smb-umber.vercel.app,https://smb-*-artemi-z-s-projects.vercel.app
```

До реализации production auth такой режим подходит только для закрытого тестового стенда, а не для реального продакшена.

## 12. Частые проблемы

### `curl http://127.0.0.1:3000/health` работает на серверном ПК, но не работает с другого ПК

Причина обычно в firewall, неверном IP или сетевой изоляции устройств. Открой TCP `3000` и проверь, что оба устройства в одной сети.

### UI пишет, что сервер не подключён

Проверь:

- есть ли `.env` на frontend-ПК;
- указан ли `VITE_SMB_REMOTE_API_URL=http://SERVER_LAN_IP:3000`;
- не осталось ли в `.env` значение `http://127.0.0.1:3000`, если backend живёт на другом ПК;
- перезапущен ли Vite после изменения `.env`;
- доступен ли `GET /health` с frontend-ПК.

### UI пишет `The page could not be found` на экране выбора доступа

Это значит, что `/api/access/profile` ушёл не в SMB backend, а в хостинг frontend-страницы. Проверь:

- в `.env` frontend задан `VITE_SMB_REMOTE_API_URL=http://SERVER_LAN_IP:3000`;
- frontend был пересобран или Vite был перезапущен после изменения `.env`;
- `curl -i http://SERVER_LAN_IP:3000/api/access/profile` возвращает JSON, а не страницу 404;
- в `server/.env` `CORS_ORIGIN` содержит точный origin страницы.

### В браузере CORS error

Добавь адрес frontend в `CORS_ORIGIN` в `server/.env` и перезапусти backend.

Пример:

```text
CORS_ORIGIN=http://192.168.0.25:5173,http://127.0.0.1:5173,http://localhost:5173
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

### Задача Windows запускается, но API не отвечает

Проверь лог:

```powershell
Get-Content .\logs\remote-api.log -Tail 80
```

Частые причины:

- не установлен Node.js/npm;
- не установлен или не запущен Docker Desktop;
- не выполнен `npm install`;
- порт `3000` занят другим процессом;
- `server/.env` отсутствует или содержит неверный `DATABASE_URL`.

### PowerShell не видит `node` или `npm`

Проверь, установлен ли Node.js в стандартную папку:

```powershell
Test-Path "C:\Program Files\nodejs\node.exe"
```

Если файл есть, но команды не работают, добавь Node.js в User PATH и открой новое окно PowerShell:

```powershell
[Environment]::SetEnvironmentVariable(
  "Path",
  [Environment]::GetEnvironmentVariable("Path", "User") + ";C:\Program Files\nodejs",
  "User"
)
```

Если `npm` блокируется сообщением про `npm.ps1` и execution policy, можно использовать `npm.cmd`:

```powershell
npm.cmd --version
```

Или разрешить локальные PowerShell-скрипты для текущего пользователя:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

### Данные пропали после перезапуска

Обычный перезапуск не удаляет данные. Проверь, не выполнялась ли команда:

```bash
docker compose down -v
```

Она удаляет Docker volume с БД.

## 13. Минимальный чеклист постоянного server-PC

На серверном ПК:

```bash
npm install
cp server/.env.example server/.env
docker compose up -d postgres
npm --workspace server run build
npm --workspace server start
curl -i http://127.0.0.1:3000/health
```

Для постоянного Windows-запуска:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\register-windows-startup-task.ps1
New-NetFirewallRule -DisplayName "SMB Monitor API 3000" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000
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
