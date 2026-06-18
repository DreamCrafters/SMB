# Быстрый запуск локального сервера

Этот файл только про запуск уже настроенного локального режима.

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
