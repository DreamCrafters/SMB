# Локальный запуск SMB Monitor

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
VITE_SMB_REMOTE_API_URL=http://127.0.0.1:3000
```

Проверить backend env:

```bash
cat server/.env
```

Для локального Docker там должно быть:

```text
PORT=3000
DATABASE_URL=mysql://smb_monitor:smb_monitor_dev_password@127.0.0.1:3306/smb_monitor
CORS_ORIGIN=http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5174,http://localhost:5174
RUN_MIGRATIONS_ON_START=true
```

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

## Остановка

Backend и frontend остановить через `Ctrl+C` в их терминалах.

MariaDB можно оставить запущенной или остановить:

```bash
docker compose stop mariadb
```
