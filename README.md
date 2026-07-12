# НМОУ Вектор (Система управления бизнесом)

Платформа мониторинга ключевых показателей бизнеса, ролей, диспетчерских форм и серверного хранения.

Актуальный план реализации: `implementation_plan.md`.

Единственная инструкция в `docs/`: `docs/local-server-run.md`.

## Стек

- Vite
- React
- TypeScript
- CSS
- Node.js backend
- MariaDB/MySQL

## Быстрый локальный запуск

Подробные команды для Docker, backend и frontend лежат в `docs/local-server-run.md`.

Коротко:

```bash
docker compose up -d mariadb
npm run dev:api
npm run dev:web -- --host 127.0.0.1
```

Открыть:

```text
http://127.0.0.1:5173/
```

Проверка API:

```bash
curl -i http://127.0.0.1:3000/health
```

## Проверки

```bash
npm test
npm run typecheck
npm run build
```
