import { readServerConfig } from "../config/env.js";
import { runMigrations } from "./migrations.js";
import { createDatabasePool } from "./pool.js";
import {
  testDatabaseMutationLockName,
} from "./productionSnapshot.js";
import { runWithDatabaseMutationLock } from "./transactionContext.js";

const config = readServerConfig();
const pool = createDatabasePool(config.databaseUrl);

try {
  if (config.productionSnapshot.enabled) {
    await runWithDatabaseMutationLock({
      pool,
      lockName: testDatabaseMutationLockName,
      operation: () => runMigrations(pool),
    });
  } else {
    await runMigrations(pool);
  }
  console.log("Database migrations applied.");
} finally {
  await pool.end();
}
