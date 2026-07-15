import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

test("Jino Apache config forces HTTPS through the proxy-aware header", async () => {
  const config = await readFile(new URL("public/.htaccess", projectRoot), "utf8");

  assert.match(config, /RewriteCond %\{HTTPS\} !=on/);
  assert.match(
    config,
    /RewriteCond %\{HTTP:X-Forwarded-Protocol\} !\^https\$ \[NC\]/,
  );
  assert.match(
    config,
    /RewriteRule \^ https:\/\/%\{SERVER_NAME\}%\{REQUEST_URI\} \[R=301,L\]/,
  );
  assert.match(config, /Strict-Transport-Security "max-age=31536000"/);
  assert.match(config, /X-Content-Type-Options "nosniff"/);
});

test("Jino deploy requires and publishes the hidden Apache config", async () => {
  const deployScript = await readFile(
    new URL("scripts/deploy-jino-dual-env.sh", projectRoot),
    "utf8",
  );

  assert.match(deployScript, /require_file "\$app_dir\/dist\/\.htaccess"/);
  assert.match(deployScript, /cp -R "\$app_dir\/dist\/\." "\$public_dir\/"/);
});

test("Jino deploy records the published branch and commit after each environment", async () => {
  const deployScript = await readFile(
    new URL("scripts/deploy-jino-dual-env.sh", projectRoot),
    "utf8",
  );

  assert.match(deployScript, /\.smb-deploy-state/);
  assert.match(deployScript, /version=1/);
  assert.match(deployScript, /branch=%s/);
  assert.match(deployScript, /commit=%s/);
  assert.match(deployScript, /deployed_at=%s/);
  assert.match(deployScript, /git check-ref-format --branch "\$DEPLOY_BRANCH"/);

  const publishIndex = deployScript.indexOf(
    'cp -R "$app_dir/dist/." "$public_dir/"',
  );
  const markerIndex = deployScript.indexOf(
    'write_deploy_state "$root_dir" "$mode"',
  );

  assert.ok(publishIndex >= 0, "publish step must exist");
  assert.ok(
    markerIndex > publishIndex,
    "deploy marker must be written after publishing",
  );
});

test("Jino deploy runs frontend and backend tests serially", async () => {
  const [deployScript, rootPackageText, serverPackageText] = await Promise.all([
    readFile(new URL("scripts/deploy-jino-dual-env.sh", projectRoot), "utf8"),
    readFile(new URL("package.json", projectRoot), "utf8"),
    readFile(new URL("server/package.json", projectRoot), "utf8"),
  ]);
  const rootPackage = JSON.parse(rootPackageText);
  const serverPackage = JSON.parse(serverPackageText);

  assert.match(deployScript, /npm run test:jino/);
  assert.match(
    rootPackage.scripts["test:jino"],
    /node --test --test-concurrency=1 tests\/\*\.test\.mjs/,
  );
  assert.match(
    rootPackage.scripts["test:jino"],
    /npm --workspace server run test:jino/,
  );
  assert.match(
    serverPackage.scripts["test:jino"],
    /node --test --test-concurrency=1 dist\/\*\*\/\*\.test\.js/,
  );
});
