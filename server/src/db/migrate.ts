import { readServerConfig } from "../config/env.js";
import { runMigrations } from "./migrations.js";
import { createDatabasePool } from "./pool.js";

const config = readServerConfig();
const pool = createDatabasePool(config.databaseUrl);

try {
  await runMigrations(pool);
  console.log("Database migrations applied.");
} finally {
  await pool.end();
}
