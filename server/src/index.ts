import { readServerConfig } from "./config/env.js";
import { runMigrations } from "./db/migrations.js";
import { createDatabasePool } from "./db/pool.js";
import { createApiServer } from "./http/app.js";
import { createDispatcherSubmissionsRepository } from "./repositories/dispatcherSubmissionsRepository.js";

const config = readServerConfig();
const pool = createDatabasePool(config.databaseUrl);

if (config.runMigrationsOnStart) {
  await runMigrations(pool);
}

const server = createApiServer({
  config,
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
