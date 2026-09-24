import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync, rmdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import test from "node:test";

const script = path.resolve("scripts/deploy-jino-dual-env.sh");

function deploy(t, overrides = {}) {
  const domains = path.join(homedir(), "domains");
  const hadDomains = existsSync(domains);
  mkdirSync(domains, { recursive: true });
  const root = mkdtempSync(path.join(domains, "smb-deploy-fixture-"));
  t.after(() => {
    rmSync(root, { recursive: true, force: true });
    if (!hadDomains) { try { rmdirSync(domains); } catch {} }
  });
  const bin = path.join(root, "bin");
  mkdirSync(bin);
  const executable = (name, contents) => writeFileSync(path.join(bin, name), contents, { mode: 0o755 });
  executable("git", `#!/bin/bash
case "$*" in
  *"status --porcelain"*) printf '%s' "\${FIXTURE_DIRTY:-}" ;;
  *"branch --show-current"*) echo Dev ;;
  *"rev-parse HEAD"*)
    if [[ "$PWD" == */production/app && "\${FIXTURE_DIFFERENT_SHA:-}" == true ]]; then
      printf '%040d\\n' 2
    else
      printf '%040d\\n' 1
    fi ;;
esac
`);
  executable("npm", `#!/bin/bash
mode="\${PWD%/*}"
mode="\${mode##*/}"
printf '{"mode":"%s","args":"%s","appEnv":"%s"}\\n' "$mode" "$*" "\${VITE_SMB_APP_ENV:-}" >> "$FIXTURE_LOG"
if [[ "$*" == "run test:jino" && "\${FIXTURE_TEST_FAIL:-}" == true ]]; then exit 1; fi
case "$*" in
  "run test:jino"|"--workspace server run build")
    mkdir -p server/dist
    touch server/dist/index.js ;;
  "run build:web:"*)
    mkdir -p dist
    printf 'fixture' > dist/.htaccess ;;
esac
`);
  for (const mode of ["test", "production"]) {
    const app = path.join(root, mode, "app");
    mkdirSync(path.join(app, "server"), { recursive: true });
    writeFileSync(path.join(app, `.env.${mode}`), `VITE_SMB_APP_ENV=${mode}\nVITE_SMB_REMOTE_API_URL=https://example.invalid\n`);
    writeFileSync(path.join(app, "server/.env"), `SMB_APP_ENV=${mode}\nDATABASE_URL=fixture\nCORS_ORIGIN=fixture\nSESSION_COOKIE_NAME=fixture\nDEV_ACCESS_ENABLED=false\nPRODUCTION_SNAPSHOT_ENABLED=true\nPRODUCTION_DATABASE_URL=fixture\nPRODUCTION_SNAPSHOT_TARGET_DATABASE=fixture\n`);
  }
  const log = path.join(root, "commands.jsonl");
  const result = spawnSync("bash", [script], {
    encoding: "utf8", timeout: 20000,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, SMB_DEPLOY_BRANCH: "Dev",
      SMB_DEPLOY_TARGET: "dual", SMB_RUN_TESTS: "true", SMB_SKIP_NPM_CI: "false", SMB_SKIP_CHECKS: "false",
      SMB_NPM_REGISTRY: "", SMB_PROD_ROOT: path.join(root, "production"), SMB_TEST_ROOT: path.join(root, "test"),
      SMB_PROD_APP_DIR: path.join(root, "production/app"), SMB_TEST_APP_DIR: path.join(root, "test/app"),
      SMB_PROD_PUBLIC_DIR: path.join(root, "production/public_html"), SMB_TEST_PUBLIC_DIR: path.join(root, "test/public_html"),
      FIXTURE_LOG: log, ...overrides },
  });
  const calls = existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").map(JSON.parse) : [];
  return { ...result, calls, root };
}

test("dual deploy tests identical code once but validates, migrates and builds both environments", (t) => {
  const result = deploy(t);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.calls.filter((c) => c.args === "run test:jino").length, 1);
  assert.equal(result.calls.filter((c) => c.args === "run typecheck").length, 2);
  assert.equal(result.calls.filter((c) => c.args === "--workspace server run db:migrate").length, 2);
  assert.deepEqual(result.calls.filter((c) => c.args === "--workspace server run build").map((c) => c.mode), ["production"]);
  for (const mode of ["test", "production"]) {
    assert.ok(result.calls.some((c) => c.args === `run build:web:${mode}`));
    assert.ok(existsSync(path.join(result.root, mode, ".smb-deploy-state")));
  }
});

for (const mode of ["test", "production"]) {
  test(`single ${mode} deploy still runs the complete suite`, (t) => {
    const result = deploy(t, { SMB_DEPLOY_TARGET: mode });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.calls.filter((c) => c.args === "run test:jino").map((c) => c.mode), [mode]);
    assert.equal(result.calls.filter((c) => c.args === "--workspace server run build").length, 0);
    assert.equal(result.calls.find((c) => c.args === "run test:jino").appEnv, "test");
  });
}

test("failed tests stop deployment before migrations or publication", (t) => {
  const result = deploy(t, { FIXTURE_TEST_FAIL: "true" });
  assert.notEqual(result.status, 0);
  assert.ok(!result.calls.some((c) => c.args.includes("db:migrate") || c.args.startsWith("run build:web:")));
  assert.ok(!existsSync(path.join(result.root, "test", ".smb-deploy-state")));
});

test("a changed commit stops the second environment before migrations", (t) => {
  const result = deploy(t, { FIXTURE_DIFFERENT_SHA: "true" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /commit changed/);
  assert.ok(!result.calls.some((c) => c.mode === "production"));
  assert.ok(!existsSync(path.join(result.root, "production", ".smb-deploy-state")));
});

test("dirty source cannot reuse or produce a successful test result", (t) => {
  const result = deploy(t, { FIXTURE_DIRTY: " M src/example.ts" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /checkout is dirty/);
  assert.equal(result.calls.length, 0);
});

test("without npm ci each environment is tested independently", (t) => {
  const result = deploy(t, { SMB_SKIP_NPM_CI: "true" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.calls.filter((c) => c.args === "run test:jino").length, 2);
});

test("explicitly disabled tests still build both backend artifacts", (t) => {
  const result = deploy(t, { SMB_RUN_TESTS: "false" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.calls.filter((c) => c.args === "run test:jino").length, 0);
  assert.equal(result.calls.filter((c) => c.args === "--workspace server run build").length, 2);
});
