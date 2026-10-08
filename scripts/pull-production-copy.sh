#!/usr/bin/env bash
# Локальная копия данных production для проверки задач (правило AGENTS.md, «Проверки»).
#
# Одно SSH-подключение к Jino: на сервере mysqldump/mariadb-dump читает БД
# production (--single-transaction, только чтение) и сжатым потоком отдаёт
# её сюда. Локально выгрузка заменяет БД из server/.env (Docker MariaDB),
# очищает сессии и применяет миграции текущего checkout.
#
# Использование:
#   npm run db:pull-production [-- --source test] [-- --direct] [-- --keep-dump]
#   --source production|test  чья БД копируется (по умолчанию production)
#   --direct                  подключаться к Jino без прокси 127.0.0.1:10900
#   --keep-dump               оставить сжатую выгрузку (каталог печатается)
#
# Безопасность: в production ничего не пишется; пароли и строки подключения не
# печатаются; локальный server/.env обязан указывать на 127.0.0.1/localhost и не
# включать отправку Email/MAX и фоновые рассылки, иначе скрипт остановится.
set -euo pipefail

SSH_HOST="${SMB_JINO_SSH_HOST:-584e7697571.hosting.myjino.ru}"
PROXY_PORT="${SMB_JINO_PROXY_PORT:-10900}"
SOURCE="production"
DIRECT=0
KEEP_DUMP=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source) SOURCE="${2:-}"; shift 2 ;;
    --direct) DIRECT=1; shift ;;
    --keep-dump) KEEP_DUMP=1; shift ;;
    *) echo "Неизвестный параметр: $1" >&2; exit 2 ;;
  esac
done

case "$SOURCE" in
  production) REMOTE_DOMAIN="smb.aonmou.ru" ;;
  test) REMOTE_DOMAIN="test.smb.aonmou.ru" ;;
  *) echo "--source: production или test" >&2; exit 2 ;;
esac

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_ENV="$ROOT_DIR/server/.env"
die() { echo "Остановлено: $*" >&2; exit 1; }

# --- 1. Локальная среда не должна уметь писать наружу -----------------------
[[ -f "$LOCAL_ENV" ]] || die "нет server/.env — настройте локальный backend по docs/local-server-run.md."

read_env() {
  # Последнее значение ключа из server/.env или из окружения процесса, без кавычек.
  local key="$1" value
  value="$(grep -E "^[[:space:]]*${key}=" "$LOCAL_ENV" | tail -n 1 | sed -E "s/^[^=]*=//; s/^[\"']//; s/[\"'][[:space:]]*$//" || true)"
  if [[ -n "${!key:-}" ]]; then value="${!key}"; fi
  printf '%s' "$value"
}

[[ "$(read_env SMB_APP_ENV)" != "production" ]] || die "SMB_APP_ENV=production в локальном server/.env."
DATABASE_URL_LOCAL="$(read_env DATABASE_URL)"
[[ -n "$DATABASE_URL_LOCAL" ]] || die "в server/.env нет DATABASE_URL."
LOCAL_DB_HOST="$(node -e 'const u = new URL(process.argv[1]); process.stdout.write(u.hostname)' "$DATABASE_URL_LOCAL")"
LOCAL_DB_NAME="$(node -e 'const u = new URL(process.argv[1]); process.stdout.write(decodeURIComponent(u.pathname.slice(1)))' "$DATABASE_URL_LOCAL")"
case "$LOCAL_DB_HOST" in
  127.0.0.1|localhost) ;;
  *) die "DATABASE_URL в server/.env указывает не на локальную БД." ;;
esac
[[ "$LOCAL_DB_NAME" =~ ^[A-Za-z0-9_]+$ ]] || die "имя локальной БД должно состоять из латиницы, цифр и _."

for key in SMTP_HOST SMTP_PASS MAX_BOT_TOKEN; do
  [[ -z "$(read_env "$key")" ]] || die "$key задан в server/.env: копия с настоящими адресатами может отправить письма или сообщения MAX. Уберите ключ для локальной проверки."
done
for key in EMAIL_NOTIFICATIONS_ENABLED MAX_NOTIFICATIONS_ENABLED COLLEGIUM_REMINDERS_ENABLED DIRECTOR_ASSIGNMENT_REMINDERS_ENABLED PRODUCTION_SNAPSHOT_ENABLED; do
  [[ "$(read_env "$key")" != "true" ]] || die "$key=true в server/.env: для копии production это должно быть выключено."
done

# --- 2. Docker MariaDB -------------------------------------------------------
command -v docker >/dev/null || die "Docker не установлен."
if ! docker info >/dev/null 2>&1; then
  echo "Запускаю Docker Desktop…"
  open -a Docker 2>/dev/null || true
  for _ in $(seq 1 60); do docker info >/dev/null 2>&1 && break; sleep 2; done
  docker info >/dev/null 2>&1 || die "Docker не запустился. Откройте Docker Desktop и повторите."
fi
(cd "$ROOT_DIR" && docker compose up -d mariadb >/dev/null)
for _ in $(seq 1 60); do
  [[ "$(docker inspect -f '{{.State.Health.Status}}' smb-monitor-mariadb 2>/dev/null)" == "healthy" ]] && break
  sleep 2
done
[[ "$(docker inspect -f '{{.State.Health.Status}}' smb-monitor-mariadb 2>/dev/null)" == "healthy" ]] ||
  die "локальная MariaDB не стала healthy (docker compose ps mariadb)."
ROOT_PASSWORD="$(cd "$ROOT_DIR" && docker compose exec -T mariadb printenv MARIADB_ROOT_PASSWORD)"

# --- 3. Одно подключение к Jino -----------------------------------------------
if [[ "$DIRECT" -eq 0 ]] && ! nc -z -G 1 127.0.0.1 "$PROXY_PORT" >/dev/null 2>&1; then
  die "прокси Jino (127.0.0.1:$PROXY_PORT) не запущен, а с домашнего адреса Jino отклоняет SSH. Включите «Прокси Jino через VPN» в меню SMB Jino Deploy или запустите с --direct, если блокировку сняли."
fi

DUMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/smb-production-copy.XXXXXX")"
chmod 700 "$DUMP_DIR"
DUMP_FILE="$DUMP_DIR/$SOURCE.sql.gz"
cleanup() {
  if [[ "$KEEP_DUMP" -eq 0 ]]; then rm -rf "$DUMP_DIR"; fi
}
trap cleanup EXIT

echo "Читаю БД $SOURCE ($REMOTE_DOMAIN) через SSH…"
# Скрипт уходит на сервер через stdin; пароль БД остаётся там (MYSQL_PWD дочернего процесса).
# stderr сохраняется отдельно: в нём служебная строка SMB_SQL_MODE= с режимом сервера.
REMOTE_LOG="$DUMP_DIR/remote.log"
if ! ssh -o BatchMode=yes -o ConnectTimeout=20 "$SSH_HOST" "bash -s -- '$REMOTE_DOMAIN'" > "$DUMP_FILE" 2> "$REMOTE_LOG" <<'REMOTE'
set -euo pipefail
APP_DIR="$HOME/domains/$1/app"
[[ -f "$APP_DIR/server/.env" ]] || { echo "На сервере нет $APP_DIR/server/.env" >&2; exit 3; }
if ! command -v node >/dev/null 2>&1; then
  for candidate in /opt/alt/alt-nodejs24/root/usr/bin /opt/alt/alt-nodejs22/root/usr/bin /opt/alt/alt-nodejs20/root/usr/bin; do
    if [[ -x "$candidate/node" ]]; then export PATH="$candidate:$PATH"; break; fi
  done
fi
DUMP_BIN="$(command -v mariadb-dump || command -v mysqldump || true)"
[[ -n "$DUMP_BIN" ]] || { echo "На сервере нет mariadb-dump/mysqldump" >&2; exit 3; }
CLIENT_BIN="$(command -v mariadb || command -v mysql || true)"
node - "$APP_DIR/server/.env" "$DUMP_BIN" "$CLIENT_BIN" <<'JS'
const { readFileSync } = require("node:fs");
const { spawn } = require("node:child_process");
const { createGzip } = require("node:zlib");
const [envFile, dumpBin, clientBin] = process.argv.slice(2);
let databaseUrl;
for (const line of readFileSync(envFile, "utf8").split(/\r?\n/u)) {
  const match = /^\s*DATABASE_URL\s*=\s*(.*)$/u.exec(line);
  if (match) databaseUrl = match[1].trim().replace(/^["']|["']$/gu, "");
}
if (!databaseUrl) { console.error("В server/.env на сервере нет DATABASE_URL"); process.exit(3); }
const url = new URL(databaseUrl);
const args = [
  "--single-transaction", "--quick", "--skip-lock-tables", "--no-tablespaces",
  "--hex-blob", "--default-character-set=utf8mb4", "--skip-triggers",
  `--user=${decodeURIComponent(url.username)}`,
];
const socket = url.searchParams.get("socketPath");
if (socket) args.push(`--socket=${socket}`);
else args.push(`--host=${url.hostname}`, `--port=${url.port || "3306"}`);
args.push(decodeURIComponent(url.pathname.slice(1)));
const env = { ...process.env, MYSQL_PWD: decodeURIComponent(url.password) };
const dump = spawn(dumpBin, args, { env, stdio: ["ignore", "pipe", "inherit"] });
dump.stdout.pipe(createGzip()).pipe(process.stdout);
dump.on("close", (code) => {
  if (code !== 0) { console.error(`dump завершился с кодом ${code}`); process.exitCode = 4; return; }
  if (!clientBin) return;
  // Режим SQL сервера: локальная проверка должна принимать и отвергать те же значения.
  const connection = args.filter((arg) => /^--(user|socket|host|port)=/u.test(arg));
  const mode = spawn(clientBin, [...connection, "-N", "-B", "-e", "select @@global.sql_mode"], { env, stdio: ["ignore", "pipe", "inherit"] });
  let value = "";
  mode.stdout.on("data", (chunk) => { value += chunk; });
  mode.on("close", () => console.error(`SMB_SQL_MODE=${value.trim()}`));
});
JS
REMOTE
then
  grep -v '^SMB_SQL_MODE=' "$REMOTE_LOG" >&2 || true
  die "SSH-выгрузка не удалась (сообщения выше)."
fi

grep -v '^SMB_SQL_MODE=' "$REMOTE_LOG" >&2 || true
gzip -t "$DUMP_FILE" 2>/dev/null || die "выгрузка повреждена или пуста — смотрите сообщения SSH выше."
REMOTE_SQL_MODE="$(sed -n 's/^SMB_SQL_MODE=//p' "$REMOTE_LOG" | tail -n 1)"
echo "Получено: $(du -h "$DUMP_FILE" | cut -f1) (сжато)."

# --- 4. Замена локальной БД ---------------------------------------------------
echo "Заменяю локальную БД $LOCAL_DB_NAME…"
mysql_root() { (cd "$ROOT_DIR" && docker compose exec -T -e MYSQL_PWD="$ROOT_PASSWORD" mariadb mariadb -uroot "$@"); }
mysql_root -e "DROP DATABASE IF EXISTS \`$LOCAL_DB_NAME\`; CREATE DATABASE \`$LOCAL_DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL PRIVILEGES ON \`$LOCAL_DB_NAME\`.* TO 'smb_monitor'@'%'; FLUSH PRIVILEGES;"
# Вложения Коллегии до 7 МБ дают строки выгрузки около 14 МБ в hex.
mysql_root -e "SET GLOBAL max_allowed_packet = 67108864;"
gunzip -c "$DUMP_FILE" | mysql_root --max-allowed-packet=64M "$LOCAL_DB_NAME"
# Режим SQL как на сервере: иначе локально падает то, что production принимает, и наоборот.
if [[ "$REMOTE_SQL_MODE" =~ ^[A-Z_,]*$ ]] && [[ -n "$(sed -n 's/^SMB_SQL_MODE=/x/p' "$REMOTE_LOG")" ]]; then
  mysql_root -e "SET GLOBAL sql_mode = '$REMOTE_SQL_MODE';"
  echo "sql_mode как на сервере: ${REMOTE_SQL_MODE:-(пустой)}. Запущенный dev:api перезапустите."
else
  echo "Внимание: не удалось прочитать sql_mode сервера — локальный режим может отличаться." >&2
fi
# Чужие сессии production локально не нужны: вход — через dev-доступ.
mysql_root "$LOCAL_DB_NAME" -e "DELETE FROM auth_sessions;"

echo "Применяю миграции текущего checkout…"
(cd "$ROOT_DIR" && npm run --silent db:migrate)

if [[ "$KEEP_DUMP" -eq 1 ]]; then echo "Выгрузка сохранена: $DUMP_FILE (персональные данные — удалите после проверки)."; fi
echo "Готово: локальная БД содержит копию $SOURCE. Запуск: npm run dev:api и npm run dev:web -- --host 127.0.0.1."
