# Env-файлы для деплоя на Jino

Для каждого окружения (`test`, `production`) на сервере нужно вручную создать
**два** файла в **двух разных** папках — деплой-скрипт (`scripts/deploy-jino-dual-env.sh`)
проверяет их наличие и падает, если чего-то нет.

| Окружение  | Файл-справочник в репо | Куда положить на сервере |
|---|---|---|
| test | `deploy/test.env` (блок 1) | `~/domains/test.smb.aonmou.ru/app/.env.test` |
| test | `deploy/test.env` (блок 2) | `~/domains/test.smb.aonmou.ru/app/server/.env` |
| production | `deploy/production.env` (блок 1) | `~/domains/smb.aonmou.ru/app/.env.production` |
| production | `deploy/production.env` (блок 2) | `~/domains/smb.aonmou.ru/app/server/.env` |

Ключевая ловушка: серверный файл (`server/.env`) на самой ноде называется
**просто `.env`**, без суффикса `.test`/`.production` — суффикс есть только
у фронтенд-файла в корне `app/`. Различаются они только тем, в какой из
двух папок (`test.smb.aonmou.ru/app` или `smb.aonmou.ru/app`) лежат.

Перед первым деплоем прод-окружения проверьте в панели Jino реальное имя
базы данных и права пользователя `j53403317_smb` — placeholder `prod_database`
в примерах, скорее всего, не совпадает с реальным именем (ровно так уже
случилось с тестовой базой `test_database`).

Эти файлы дублируют содержимое `.env.test.example` / `.env.production.example`
и `server/.env.test.example` / `server/.env.production.example` из корня
проекта — здесь они просто сведены по одному на окружение для удобства.

## Google Sheets: настройка service_account (test и production)

Оба окружения используют `GOOGLE_SHEETS_AUTH=service_account` (таблица не
расшарена по публичной ссылке, поэтому `public_csv` возвращает 401). Это
единственная часть, которую нужно сделать руками в Google Cloud Console —
дальше пошагово:

1. **Google Cloud Console** → создать проект (или использовать существующий,
   если сервис-аккаунт `smb-sheets-reader@smb-monitor-sheets.iam.gserviceaccount.com`
   уже создавался ранее — проверьте в IAM & Admin → Service Accounts).
2. Включить **Google Sheets API** для проекта (APIs & Services → Library →
   Google Sheets API → Enable).
3. Создать сервис-аккаунт: IAM & Admin → Service Accounts → Create Service
   Account. Роль проекту не нужна (доступ к таблице выдаётся отдельно, через
   Share в самой таблице, а не через IAM-роли).
4. Создать ключ: у созданного сервис-аккаунта → Keys → Add Key → Create new
   key → JSON. Скачается файл вида `<project>-xxxxx.json`.
5. Открыть саму Google-таблицу → кнопка "Доступ" (Share) → добавить email
   сервис-аккаунта (`...@...iam.gserviceaccount.com`, он указан в поле
   `client_email` внутри скачанного JSON) с ролью **Читатель (Viewer)**.
6. Загрузить скачанный JSON-файл на сервер по обоим путям (можно один и тот
   же файл — это одна таблица с разными вкладками/gid):
   - `~/domains/test.smb.aonmou.ru/private/google-service-account.json`
   - `~/domains/smb.aonmou.ru/private/google-service-account.json`

   Папка `private/` должна быть **вне** веб-корня (`app/`), чтобы ключ не
   раздавался как статический файл.
7. Проверить права доступа к файлу на сервере (`chmod 600`) и что путь
   совпадает с `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` в соответствующем `server/.env`.

После этого перезапустить бэкенд-процесс на сервере — конфиг читается один
раз при старте.
