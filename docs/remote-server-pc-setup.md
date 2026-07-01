# Удалённый backend на Windows-ПК или VPS

Короткая инструкция для сценария: frontend открыт в браузере, backend API работает на другом Windows-ПК или VPS, MariaDB/MySQL живёт рядом с backend в Docker или доступна как внешняя managed DB.

```text
frontend -> http://SERVER_LAN_IP:3000 -> backend server/ -> MariaDB/MySQL
```

Открывать наружу нужно только backend API `3000`. MariaDB `3306` не открывать: в `docker-compose.yml` она привязана к `127.0.0.1:3306`.

## Что нужно

- Windows-ПК или VPS, который будет сервером.
- Node.js 20+.
- Git.
- Docker Desktop или Docker Engine.
- Стабильный IP серверного ПК в локальной сети или публичный IP VPS.
- Доступ сервера к Git-репозиторию проекта.

Дальше замени:

- `SERVER_LAN_IP` на IP серверного ПК или VPS, например `192.168.0.103`;
- `FRONTEND_ORIGIN` на origin сайта из браузера, например `http://192.168.0.25:5173`;
- `<repo-url>` на URL репозитория.

## 1. Подготовить доступ к Git

Если репозиторий публичный:

```powershell
git clone <repo-url> C:\SMB
cd C:\SMB
git config pull.ff only
```

Если репозиторий приватный, лучше использовать read-only deploy key. На сервере:

```powershell
ssh-keygen -t ed25519 -C "smb-monitor-server"
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub
```

Владелец сервера присылает тебе только публичный `.pub` ключ. Ты добавляешь его в GitHub/GitLab как read-only deploy key, после этого владелец сервера клонирует:

```powershell
git clone git@github.com:OWNER/REPO.git C:\SMB
cd C:\SMB
git config pull.ff only
```

Не передавать приватный ключ и не коммитить токены.

## 2. Настроить backend env

На сервере:

```powershell
cd C:\SMB
Copy-Item server\.env.example server\.env
notepad server\.env
```

Минимальное содержимое `server\.env`:

```text
PORT=3000
DATABASE_URL=mysql://smb_monitor:smb_monitor_dev_password@127.0.0.1:3306/smb_monitor
CORS_ORIGIN=FRONTEND_ORIGIN,http://127.0.0.1:5173,http://localhost:5173
RUN_MIGRATIONS_ON_START=true
```

Для внешней MariaDB/MySQL вместо локального Docker-контейнера укажи:

```text
DATABASE_URL=mysql://DB_USER:DB_PASSWORD@DB_HOST:3306/DB_NAME
```

Если в пароле есть спецсимволы вроде `@`, `/`, `:` или `#`, их нужно URL-encoded записать в `DATABASE_URL`.

Если frontend на Vercel, используй:

```text
CORS_ORIGIN=https://smb-umber.vercel.app,https://smb-*-artemi-z-s-projects.vercel.app
```

Если нужен и Vercel, и локальный Vite, перечисли все origins через запятую. В `CORS_ORIGIN` добавляется именно browser origin сайта, не dashboard URL Vercel.

## 3. Установить зависимости и поднять БД

На сервере:

```powershell
cd C:\SMB
npm install
docker compose up -d mariadb
docker compose ps
npm run db:migrate
npm --workspace server run build
```

Если используется внешняя MariaDB/MySQL из хостинга, строка `docker compose up -d mariadb` не нужна: backend подключится к БД из `DATABASE_URL`.

Данные MariaDB хранятся в Docker volume `smb_monitor_mariadb_data`.

Не выполнять при обычных обновлениях:

```powershell
docker compose down -v
```

Эта команда удалит БД.

## 4. Проверить backend вручную

На сервере:

```powershell
npm --workspace server start
```

В другом окне PowerShell на сервере:

```powershell
curl.exe -i http://127.0.0.1:3000/health
curl.exe -i http://127.0.0.1:3000/api/access/profile
curl.exe -i http://127.0.0.1:3000/api/dispatcher/forms
```

Ожидаемый health:

```json
{"ok":true}
```

С другого ПК в той же сети:

```bash
curl -i http://SERVER_LAN_IP:3000/health
```

Если с сервера работает, а с другого ПК нет, открой firewall из шага 6.

## 5. Сделать backend постоянным

Останови ручной `npm --workspace server start` через `Ctrl+C`.

Зарегистрируй Windows Task Scheduler:

```powershell
cd C:\SMB
powershell -ExecutionPolicy Bypass -File .\scripts\register-windows-startup-task.ps1
Start-ScheduledTask -TaskName "SMB Monitor Remote Server"
Start-Sleep -Seconds 5
curl.exe -i http://127.0.0.1:3000/health
```

Задача запускает `scripts\start-remote-server.ps1`: ждёт Docker, поднимает MariaDB, собирает backend и стартует API. Лог:

```powershell
Get-Content .\logs\remote-api.log -Tail 80
```

Команды управления:

```powershell
Stop-ScheduledTask -TaskName "SMB Monitor Remote Server"
Start-ScheduledTask -TaskName "SMB Monitor Remote Server"
Get-ScheduledTask -TaskName "SMB Monitor Remote Server"
Unregister-ScheduledTask -TaskName "SMB Monitor Remote Server" -Confirm:$false
```

## 6. Открыть firewall

PowerShell от имени администратора:

```powershell
New-NetFirewallRule -DisplayName "SMB Monitor API 3000" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000
```

Открывать только `3000`. MariaDB/MySQL `3306` не открывать, если не принято отдельное решение про внешний DB-доступ.

Проверка с другого ПК:

```bash
curl -i http://SERVER_LAN_IP:3000/health
```

## 7. Настроить frontend

На ПК, где запускается frontend:

```bash
cd /path/to/SMB
cp .env.example .env
```

В `.env`:

```text
VITE_SMB_REMOTE_API_URL=http://SERVER_LAN_IP:3000
```

Для backend на другом ПК нельзя оставлять `http://127.0.0.1:3000`: браузер будет искать API на frontend-ПК.

Перезапусти frontend:

```bash
npm run dev:web -- --host 127.0.0.1
```

Если frontend должен открываться с других устройств:

```bash
npm run dev:web -- --host 0.0.0.0
```

Если frontend задеплоен на Vercel, `VITE_SMB_REMOTE_API_URL` должен быть HTTPS URL backend, например:

```text
VITE_SMB_REMOTE_API_URL=https://api.example.com
```

Сайт на `https://smb-umber.vercel.app` не должен ходить в `http://SERVER_LAN_IP:3000`: для браузера это небезопасный mixed content.

## 8. Проверить через UI

1. На сервере работает Task Scheduler задача `SMB Monitor Remote Server`.
2. С frontend-ПК открывается `http://SERVER_LAN_IP:3000/health`.
3. В frontend `.env` указан `VITE_SMB_REMOTE_API_URL=http://SERVER_LAN_IP:3000`.
4. Frontend перезапущен после изменения `.env`.
5. В UI выбери `Диспетчер`, отправь любую диспетчерскую форму.
6. Перейди в `Владелец бизнеса` -> `Диспетчерская`.
7. Запись должна прийти из backend/БД.

## 9. Как обновлять сервер через Git

Если сервер не твой, одного `git push` недостаточно: на сервере кто-то должен запустить команды обновления. Без SSH/RDP это делает владелец сервера или заранее настроенная автоматизация.

Перед тем как просить владельца обновить сервер, у себя:

```bash
npm test
npm run typecheck
npm run build
git status
git add <changed-files>
git commit -m "Update backend"
git push origin main
```

Владелец сервера после твоего push запускает:

```powershell
cd C:\SMB
Stop-ScheduledTask -TaskName "SMB Monitor Remote Server" -ErrorAction SilentlyContinue
git fetch --prune
git pull --ff-only
npm install
docker compose up -d mariadb
npm run db:migrate
npm --workspace server run build
Start-ScheduledTask -TaskName "SMB Monitor Remote Server"
Start-Sleep -Seconds 5
curl.exe -i http://127.0.0.1:3000/health
```

Если backend использует внешнюю MariaDB/MySQL, строку `docker compose up -d mariadb` при обновлении тоже пропусти.

С другого ПК:

```bash
curl -i http://SERVER_LAN_IP:3000/health
curl -i http://SERVER_LAN_IP:3000/api/access/profile
```

Если менялись `server/.env.example`, `CORS_ORIGIN`, порт, домен или `DATABASE_URL`, отдельно напиши владельцу, что именно вручную поменять в `server\.env`. Реальные `.env` через Git не обновляются.

Авто-pull по расписанию можно настраивать только на закрытом тестовом стенде. Для реального production сначала нужны production auth, нормальный deploy pipeline, rollback и проверка миграций.

## 10. Если backend не в локальной сети

Для VPS или удалённого сервера через интернет:

1. Подними backend и MariaDB как выше или укажи внешний MariaDB/MySQL `DATABASE_URL`.
2. Не открывай MariaDB/MySQL наружу без IP allowlist/firewall.
3. Настрой HTTPS reverse proxy на backend `127.0.0.1:3000`, например Nginx или Caddy.
4. Во frontend укажи:

```text
VITE_SMB_REMOTE_API_URL=https://api.example.com
```

5. В `server\.env` добавь frontend origin:

```text
CORS_ORIGIN=https://smb-umber.vercel.app,https://smb-*-artemi-z-s-projects.vercel.app
```

До production auth это только закрытый тестовый стенд.

## 11. Быстрая диагностика

Проверить backend на сервере:

```powershell
curl.exe -i http://127.0.0.1:3000/health
Get-Content .\logs\remote-api.log -Tail 80
docker compose ps
```

Проверить firewall/IP с другого ПК:

```bash
curl -i http://SERVER_LAN_IP:3000/health
```

Если CORS error в браузере:

1. Скопируй origin сайта из адресной строки.
2. Добавь его в `CORS_ORIGIN` в `server\.env`.
3. Перезапусти backend:

```powershell
Stop-ScheduledTask -TaskName "SMB Monitor Remote Server"
Start-ScheduledTask -TaskName "SMB Monitor Remote Server"
```

Если порт `3000` занят:

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen | Select-Object -ExpandProperty OwningProcess -Unique
```

Завершать процесс через `Stop-Process -Id <PID> -Force` только если владелец сервера уверен, что это старый SMB Monitor API.

Если данные пропали, проверить, не запускали ли:

```powershell
docker compose down -v
```

Эта команда удаляет Docker volume `smb_monitor_mariadb_data`.
