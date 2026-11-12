# Jino deploy: одна ветка, test и production

## Топология

- `smb.aonmou.ru` — production: `VITE_SMB_APP_ENV=production`, `SMB_APP_ENV=production`, отдельная production MariaDB/MySQL.
- `test.smb.aonmou.ru` — test/staging: `VITE_SMB_APP_ENV=test`, `SMB_APP_ENV=test`, отдельная test MariaDB/MySQL или текущая тестовая БД.
- Оба домена могут деплоиться из одной ветки, по умолчанию `main`.
- Frontend собирается два раза из одного кода: `npm run build:web:test` и `npm run build:web:production`.
- Backend runtime должен быть раздельным для каждого домена, потому что у test и production разные `server/.env`, `DATABASE_URL`, cookie и CORS.
- Production не должен включать `DEV_ACCESS_ENABLED=true`; `/api/dev/access-session` в production отключён.

## Каталоги на Jino

Production:

```text
~/domains/smb.aonmou.ru/app
~/domains/smb.aonmou.ru/public_html
~/domains/smb.aonmou.ru/app.js
```

Test:

```text
~/domains/test.smb.aonmou.ru/app
~/domains/test.smb.aonmou.ru/public_html
~/domains/test.smb.aonmou.ru/app.js
```

Оба каталога `app` — checkout одного и того же репозитория и одной ветки.
Разница хранится только в непубличных env-файлах.

## Первый setup env

Production frontend env:

```bash
cd ~/domains/smb.aonmou.ru/app
cp .env.production.example .env.production
```

Production `.env.production`:

```text
VITE_SMB_APP_ENV=production
VITE_SMB_REMOTE_API_URL=https://smb.aonmou.ru
```

Production backend env:

```bash
cp server/.env.production.example server/.env
```

Production `server/.env` должен содержать реальные секреты и production БД:

```text
SMB_APP_ENV=production
DEV_ACCESS_ENABLED=false
SESSION_COOKIE_NAME=smb_session
CORS_ORIGIN=https://smb.aonmou.ru
DATABASE_URL=...
```

Test frontend env:

```bash
cd ~/domains/test.smb.aonmou.ru/app
cp .env.test.example .env.test
```

Test `.env.test`:

```text
VITE_SMB_APP_ENV=test
VITE_SMB_REMOTE_API_URL=https://test.smb.aonmou.ru
```

Test backend env:

```bash
cp server/.env.test.example server/.env
```

Test `server/.env` должен содержать test БД:

```text
SMB_APP_ENV=test
DEV_ACCESS_ENABLED=true
SESSION_COOKIE_NAME=smb_test_session
CORS_ORIGIN=https://test.smb.aonmou.ru
DATABASE_URL=...
PRODUCTION_SNAPSHOT_ENABLED=true
PRODUCTION_DATABASE_URL=...
PRODUCTION_SNAPSHOT_TARGET_DATABASE=...
```

`PRODUCTION_DATABASE_URL` в test runtime должен использовать отдельного
production-пользователя только для чтения. `PRODUCTION_SNAPSHOT_TARGET_DATABASE`
должен дословно совпадать с именем test-БД из `DATABASE_URL`; production и test
должны иметь разные имена. Эти три значения обязательны для test-deploy
preflight, но включать функцию в production runtime запрещено.

Администратор test-сайта запускает замену во вкладке `БД` только после ввода
точной фразы подтверждения. Backend проверяет test-окружение, capability,
совпадение миграций и структуры, InnoDB и отсутствие триггеров. Общий advisory
lock дожидается уже начатых записей, после чего backend одной транзакцией
заменяет строки всех test-таблиц production-снимком и оставляет `auth_sessions`
пустой. Ошибка откатывает всю замену; production БД используется только как
источник чтения.

Секреты, пароли, service account JSON и реальные значения `.env` не коммитить.

## Один deploy для двух сред

Запускать из production checkout после того, как в репозитории уже есть
`scripts/deploy-jino-dual-env.sh`:

```bash
cd ~/domains/smb.aonmou.ru/app
git pull --ff-only origin main
SMB_DEPLOY_BRANCH=main npm run deploy:jino:dual
```

Скрипт делает для `test` и `production`:

- проверяет нужные `.env.test` / `.env.production` и `server/.env`;
- подтягивает одну и ту же ветку;
- устанавливает зависимости через `npm ci`;
- запускает typecheck;
- применяет миграции с env конкретной среды;
- загружает ведомость учёта вагонов (`wagons:import -- --apply`); уже
  загруженная ведомость пропускается;
- собирает backend;
- собирает frontend в нужном Vite mode;
- проверяет наличие `dist/.htaccess` с HTTP → HTTPS redirect и security headers;
- копирует `dist`, включая tracked `.htaccess`, в `public_html`;
- обновляет `app.js` и трогает `tmp/restart.txt`.

Опционально:

```bash
SMB_RUN_TESTS=true SMB_DEPLOY_BRANCH=main npm run deploy:jino:dual
SMB_SKIP_NPM_CI=true SMB_DEPLOY_BRANCH=main npm run deploy:jino:dual
SMB_SKIP_CHECKS=true SMB_DEPLOY_BRANCH=main npm run deploy:jino:dual
```

Не использовать `SMB_SKIP_CHECKS=true` для обычного production deploy.
При `SMB_RUN_TESTS=true` deploy использует `npm run test:jino`: frontend- и
backend-тесты выполняются последовательно с `--test-concurrency=1`, потому что
параллельный Node test runner превышает лимит процессов/потоков managed Jino.
JSDOM-сценарии с одинаковым env переиспользуют один Vite SSR-сервер внутри
test-файла и закрывают его в `test.after`: многократное создание серверов в одном
процессе накапливает нативную память и может завершиться серверным `SIGKILL`.
Обычный локальный `npm test` остаётся параллельным.

В `dual` полный набор тестов выполняется один раз для общего commit при штатном
`npm ci`. Результат хранится только в памяти текущего deploy-процесса; отдельный
запуск test или production всегда проверяет код заново. При
`SMB_SKIP_NPM_CI=true` набор выполняется в каждой среде, поскольку зависимости
могут различаться. Грязный checkout отклоняется; изменение commit между средами
останавливает вторую публикацию (первая к этому моменту может быть обновлена).
Тесты получают базовые `VITE_SMB_APP_ENV=test` и
`VITE_SMB_REMOTE_API_URL=http://127.0.0.1:5173`; сценарии production задают свой env
в тесте. Это не меняет env сборок и работающих приложений.

Backend, собранный успешным `test:jino`, повторно не компилируется в том же
checkout. В другой среде backend собирается отдельно. Typecheck, проверка env,
миграции, frontend-сборка и публикация остаются отдельными для каждой среды.
После деплоя по-прежнему проверять оба сайта и `/health`.

Для текущего deploy-потока из ветки `Dev` отдельные среды можно запускать
вручную теми же командами, которые повторяет extension:

```bash
cd ~/domains/smb.aonmou.ru/app
SMB_DEPLOY_BRANCH=Dev SMB_DEPLOY_TARGET=production npm run deploy:jino:dual

cd ~/domains/smb.aonmou.ru/app
SMB_DEPLOY_BRANCH=Dev SMB_DEPLOY_TARGET=test npm run deploy:jino:dual
```

## Запуск из Codex одним действием

Локальный personal plugin `smb-jino-deploy` запускает тот же tracked
`scripts/deploy-jino-dual-env.sh` по SSH и не дублирует deploy-логику проекта.
На карточке плагина действие `Deploy NMOU Vector to Jino test and production`
запускает test и production из текущей локальной ветки SMB, с тестами,
миграциями, сборками, перезапуском и публичными smoke-проверками.

До SSH-подключения плагин проверяет, что HEAD выбранной локальной ветки
совпадает с `origin/<текущая-ветка>`, а точный commit содержит deploy-скрипт.
Незакоммиченные и untracked локальные файлы не блокируют запуск и не попадают
на сервер: deploy всегда использует commit из `origin`. На сервере до первой
мутации проверяются оба checkout и оба набора env. Это позволяет безопасно
пользоваться плагином из `Dev`, пока deploy-контур ещё не слит в `main`.

Плагин не хранит пароль, приватный SSH-ключ или содержимое серверных `.env`.
Для запуска без вопросов должен быть один раз настроен вход по SSH-ключу для:

```text
j53403317@584e7697571.hosting.myjino.ru
```

Если нужен только read-only preflight, на карточке плагина выбрать действие
`Check whether Jino is ready for an SMB dual deploy`. Ручные команды с
`SMB_DEPLOY_BRANCH=Dev` и явным `SMB_DEPLOY_TARGET=test|production` остаются
основным fallback и источником истины для серверного deploy-процесса.

Обычная неинтерактивная SSH-сессия Jino не добавляет `npm` в `PATH`, хотя во
встроенной консоли те же команды работают. Поэтому extension перед preflight и
deploy активирует совместимый системный runtime Jino из `/opt/alt` (сейчас
Node 22) и выводит версии Node/npm. Preflight проверяет runtime до обновления
checkout, миграций и сборок.

## Кнопка деплоя в нижней панели VS Code

Локальный extension `SMB Jino Deploy` показывает справа в status bar выбранную
ветку и независимое состояние двух сред, например:

```text
SMB Dev · T:✓ P:↑
```

- `T` — test, `P` — production;
- `✓` — опубликован последний commit выбранной ветки из `origin`;
- `↑` — на сайте находится другая или более старая версия;
- `?` — новый marker ещё не появился после первого marker-backed deploy;
- `!` — Git- или SSH-проверка сейчас недоступна.

Обычные состояния, включая ошибку SSH, не окрашивают status bar: причина
остаётся в tooltip. Если Jino отклоняет публичный ключ, вместо общей ошибки
показывается `Нужен SSH-ключ`. В меню выберите `Настроить SSH-ключ`: extension
проверит локальный публичный ключ и скопирует безопасную идемпотентную команду
для встроенной консоли Jino. Перед её запуском в выбранном контейнере нужно
подключить услугу `Поддержка SSH`, затем в `Управление → SSH-подключение`
задать SSH-пароль и разрешить текущий IP. Затем откройте
кнопкой `Открыть хостинг Jino` отдельную панель
`https://cp-hosting.jino.ru/`, выберите нужный хостинг-контейнер, перейдите в
`Управление → Консоль`, вставьте скопированную команду и после выполнения
обновите статусы из того же меню. Общий адрес `https://cp.jino.ru/` для этого
действия не использовать: он открывает корень старой панели. Команда добавляет
ключ в `~/.ssh/authorized_keys` без удаления существующих записей и выставляет права
`0700` для `.ssh` и `0600` для `authorized_keys`. На этом managed hosting
`ssh-copy-id` может закрыть соединение после запроса пароля, поэтому он не
используется как основной setup-путь. Актуальные требования Jino описаны в
[официальной инструкции удалённого доступа](https://jino.ru/spravka/hosting/remote-access.html).

Если SSH-диагностика подтверждает `Server accepts key`, но Jino сразу закрывает
соединение, ключ уже установлен правильно. Extension показывает `Настройте SSH`
и пункт `Настроить SSH в Jino`; повторно запускать `ssh-copy-id` или вставлять
ключ в консоль не нужно. Остаётся проверить услугу `Поддержка SSH`, заново
задать SSH-пароль и обновить разрешённый IP в
`Управление → SSH-подключение`.

Нажатие на status bar открывает выбор: deploy только в test, только в
production, в обе среды, смена Git-ветки, обычное и принудительное обновление
статусов и журнал. Меню сразу показывает сохранённый результат, параллельно
запускает свежую проверку и перерисовывает открытые пункты после её завершения,
не оставляя устаревшую пометку `обновляется…`. По умолчанию выбрана `Dev`; выбор
сохраняется для workspace. Extension вызывает тот же
`scripts/deploy_smb_jino.sh`, поэтому HEAD выбранной локальной ветки должен уже
совпадать с `origin/<ветка>`. Незакоммиченные и untracked файлы проверку не
блокируют, но никогда не копируются на сервер.

После запуска остаётся одно стандартное уведомление VS Code с progress bar.
Он продвигается по фактически завершённым этапам SSH, preflight, тестов,
миграций, сборки, публикации и публичных smoke-проверок; это не расчёт скорости
или переданных байтов. Output-журнал `SMB Jino Deploy` продолжает заполняться,
но не открывается автоматически и доступен отдельным пунктом меню.

После успешной публикации `scripts/deploy-jino-dual-env.sh` атомарно записывает
в корне каждой среды `.smb-deploy-state` с `branch`, `commit` и UTC-временем.
Marker создаётся после копирования frontend и restart backend, поэтому status
bar не принимает один только обновлённый HEAD серверного checkout за успешную
публикацию сайта.

Исходники extension находятся в `/Users/artemiz/plugins/smb-jino-deploy`,
установленная копия — в каталоге VS Code extensions. После обновления локальной
копии выполнить `Developer: Reload Window`.

## Ручная проверка отдельных frontend-сборок

В test checkout:

```bash
npm run build:web:test
```

В production checkout:

```bash
npm run build:web:production
```

Vite сам прочитает `.env.test` или `.env.production` по mode.

## Принудительный HTTPS

Оба домена должны обслуживать приложение только через HTTPS. Файл
`public/.htaccess` попадает в `dist/.htaccess` при Vite-сборке и затем
публикуется deploy-скриптом в `public_html`. Правило учитывает Jino proxy header
`X-Forwarded-Protocol`, поэтому не должно зацикливать HTTPS-запросы.

Как дополнительную защиту в панели Jino для каждого домена отдельно включить:
`Домены` → настройки домена → `SSL-сертификат` → `Всегда использовать только HTTPS`.

Не добавлять `http://smb.aonmou.ru` в `CORS_ORIGIN` и не убирать `Secure` у
production-cookie. HTTP-origin должен перенаправляться до загрузки frontend,
а не получать доступ к production API.

## Smoke после deploy

```bash
for host in test.smb.aonmou.ru smb.aonmou.ru; do
  curl -sS -o /dev/null -w "$host /: %{http_code} %{redirect_url}\n" \
    "http://$host/"
  curl -sS -o /dev/null -w "$host /health: %{http_code} %{redirect_url}\n" \
    "http://$host/health"
  curl -sS -o /dev/null -w "$host /api/access/profile: %{http_code} %{redirect_url}\n" \
    "http://$host/api/access/profile"
  curl -fsS -D - "https://$host/health" -o /dev/null | \
    grep -Ei '^(HTTP/|strict-transport-security:|x-content-type-options:|referrer-policy:|x-frame-options:|permissions-policy:)'
done
```

Ожидаемое поведение:

- HTTP `/`, `/health` и `/api/access/profile` возвращают `301` на тот же host/path через HTTPS;
- HTTPS `/health` возвращает `200`, HSTS и остальные базовые security headers;
- `https://test.smb.aonmou.ru` показывает тестовый выбор роли.
- `https://smb.aonmou.ru` требует login/password.
- Production `/api/dev/access-session` возвращает отказ и не создаёт dev-сессию.

## Первый production пользователь

После production-миграций создать нового пользователя через env, не выводя пароль в логи:

```bash
cd ~/domains/smb.aonmou.ru/app

SMB_AUTH_LOGIN=admin \
SMB_AUTH_PASSWORD='replace-with-secret' \
SMB_AUTH_DISPLAY_NAME='Администратор' \
SMB_AUTH_ACCOUNT_TYPE=admin \
npm --workspace server run auth:create-user
```

Каждый запуск создаёт отдельный login identity/access. Повторный логин
отклоняется и не меняет существующую роль или пароль; для смены пароля
использовать отдельное действие сброса в админском интерфейсе/API.

Для `business_owner`, `dispatcher` и `worker` scope ID необязательны. Например,
диспетчера можно создать без ручного задания business ID:

```bash
SMB_AUTH_LOGIN=dispatcher \
SMB_AUTH_PASSWORD='replace-with-secret' \
SMB_AUTH_DISPLAY_NAME='Диспетчер' \
SMB_AUTH_ACCOUNT_TYPE=dispatcher \
npm --workspace server run auth:create-user
```

Backend автоматически назначает всем неадминистративным аккаунтам общий
organization scope; дополнительные scope ID и переменные бизнеса не используются.

## Экземпляр другой организации: «Вектор Деметра» (задачи 147–148)

Каждая организация — отдельный сайт со своей БД из того же кода. Для Деметры:
`https://demetra.aonmou.ru`, каталоги `~/domains/demetra.aonmou.ru/{app,public_html,app.js}`,
режим `production`, название продукта «Вектор Деметра». Шаги данных НМОУ (ведомость
вагонов) при выкатке Деметры не выполняются. Разделы ограничиваются только настройкой
должностей: в Деметре пока выдаются лишь вкладки поручений.

### 1. Панель Jino (вручную)

1. `Домены` — добавить поддомен `demetra.aonmou.ru` в тот же хостинг-контейнер.
2. Настройки домена → `SSL-сертификат` — выпустить сертификат и включить
   `Всегда использовать только HTTPS`.
3. Node.js-приложение домена — так же, как у `smb.aonmou.ru` (та же версия Node,
   точка входа `app.js` в корне домена).
4. `Базы данных` — новая БД MySQL/MariaDB и отдельный пользователь с полными правами
   только на неё. Имя БД и пароль понадобятся в `server/.env`.

### 2. Checkout и env на сервере (консоль Jino)

```bash
cd ~/domains/demetra.aonmou.ru
git clone "$(git -C ~/domains/smb.aonmou.ru/app remote get-url origin)" app
cd app && git checkout Dev
```

`~/domains/demetra.aonmou.ru/app/.env.production`:

```text
VITE_SMB_APP_ENV=production
VITE_SMB_REMOTE_API_URL=https://demetra.aonmou.ru
VITE_SMB_PRODUCT_NAME=Вектор Деметра
```

`~/domains/demetra.aonmou.ru/app/server/.env` (права `600`; секреты НМОУ сюда не
копировать):

```text
SMB_APP_ENV=production
DEV_ACCESS_ENABLED=false
PORT=<как в server/.env smb.aonmou.ru>
RUN_MIGRATIONS_ON_START=<как в server/.env smb.aonmou.ru>
SESSION_COOKIE_NAME=smb_demetra_session
CORS_ORIGIN=https://demetra.aonmou.ru
DATABASE_URL=<новая БД Деметры в том же формате, что у smb.aonmou.ru>
EMAIL_NOTIFICATIONS_ENABLED=false
MAX_NOTIFICATIONS_ENABLED=false
EMAIL_SUBJECT_PREFIX=Вектор Деметра
MAX_SUBJECT_PREFIX=Вектор Деметра
GOOGLE_SHEETS_REFERENCE_ENABLED=false
```

`GOOGLE_SHEETS_REFERENCE_ENABLED=false` обязателен: без него сервер читает лист
справочников НМОУ (адрес по умолчанию). Приёмник 1С (`ONEC_UPLOAD_API_KEY`) и
рассылки НМОУ не подключаются; каналы Email/MAX включаются отдельно, когда Деметра
попросит уведомления.

### 3. Выкатка, очистка данных НМОУ, корневой аккаунт

```bash
cd ~/domains/demetra.aonmou.ru/app
SMB_DEPLOY_BRANCH=Dev SMB_DEPLOY_TARGET=demetra npm run deploy:jino:dual

# Ранние миграции вносят данные НМОУ: 11 поручений СД протокола №369 с документом,
# 119 марок, 69 позиций сырья и 130 событий журнала об их импорте. Сначала показать,
# затем удалить — сразу после первой выкатки, до создания любых аккаунтов (команда
# отказывает, если в БД есть кто-то кроме корневого админа).
npm --workspace server run instance:clear-nmou-seed
npm --workspace server run instance:clear-nmou-seed -- --apply

SMB_AUTH_BOOTSTRAP_ROOT=true \
SMB_AUTH_LOGIN=admin \
SMB_AUTH_PASSWORD='<секрет>' \
SMB_AUTH_DISPLAY_NAME='Администратор' \
SMB_AUTH_ACCOUNT_TYPE=admin \
npm --workspace server run auth:create-user
```

Последующие выкатки Деметры — той же командой с `SMB_DEPLOY_TARGET=demetra`;
`dual` по-прежнему выкатывает только test и production НМОУ. Справочники РЖД и
Коллегии в БД остаются: это общие справочники, без данных НМОУ.

### 4. Настройка под корневым аккаунтом на сайте

`Учётные записи → Должности`:

- «Председатель совета директоров»: `Поручения` (получение: ГД, Коллегия),
  `Поручения Совета директоров` — «Создание, приёмка и возврат на доработку»,
  `Настройки`; остальные вкладки снять.
- «Член совета директоров»: `Поручения` (ГД, Коллегия), `Поручения Совета директоров` —
  «Просмотр и создание поручений», `Поручения Коллегии`, `Поручения генерального
  директора` — «Только просмотр», `Настройки`.
- «Генеральный директор»: `Поручения` (СД — исполнение назначенных, Коллегия),
  `Поручения генерального директора` — «Постановка, приёмка и закрытие поручений»,
  `Настройки`.
- Новая «Член Совета директоров (Глушков)» — особый доступ, как в НМОУ: `Поручения`
  (все три реестра), СД — «Создание, приёмка и возврат на доработку», ГД —
  «Постановка, приёмка и закрытие поручений», `Поручения Коллегии`, `Действия
  пользователей`, `Настройки`; в группе «Права администратора» — `Учётные записи`.

Необязательно: неиспользуемые системные должности НМОУ («Лаборант», «Диспетчер»,
«Экономист», «Работник», «Владелец бизнеса») можно удалить кнопкой «Удалить» —
она доступна, пока у должности нет аккаунтов.

`Вкладки`: перетащить `Поручения` выше `Настроек` — первая доступная вкладка
открывается при входе. В новой БД сохранённый порядок старше пункта `Поручения`,
и сервер дописывает его в конец.

`Учётные записи → Новая учётная запись`: сотрудники Деметры из листа `Доступы`
(логины оттуда), каждому его должность; Глушкову — «Член Совета директоров (Глушков)».
Затем отправить им ссылку `https://demetra.aonmou.ru`.

### Проверка

Smoke как для production (раздел выше) для `demetra.aonmou.ru`; вход показывает
«Вход в Вектор Деметра»; у сотрудников в меню только `Поручения` и `Настройки`
(у Глушкова ещё `Действия пользователей` и `Учётные записи`), при входе открываются
`Поручения мне`, поручений НМОУ нет.
