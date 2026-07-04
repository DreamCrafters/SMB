import assert from "node:assert/strict";
import test from "node:test";
import { buildDatabasePoolOptions } from "./pool.js";

test("buildDatabasePoolOptions keeps TCP host and port by default", () => {
  const options = buildDatabasePoolOptions(
    "mysql://user:pass@127.0.0.1:3307/smb_monitor?connectionLimit=4",
  );

  assert.equal(options.host, "127.0.0.1");
  assert.equal(options.port, 3307);
  assert.equal(options.socketPath, undefined);
  assert.equal(options.user, "user");
  assert.equal(options.password, "pass");
  assert.equal(options.database, "smb_monitor");
  assert.equal(options.connectionLimit, 4);
});

test("buildDatabasePoolOptions supports Jino Unix socket connections", () => {
  const options = buildDatabasePoolOptions(
    "mysql://j53403317_robot:secret@localhost/j53403317_bot1?socketPath=%2Fvar%2Flib%2Fmysql%2Fmysql.sock",
  );

  assert.equal(options.host, undefined);
  assert.equal(options.port, undefined);
  assert.equal(options.socketPath, "/var/lib/mysql/mysql.sock");
  assert.equal(options.user, "j53403317_robot");
  assert.equal(options.password, "secret");
  assert.equal(options.database, "j53403317_bot1");
});
