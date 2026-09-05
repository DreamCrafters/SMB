import assert from "node:assert/strict";
import test from "node:test";
import { readServerConfig } from "./env.js";

const baseEnv: NodeJS.ProcessEnv = {
  SMB_APP_ENV: "test",
  DATABASE_URL: "mysql://test:test@localhost/smb_test",
};

test("1C read-only source switches the warehouse tab to reading production", () => {
  const config = readServerConfig({
    ...baseEnv,
    ONEC_UPLOAD_API_KEY: "0123456789abcdef",
    ONEC_READ_ONLY_DATABASE_URL:
      "mysql://readonly:secret@localhost/smb_production",
  });

  assert.deepEqual(config.warehouse1cIntegration, {
    uploadApiKey: "0123456789abcdef",
    readOnlySourceDatabaseUrl:
      "mysql://readonly:secret@localhost/smb_production",
  });
});

test("production must never read 1C balances from another database", () => {
  assert.throws(
    () =>
      readServerConfig({
        ...baseEnv,
        SMB_APP_ENV: "production",
        ONEC_READ_ONLY_DATABASE_URL:
          "mysql://readonly:secret@localhost/smb_production",
      }),
    /ONEC_READ_ONLY_DATABASE_URL must not be set in production/u,
  );
});

test("1C upload key must be long enough to be worth checking", () => {
  assert.throws(
    () => readServerConfig({ ...baseEnv, ONEC_UPLOAD_API_KEY: "short" }),
    /ONEC_UPLOAD_API_KEY must be at least 16 characters long/u,
  );
});

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
