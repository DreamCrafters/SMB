import { readServerConfig } from "./config/env.js";
import { runMigrations } from "./db/migrations.js";
import { createDatabasePool } from "./db/pool.js";
import { createApiServer } from "./http/app.js";
import { createAdminDatabaseRepository } from "./repositories/adminDatabaseRepository.js";
import { createAccountsRepository } from "./repositories/accountsRepository.js";
import { createAuthSessionService } from "./repositories/authRepository.js";
import { createDispatcherSubmissionsRepository } from "./repositories/dispatcherSubmissionsRepository.js";

const config = readServerConfig();
const pool = createDatabasePool(config.databaseUrl);

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
});

server.listen(config.port, "0.0.0.0", () => {
  console.log(`SMB Monitor API listening on http://127.0.0.1:${config.port}`);
});

async function shutdown() {
  server.close(() => {
    void pool.end().then(() => {
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
