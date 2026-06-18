import pg from "pg";

export function createPgPool(databaseUrl: string) {
  return new pg.Pool({
    connectionString: databaseUrl,
  });
}

export type PgPool = pg.Pool;
