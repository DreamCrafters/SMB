#!/usr/bin/env bash
set -euo pipefail

DEPLOY_BRANCH="${SMB_DEPLOY_BRANCH:-main}"
DEPLOY_TARGET="${SMB_DEPLOY_TARGET:-dual}"
RUN_TESTS="${SMB_RUN_TESTS:-false}"
SKIP_CHECKS="${SMB_SKIP_CHECKS:-false}"
SKIP_NPM_CI="${SMB_SKIP_NPM_CI:-false}"
NPM_REGISTRY="${SMB_NPM_REGISTRY:-https://registry.npmmirror.com/}"

PROD_DOMAIN="${SMB_PROD_DOMAIN:-smb.aonmou.ru}"
TEST_DOMAIN="${SMB_TEST_DOMAIN:-test.smb.aonmou.ru}"

PROD_ROOT="${SMB_PROD_ROOT:-$HOME/domains/$PROD_DOMAIN}"
TEST_ROOT="${SMB_TEST_ROOT:-$HOME/domains/$TEST_DOMAIN}"

PROD_APP_DIR="${SMB_PROD_APP_DIR:-$PROD_ROOT/app}"
TEST_APP_DIR="${SMB_TEST_APP_DIR:-$TEST_ROOT/app}"

PROD_PUBLIC_DIR="${SMB_PROD_PUBLIC_DIR:-$PROD_ROOT/public_html}"
TEST_PUBLIC_DIR="${SMB_TEST_PUBLIC_DIR:-$TEST_ROOT/public_html}"

log() {
  printf '\n[%s] %s\n' "$1" "$2"
}

die() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

require_file() {
  local path="$1"

  [[ -f "$path" ]] || die "Required file is missing: $path"
}

require_dir() {
  local path="$1"

  [[ -d "$path" ]] || die "Required directory is missing: $path"
}

require_env_value() {
  local file="$1"
  local key="$2"
  local expected="$3"

  grep -Eq "^${key}=${expected}$" "$file" ||
    die "$file must contain ${key}=${expected}"
}

require_env_key() {
  local file="$1"
  local key="$2"

  grep -Eq "^${key}=.+" "$file" ||
    die "$file must contain a non-empty ${key}"
}

guard_public_dir() {
  local public_dir="$1"

  [[ -n "$public_dir" ]] || die "Public directory path is empty."
  [[ "$public_dir" != "/" ]] || die "Refusing to wipe /"
  [[ "$public_dir" == "$HOME"/domains/*/public_html ]] ||
    die "Public directory must be inside ~/domains/*/public_html: $public_dir"
}

validate_environment_files() {
  local mode="$1"
  local app_dir="$2"
  local frontend_env="$app_dir/.env.$mode"
  local server_env="$app_dir/server/.env"

  require_file "$frontend_env"
  require_file "$server_env"
  require_env_value "$frontend_env" "VITE_SMB_APP_ENV" "$mode"
  require_env_key "$frontend_env" "VITE_SMB_REMOTE_API_URL"
  require_env_value "$server_env" "SMB_APP_ENV" "$mode"
  require_env_key "$server_env" "DATABASE_URL"
  require_env_key "$server_env" "CORS_ORIGIN"
  require_env_key "$server_env" "SESSION_COOKIE_NAME"

  if [[ "$mode" == "production" ]]; then
    require_env_value "$server_env" "DEV_ACCESS_ENABLED" "false"
  fi
}

prepare_git_checkout() {
  local app_dir="$1"

  cd "$app_dir"
  git fetch origin "$DEPLOY_BRANCH"

  if [[ "$(git branch --show-current)" != "$DEPLOY_BRANCH" ]]; then
    git checkout "$DEPLOY_BRANCH"
  fi

  git pull --ff-only origin "$DEPLOY_BRANCH"
}

install_dependencies() {
  if [[ "$SKIP_NPM_CI" == "true" ]]; then
    log "deps" "Skipping npm ci because SMB_SKIP_NPM_CI=true."
    return
  fi

  if [[ -n "$NPM_REGISTRY" ]]; then
    npm config set registry "$NPM_REGISTRY"
    npm config set replace-registry-host always
  fi

  npm ci --no-audit --no-fund --prefer-online
}

run_checks() {
  if [[ "$SKIP_CHECKS" == "true" ]]; then
    log "checks" "Skipping typecheck because SMB_SKIP_CHECKS=true."
    return
  fi

  npm run typecheck
}

run_optional_tests() {
  if [[ "$RUN_TESTS" != "true" ]]; then
    return
  fi

  npm test
}

deploy_environment() {
  local label="$1"
  local mode="$2"
  local domain="$3"
  local root_dir="$4"
  local app_dir="$5"
  local public_dir="$6"

  log "$label" "Deploying $domain from branch $DEPLOY_BRANCH."
  require_dir "$app_dir"
  validate_environment_files "$mode" "$app_dir"
  guard_public_dir "$public_dir"
  prepare_git_checkout "$app_dir"
  install_dependencies
  run_checks
  run_optional_tests

  SMB_SERVER_ENV_FILE="$app_dir/server/.env" npm --workspace server run db:migrate
  npm --workspace server run build
  npm run "build:web:$mode"

  mkdir -p "$public_dir"
  rm -rf "$public_dir"/*
  cp -R "$app_dir/dist/." "$public_dir/"

  printf 'import("./app/server/dist/index.js");\n' > "$root_dir/app.js"
  mkdir -p "$root_dir/tmp"
  touch "$root_dir/tmp/restart.txt"

  log "$label" "Done. Smoke check: curl -i https://$domain/ && curl -i https://$domain/health"
}

case "$DEPLOY_TARGET" in
  test)
    deploy_environment "test" "test" "$TEST_DOMAIN" "$TEST_ROOT" "$TEST_APP_DIR" "$TEST_PUBLIC_DIR"
    ;;
  production)
    deploy_environment "production" "production" "$PROD_DOMAIN" "$PROD_ROOT" "$PROD_APP_DIR" "$PROD_PUBLIC_DIR"
    ;;
  dual)
    deploy_environment "test" "test" "$TEST_DOMAIN" "$TEST_ROOT" "$TEST_APP_DIR" "$TEST_PUBLIC_DIR"
    deploy_environment "production" "production" "$PROD_DOMAIN" "$PROD_ROOT" "$PROD_APP_DIR" "$PROD_PUBLIC_DIR"
    ;;
  *)
    die "Unknown SMB_DEPLOY_TARGET: $DEPLOY_TARGET (expected test, production, or dual)"
    ;;
esac
