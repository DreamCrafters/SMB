# Google Sheets как источник справочников

Сейчас backend читает Google Sheets для полей диспетчерской формы:

- форма: `Открытие инцидента`
- поле: `Место (цех/участок)`, колонка в таблице: `Места (цех/участок)`
- поле: `Ответственный за регистрацию`, колонка в таблице: `Ответственный за регистрацию`
- email-адресаты уведомлений, колонка в таблице: `Адресаты по инцидентам и оборуджованию (емейлы)`
- MAX ID адресатов уведомлений, колонка в таблице: `Чаты пользователей`

Текущая ссылка по умолчанию:

```text
https://docs.google.com/spreadsheets/d/1JYz_03AW4j9VXNfdNSBFfdFyxq0Dun_0QnYGvVesGyg/edit?gid=981703922#gid=981703922
```

Backend умеет читать Google Sheets двумя способами:

- `public_csv` — обычная Google Sheets ссылка превращается в CSV-export ссылку; таблица должна быть публично читаемой.
- `service_account` — таблица остаётся закрытой, а backend читает её через Google Sheets API от имени service account.

## Требования к структуре таблицы

1. В нужном листе должны быть колонки с заголовками `Места (цех/участок)` и `Ответственный за регистрацию`.
2. Значения должны идти под каждым заголовком до первой пустой строки.
3. Если в одном листе несколько таблиц, backend ищет все колонки с таким заголовком и объединяет найденные значения без дублей.
4. Двоеточие в конце заголовка допустимо: `Ответственный за регистрацию:` и `Ответственный за регистрацию` считаются одним заголовком.

## Требования к адресатам уведомлений

В этом же листе может быть колонка `Адресаты по инцидентам и оборуджованию (емейлы)` для email и колонка `Чаты пользователей` для MAX. Для MAX также поддерживается заголовок `ТОКЕН МАКС и Чаты пользователей`, если в таблице он используется как объединённое название. Старые варианты `Адресаты по инцидентам и оборуджованию (MAX ID)` и `Адресаты по инцидентам и оборудованию (MAX ID)` тоже остаются совместимыми.

Backend читает адреса из фиксированных строк листа:

- строки `2–20` — общие адресаты для открытия инцидента, закрытия инцидента и отчёта по оборудованию;
- строки `22–25` — дополнительные адресаты, если отчёт по оборудованию или инцидент относится к механической части;
- строки `27–30` — дополнительные адресаты, если отчёт по оборудованию или инцидент относится к электрической части.

Если причина простоя, тип инцидента или текст закрытия содержит и `мех`, и `эл`, уведомление уйдёт обеим специализированным группам. Дубли email-адресов и MAX ID удаляются перед отправкой.

## Закрытая таблица через service account

Этот режим нужен для production: таблица остаётся `Restricted`, но доступ получает конкретный серверный робот.

1. В Google Cloud должен быть создан service account.
2. В Google Sheets таблице нужно нажать `Share` и выдать этому service account права `Viewer`.
3. JSON-ключ service account должен лежать на Jino вне `public_html`:

```text
~/domains/smb.aonmou.ru/app/secrets/google-service-account.json
```

4. Права на Jino:

```bash
chmod 700 ~/domains/smb.aonmou.ru/app/secrets
chmod 600 ~/domains/smb.aonmou.ru/app/secrets/google-service-account.json
```

5. В `server/.env` включить service account:

```text
GOOGLE_SHEETS_AUTH=service_account
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=/home/users/j/j53403317/domains/smb.aonmou.ru/app/secrets/google-service-account.json
GOOGLE_SHEETS_REFERENCE_URL=https://docs.google.com/spreadsheets/d/1JYz_03AW4j9VXNfdNSBFfdFyxq0Dun_0QnYGvVesGyg/edit?gid=981703922#gid=981703922
GOOGLE_SHEETS_RESPONSIBLE_COLUMN=Ответственный за регистрацию
GOOGLE_SHEETS_INCIDENT_LOCATION_COLUMN=Места (цех/участок)
GOOGLE_SHEETS_NOTIFICATION_EMAILS_COLUMN=Адресаты по инцидентам и оборуджованию (емейлы),Адресаты по инцидентам и оборудованию (емейлы)
GOOGLE_SHEETS_MAX_USER_IDS_COLUMN=Чаты пользователей,ТОКЕН МАКС и Чаты пользователей,Адресаты по инцидентам и оборуджованию (MAX ID),Адресаты по инцидентам и оборудованию (MAX ID)
GOOGLE_SHEETS_CACHE_TTL_MS=0
```

`GOOGLE_SHEETS_CACHE_TTL_MS=0` отключает backend-кеш: при каждом обновлении страницы frontend заново запрашивает `/api/dispatcher/forms`, а backend заново читает Google Sheets.

6. Перезапустить Node-приложение:

```bash
cd ~/domains/smb.aonmou.ru
mkdir -p tmp
touch tmp/restart.txt
```

## Публичная таблица через CSV

Этот режим проще, но таблица должна открываться без входа в Google.

В `server/.env`:

```text
GOOGLE_SHEETS_AUTH=public_csv
GOOGLE_SHEETS_REFERENCE_URL=https://docs.google.com/spreadsheets/d/1JYz_03AW4j9VXNfdNSBFfdFyxq0Dun_0QnYGvVesGyg/edit?gid=981703922#gid=981703922
GOOGLE_SHEETS_RESPONSIBLE_COLUMN=Ответственный за регистрацию
GOOGLE_SHEETS_INCIDENT_LOCATION_COLUMN=Места (цех/участок)
GOOGLE_SHEETS_NOTIFICATION_EMAILS_COLUMN=Адресаты по инцидентам и оборуджованию (емейлы),Адресаты по инцидентам и оборудованию (емейлы)
GOOGLE_SHEETS_MAX_USER_IDS_COLUMN=Чаты пользователей,ТОКЕН МАКС и Чаты пользователей,Адресаты по инцидентам и оборуджованию (MAX ID),Адресаты по инцидентам и оборудованию (MAX ID)
GOOGLE_SHEETS_CACHE_TTL_MS=0
```

Если список на сайте не появляется в `public_csv`, сначала проверь доступ: CSV-export ссылка должна открываться в инкогнито без Google login.

## Как поменять таблицу или лист

1. Открой нужную Google Sheets таблицу.
2. Перейди на нужный лист внутри таблицы.
3. Скопируй URL из браузера. В нём важны:
   - id таблицы после `/d/`
   - `gid` нужного листа
4. На сервере открой env backend:

```bash
cd ~/domains/smb.aonmou.ru/app
vi server/.env
```

5. Замени `GOOGLE_SHEETS_REFERENCE_URL`:

```text
GOOGLE_SHEETS_REFERENCE_URL=https://docs.google.com/spreadsheets/d/НОВЫЙ_ID/edit?gid=НОВЫЙ_GID#gid=НОВЫЙ_GID
```

6. Если меняется только лист внутри той же таблицы, меняется только `gid`.
7. Перезапусти Node-приложение:

```bash
cd ~/domains/smb.aonmou.ru
mkdir -p tmp
touch tmp/restart.txt
```

## Как проверить

После перезапуска:

```bash
curl -i https://smb.aonmou.ru/api/dispatcher/forms
```

В ответе у полей `location` и `responsible` формы `incident` должен быть `select`:

```json
{
  "name": "location",
  "type": "select",
  "options": ["..."]
}
```

```json
{
  "name": "responsible",
  "type": "select",
  "options": ["..."]
}
```

Если `type` остался `text`, backend не смог прочитать Google Sheets или не нашёл нужную колонку.

## Включение email-рассылки

Чтение адресатов из Google Sheets не отправляет письма само по себе. Для реальной отправки нужно добавить SMTP-настройки в `server/.env`:

```text
EMAIL_NOTIFICATIONS_ENABLED=true
EMAIL_FROM=адрес_отправителя
EMAIL_SUBJECT_PREFIX=SMB Monitor
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=логин_smtp
SMTP_PASS=пароль_smtp
```

Если SMTP-сервер работает на порту `465`, обычно нужно поставить `SMTP_SECURE=true`. Если почтовый сервер разрешает отправку без логина и пароля, `SMTP_USER` и `SMTP_PASS` можно оставить пустыми.

Рассылка выполняется только после успешного сохранения формы в БД. Если SMTP временно недоступен, форма остаётся сохранённой, а ошибка записывается в лог backend как `dispatcher_notifications.email_send_failed`.

## Включение MAX-рассылки

Чтение MAX ID из Google Sheets не отправляет сообщения само по себе. Для отправки через бота нужно добавить в `server/.env`:

```text
MAX_NOTIFICATIONS_ENABLED=true
MAX_BOT_TOKEN=токен_бота_MAX
MAX_API_BASE_URL=https://platform-api2.max.ru
MAX_RECIPIENT_ID_TYPE=user_id
MAX_SUBJECT_PREFIX=SMB Monitor
MAX_CA_CERT_FILE=
```

Токен бота не коммитить в git и не класть в frontend env. Он нужен только backend-у.

`MAX_RECIPIENT_ID_TYPE=user_id` означает, что числа из колонки `Чаты пользователей` будут отправлены в MAX как `user_id`. Если в этой колонке лежат именно ID чатов, поставь:

```text
MAX_RECIPIENT_ID_TYPE=chat_id
```

Если `chat_id` в MAX показан с минусом, например `-123456789`, в таблице нужно оставить его с минусом. Backend читает такие значения как единый ID.

Если на Jino при тесте MAX появляется ошибка `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, значит Node.js не доверяет цепочке сертификатов `platform-api2.max.ru`. Для MAX не нужно отключать TLS глобально. Нужно положить сертификат Минцифры в закрытую папку проекта и указать путь:

```bash
cd ~/domains/smb.aonmou.ru/app
mkdir -p secrets
curl -L https://gu-st.ru/content/Other/doc/russiantrustedca.pem \
  -o secrets/russiantrustedca.pem
chmod 700 secrets
chmod 600 secrets/russiantrustedca.pem
```

После этого добавь в `server/.env`:

```text
MAX_CA_CERT_FILE=/home/users/j/j53403317/domains/smb.aonmou.ru/app/secrets/russiantrustedca.pem
```

Файл должен лежать вне `public_html` и не должен попадать в git. Не используй `NODE_TLS_REJECT_UNAUTHORIZED=0`: это отключает проверку сертификатов для всего Node-процесса.

MAX ID берутся из той же таблицы, что и email-адресаты:

- строки `2–20` — общие адресаты для открытия инцидента, закрытия инцидента и отчёта по оборудованию;
- строки `22–25` — дополнительные адресаты для механической части;
- строки `27–30` — дополнительные адресаты для электрической части.

Рассылка выполняется только после успешного сохранения формы в БД. Если MAX временно недоступен или токен неверный, форма остаётся сохранённой, а ошибка записывается в лог backend как `dispatcher_notifications.max_send_failed`. Если подходящая форма сохранена, но в Google Sheets не найдено ни одного MAX ID, backend пишет `dispatcher_notifications.max_no_recipients`.

## Что происходит со старыми данными

Справочник влияет только на новые варианты выбора в форме. Уже отправленные регистрации хранят выбранное текстовое значение в payload отправки, поэтому удаление человека или места из Google Sheets не удаляет это значение из старой аналитики и истории.

Для будущих столбцов нужно использовать тот же подход: новые формы получают актуальные варианты из Google Sheets, а отправленные записи продолжают хранить выбранное значение отдельно от текущего справочника.
