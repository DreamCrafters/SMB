import { readServerConfig } from "../config/env.js";
import { runMigrations } from "./migrations.js";
import { createPgPool } from "./pool.js";

const config = readServerConfig();
const pool = createPgPool(config.databaseUrl);

try {
  await runMigrations(pool);
  console.log("Database migrations applied.");
} finally {
  await pool.end();
}
