import assert from "node:assert/strict";
import test from "node:test";
import { readServerConfig } from "./env.js";

const baseEnv: NodeJS.ProcessEnv = {
  SMB_APP_ENV: "test",
  DATABASE_URL: "mysql://test:test@localhost/smb_test",
};

test("production snapshot stays disabled unless explicitly configured", () => {
  const config = readServerConfig(baseEnv);

  assert.deepEqual(config.productionSnapshot, { enabled: false });
});

test("google sheets reference uses the OC recipient column names by default", () => {
  const config = readServerConfig(baseEnv);

  assert.deepEqual(
    config.googleSheetsReference.refractoryNotificationEmailColumns,
    ["Адресаты ОЦ (емейлы)"],
  );
  assert.deepEqual(config.googleSheetsReference.refractoryMaxUserIdColumns, [
    "Адресаты ОЦ (МАКС)",
  ]);
  assert.deepEqual(
    config.googleSheetsReference.refractoryReviewNotificationEmailColumns,
    ["Адресаты Диспетчеры (емейлы)"],
  );
  assert.deepEqual(
    config.googleSheetsReference.refractoryReviewMaxUserIdColumns,
    ["Адресаты Диспетчеры (МАКС)"],
  );
});

test("production snapshot requires an exact test target database guard", () => {
  const config = readServerConfig({
    ...baseEnv,
    PRODUCTION_SNAPSHOT_ENABLED: "true",
    PRODUCTION_DATABASE_URL: "mysql://readonly:secret@localhost/smb_production",
    PRODUCTION_SNAPSHOT_TARGET_DATABASE: "smb_test",
  });

  assert.deepEqual(config.productionSnapshot, {
    enabled: true,
    sourceDatabaseUrl:
      "mysql://readonly:secret@localhost/smb_production",
    expectedTargetDatabase: "smb_test",
  });
});

test("production snapshot cannot be enabled by a production runtime", () => {
  assert.throws(
    () =>
      readServerConfig({
        ...baseEnv,
        SMB_APP_ENV: "production",
        PRODUCTION_SNAPSHOT_ENABLED: "true",
        PRODUCTION_DATABASE_URL:
          "mysql://readonly:secret@localhost/smb_production",
        PRODUCTION_SNAPSHOT_TARGET_DATABASE: "smb_test",
      }),
    /must not be true in production/u,
  );
});

test("production snapshot refuses to point source and target at the same database", () => {
  assert.throws(
    () =>
      readServerConfig({
        ...baseEnv,
        PRODUCTION_SNAPSHOT_ENABLED: "true",
        PRODUCTION_DATABASE_URL: "mysql://readonly:secret@localhost/smb_test",
        PRODUCTION_SNAPSHOT_TARGET_DATABASE: "smb_test",
      }),
    /must use different database names/u,
  );
});
