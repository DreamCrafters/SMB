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
