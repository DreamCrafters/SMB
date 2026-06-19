# SMB Monitor

Платформа мониторинга ключевых показателей бизнеса, ролей, подтверждения данных, аналитики и интеграций.

Проект очищен от визуального тестового прототипа. Актуальная последовательность реализации хранится в `implementation_plan.md`.

Карта данных, типов аккаунтов и серверных границ хранится в `docs/data-architecture.md`.
Канонический визуальный стиль проекта хранится в `docs/visual-style.md`.
Инструкция по серверной части хранится в `docs/server-setup.md`.
Короткая инструкция запуска локального сервера хранится в `docs/local-server-run.md`.
Инструкция по настройке backend на другом ПК хранится в `docs/remote-server-pc-setup.md`.

## Стек

- Vite
- React
- TypeScript
- CSS
- Node.js backend
- PostgreSQL

## Локальный запуск

```bash
npm install
```

Запусти PostgreSQL:

```bash
docker compose up -d postgres
```

Запусти backend:

```bash
npm run dev:api
```

Запусти frontend во втором терминале:

```bash
npm run dev:web -- --host 127.0.0.1
```

Открой:

```text
http://127.0.0.1:5173/
```

## Как сейчас работает сервер

Сейчас в проекте есть два серверных слоя:

- Vite dev/preview middleware в `vite.config.ts` — локальная временная dev-авторизация и `access/profile`;
- backend workspace `server/` — remote API для временной dev-авторизации, `access/profile` и диспетчерских отправок с сохранением в PostgreSQL.

Vite middleware обрабатывает:

- `GET /api/access/profile` — возвращает текущий серверный профиль доступа или пустой профиль;
- `POST /api/dev/access-session` — временно выбирает тип аккаунта для dev-режима;
- `DELETE /api/dev/access-session` — очищает выбранный dev-доступ.

Backend `server/` обрабатывает:

- `GET /health` — проверка API;
- `GET /api/access/profile` — возвращает текущий dev-профиль доступа или пустой профиль;
- `POST /api/dev/access-session` — временно выбирает тип аккаунта для dev-режима;
- `DELETE /api/dev/access-session` — очищает выбранный dev-доступ;
- `POST /api/dispatcher/submissions` — сохранение диспетчерской отправки в БД;
- `GET /api/dispatcher/submissions` — история отправок для вкладки владельца `Диспетчерская`.

Если `VITE_SMB_REMOTE_API_URL` задан, frontend отправляет access/dev и dispatcher-запросы в этот backend API. Временная dev-сессия хранится в памяти процесса Vite или backend и сбрасывается после его рестарта. Диспетчерские отправки хранятся в PostgreSQL и переживают рестарт backend/контейнера, пока не удалён Docker volume.

## Подключение удалённого сервера и БД

Frontend не подключается к БД напрямую. Он обращается к backend API, который пишет данные в PostgreSQL и отдаёт разрешённые ответы frontend-клиенту.

Создай локальный frontend `.env` по примеру `.env.example`:

```bash
cp .env.example .env
```

Для локальной разработки там должно быть:

```text
VITE_SMB_REMOTE_API_URL=http://127.0.0.1:3000
```

Создай backend `.env`:

```bash
cp server/.env.example server/.env
```

Подробная инструкция: `docs/server-setup.md`.
Если backend и БД запускаются на другом компьютере, смотри `docs/remote-server-pc-setup.md`.

## Vercel preview

Текущий frontend опубликован на Vercel:

- production domain: `https://smb-umber.vercel.app`;
- deployment preview origin: `https://smb-37kao5m4x-artemi-z-s-projects.vercel.app`.

В `server/.env` backend нужно разрешить эти origins:

```text
CORS_ORIGIN=https://smb-umber.vercel.app,https://smb-37kao5m4x-artemi-z-s-projects.vercel.app
```

Ссылка вида `https://vercel.com/artemi-z-s-projects/...` — это dashboard Vercel, её в `CORS_ORIGIN` не добавлять.

В Vercel для frontend нужно задать `VITE_SMB_REMOTE_API_URL` как HTTPS base URL backend API. Сайт открыт по HTTPS, поэтому браузер не будет надёжно отправлять API-запросы на `http://SERVER_LAN_IP:3000` из Vercel deployment.

## Проверка API

```bash
curl -i http://127.0.0.1:3000/health
```

Отправка:

```bash
curl -i \
  -H "Content-Type: application/json" \
  -d '{
    "businessAccountId": "dev-business-boundary",
    "period": "2026-06",
    "metricCode": "test.metric",
    "rawValue": "42",
    "comment": "manual test"
  }' \
  http://127.0.0.1:3000/api/dispatcher/submissions
```

История:

```bash
curl -i http://127.0.0.1:3000/api/dispatcher/submissions
```

Формат ответа сохранения:

```json
{
  "submission": {
    "id": "server-id",
    "businessAccountId": "business-id",
    "period": "2026-06",
    "metricCode": "metric-code",
    "rawValue": "42",
    "comment": "optional",
    "status": "received",
    "submittedByAccountId": "account-id",
    "submittedAt": "2026-06-18T00:00:00.000Z",
    "receivedAt": "2026-06-18T00:00:01.000Z"
  }
}
```

Формат ответа истории:

```json
{
  "submissions": [],
  "receivedAt": "2026-06-18T00:00:00.000Z"
}
```

## Проверки

```bash
npm test
npm run typecheck
npm run build
```
