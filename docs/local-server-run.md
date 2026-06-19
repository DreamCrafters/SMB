# Быстрый запуск локального сервера

Этот файл только про запуск уже настроенного локального режима.

## Требование

На macOS для команды `docker compose` нужен установленный и запущенный Docker Desktop.

Проверка:

```bash
docker --version
docker compose version
docker info
```

Если терминал отвечает `zsh: command not found: docker`, установить Docker Desktop, запустить `/Applications/Docker.app`, дождаться запуска Docker и открыть новый терминал.

Если `docker info` или `docker compose up` отвечает `failed to connect to the docker API` или `docker.sock: no such file or directory`, Docker CLI уже установлен, но Docker Desktop ещё не запущен. Запустить его и дождаться статуса running:

```bash
open -a Docker
docker info
```

## 0. Перейти в папку проекта

Все команды ниже выполнять из корня проекта, где лежит `docker-compose.yml`.

```bash
cd /Users/artemiz/WebProjects/SMB
```

## 1. Запустить PostgreSQL

```bash
docker compose up -d postgres
```

## 2. Запустить backend

В отдельном терминале:

```bash
npm run dev:api
```

Проверка:

```bash
curl -i http://127.0.0.1:3000/health
```

## 3. Запустить frontend

В ещё одном терминале:

```bash
npm run dev:web -- --host 127.0.0.1
```

Открыть:

```text
http://127.0.0.1:5173/
```

## Остановка

Backend и frontend остановить через `Ctrl+C` в их терминалах.

PostgreSQL можно оставить запущенным. Если нужно остановить контейнер без удаления данных:

```bash
docker compose stop postgres
```

Не использовать `docker compose down -v`, если нужно сохранить данные.
