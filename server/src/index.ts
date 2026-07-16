import { readServerConfig } from "./config/env.js";
import { runMigrations } from "./db/migrations.js";
import { createDatabasePool } from "./db/pool.js";
import { createDatabaseTransactionContext } from "./db/transactionContext.js";
import { createApiServer } from "./http/app.js";
import { createAdminDatabaseRepository } from "./repositories/adminDatabaseRepository.js";
import { createAccountsRepository } from "./repositories/accountsRepository.js";
import { createAuthSessionService } from "./repositories/authRepository.js";
import { createDispatcherSubmissionsRepository } from "./repositories/dispatcherSubmissionsRepository.js";
import { createDispatcherSpreadsheetImportRepository } from "./repositories/dispatcherSpreadsheetImportRepository.js";
import { createAuditRepository } from "./repositories/auditRepository.js";
import { createDispatcherSpreadsheetImportService } from "./integrations/dispatcherSpreadsheetImport.js";

const config = readServerConfig();
const sourcePool = createDatabasePool(config.databaseUrl);
const database = createDatabaseTransactionContext(sourcePool);
const pool = database.pool;
const dispatcherSpreadsheetImportRepository =
  createDispatcherSpreadsheetImportRepository(pool);

if (config.runMigrationsOnStart) {
  await runMigrations(pool);
}

const server = createApiServer({
  config,
  adminDatabase: createAdminDatabaseRepository(pool),
  accounts: createAccountsRepository(pool),
  authService: createAuthSessionService(pool, {
    sessionTtlHours: config.session.ttlHours,
  }),
  dispatcherSubmissions: createDispatcherSubmissionsRepository(pool),
  audit: createAuditRepository(pool),
  databaseTransaction: database.transaction,
  dispatcherSpreadsheetImport: createDispatcherSpreadsheetImportService(
    config.googleSheetsReference,
    dispatcherSpreadsheetImportRepository,
  ),
});

server.listen(config.port, "0.0.0.0", () => {
  console.log(`SMB Monitor API listening on http://127.0.0.1:${config.port}`);
});

async function shutdown() {
  server.close(() => {
    void sourcePool.end().then(() => {
      process.exit(0);
    });
  });
}

process.on("SIGINT", () => {
  void shutdown();
});

process.on("SIGTERM", () => {
  void shutdown();
});
