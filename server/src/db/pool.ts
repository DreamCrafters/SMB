import { createPool, type Pool, type PoolOptions } from "mysql2/promise";

export function createDatabasePool(databaseUrl: string) {
  return createPool(buildDatabasePoolOptions(databaseUrl));
}

export function buildDatabasePoolOptions(databaseUrl: string): PoolOptions {
  const parsed = new URL(databaseUrl);

  if (parsed.protocol !== "mysql:" && parsed.protocol !== "mariadb:") {
    throw new Error("DATABASE_URL must use mysql:// or mariadb://.");
  }

  const database = parsed.pathname.slice(1);

  if (database.length === 0) {
    throw new Error("DATABASE_URL must include a database name.");
  }

  const socketPath = readSocketPath(parsed);

  return {
    ...(socketPath === undefined
      ? {
          host: parsed.hostname,
          port: parsed.port.length > 0 ? Number(parsed.port) : 3306,
        }
      : { socketPath }),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(database),
    waitForConnections: true,
    connectionLimit: readConnectionLimit(parsed),
    timezone: "Z",
    charset: "utf8mb4_unicode_ci",
  };
}

function readSocketPath(parsed: URL) {
  const socketPath = parsed.searchParams.get("socketPath");

  if (socketPath === null) {
    return undefined;
  }

  if (socketPath.trim().length === 0) {
    throw new Error("DATABASE_URL socketPath must not be empty.");
  }

  return socketPath;
}

function readConnectionLimit(parsed: URL) {
  const value = parsed.searchParams.get("connectionLimit");

  if (value === null) {
    return 10;
  }

  const limit = Number(value);

  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new Error("DATABASE_URL connectionLimit must be an integer from 1 to 50.");
  }

  return limit;
}

export type DatabasePool = Pool;
