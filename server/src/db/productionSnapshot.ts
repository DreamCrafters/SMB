import type {
  PoolConnection,
  RowDataPacket,
} from "mysql2/promise";
import type { DatabasePool } from "./pool.js";

export const productionSnapshotConfirmation = "ЗАМЕНИТЬ ТЕСТОВУЮ БД";
export const testDatabaseMutationLockName = "smb:test_database_mutation";

export type ProductionSnapshotResult = {
  tableCount: number;
  rowCount: number;
  authSessionsCleared: true;
};

export type ProductionDatabaseSnapshotService = {
  isRunning: () => boolean;
  replaceTestDatabase: () => Promise<ProductionSnapshotResult>;
};

export class ProductionSnapshotAlreadyRunningError extends Error {}
export class ProductionSnapshotSchemaMismatchError extends Error {}
export class ProductionSnapshotRestoreError extends Error {}

type SnapshotValue = unknown;

export type DatabaseSnapshotTable = {
  name: string;
  createSql: string;
  columns: string[];
  rows: SnapshotValue[][];
};

export type DatabaseSnapshot = {
  tables: DatabaseSnapshotTable[];
};

export type DatabaseSnapshotStore = {
  capture: () => Promise<DatabaseSnapshot>;
  replaceAtomically: (snapshot: DatabaseSnapshot) => Promise<void>;
};

export function createProductionDatabaseSnapshotService({
  sourcePool,
  targetPool,
}: {
  sourcePool: DatabasePool;
  targetPool: DatabasePool;
}): ProductionDatabaseSnapshotService {
  const source = createSnapshotStore(sourcePool);
  const target = createSnapshotStore(targetPool);
  const service = createProductionDatabaseSnapshotServiceFromStores({
    source,
    target,
  });

  return {
    isRunning: service.isRunning,
    async replaceTestDatabase() {
      return withSnapshotLocks(targetPool, service.replaceTestDatabase);
    },
  };
}

export function createProductionDatabaseSnapshotServiceFromStores({
  source,
  target,
}: {
  source: DatabaseSnapshotStore;
  target: DatabaseSnapshotStore;
}): ProductionDatabaseSnapshotService {
  let running = false;

  return {
    isRunning() {
      return running;
    },

    async replaceTestDatabase() {
      if (running) {
        throw new ProductionSnapshotAlreadyRunningError(
          "Production snapshot replacement is already running.",
        );
      }

      running = true;

      try {
        const productionSnapshot = await source.capture();
        const testSnapshot = await target.capture();

        assertCompatibleSchemas(productionSnapshot, testSnapshot);

        try {
          await target.replaceAtomically(
            withClearedAuthSessions(productionSnapshot),
          );
        } catch (replacementError) {
          throw new ProductionSnapshotRestoreError(
            `Production snapshot replacement failed and was rolled back: ${readErrorName(replacementError)}.`,
          );
        }

        return {
          tableCount: productionSnapshot.tables.length,
          rowCount: countSnapshotRows(
            withClearedAuthSessions(productionSnapshot),
          ),
          authSessionsCleared: true,
        };
      } finally {
        running = false;
      }
    },
  };
}

export function createSnapshotStore(pool: DatabasePool): DatabaseSnapshotStore {
  return {
    async capture() {
      const connection = await pool.getConnection();

      try {
        await connection.query(
          "set session transaction isolation level repeatable read",
        );
        await connection.query("start transaction with consistent snapshot");

        const tables = await readSnapshotTables(connection);

        await connection.commit();
        return { tables };
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },

    async replaceAtomically(snapshot) {
      const connection = await pool.getConnection();
      let transactionStarted = false;

      try {
        await connection.beginTransaction();
        transactionStarted = true;
        await connection.query("set foreign_key_checks = 0");

        for (const table of [...snapshot.tables].reverse()) {
          await connection.query(
            `delete from ${quoteIdentifier(table.name)}`,
          );
        }

        for (const table of snapshot.tables) {
          await insertSnapshotRows(connection, table);
        }
        await verifySnapshotRows(connection, snapshot);
        await connection.commit();
        transactionStarted = false;
      } catch (error) {
        if (transactionStarted) {
          await connection.rollback();
        }
        throw error;
      } finally {
        try {
          await connection.query("set foreign_key_checks = 1");
        } finally {
          connection.release();
        }
      }
    },
  };
}

async function withSnapshotLocks<T>(
  pool: DatabasePool,
  operation: () => Promise<T>,
) {
  const connection = await pool.getConnection();
  const operationLockName = "smb:production_snapshot";
  let operationLockAcquired = false;
  let mutationLockAcquired = false;

  try {
    const [rows] = await connection.query<RowDataPacket[]>(
      "select get_lock(?, 0) as acquired",
      [operationLockName],
    );

    if (Number(rows[0]?.acquired) !== 1) {
      throw new ProductionSnapshotAlreadyRunningError(
        "Production snapshot replacement is already running.",
      );
    }

    operationLockAcquired = true;
    const [mutationRows] = await connection.query<RowDataPacket[]>(
      "select get_lock(?, 30) as acquired",
      [testDatabaseMutationLockName],
    );

    if (Number(mutationRows[0]?.acquired) !== 1) {
      throw new ProductionSnapshotAlreadyRunningError(
        "The test database is busy. Try the production snapshot replacement again.",
      );
    }

    mutationLockAcquired = true;
    return await operation();
  } finally {
    try {
      if (mutationLockAcquired) {
        await connection.query("select release_lock(?)", [
          testDatabaseMutationLockName,
        ]);
      }
    } finally {
      try {
        if (operationLockAcquired) {
          await connection.query("select release_lock(?)", [operationLockName]);
        }
      } finally {
        connection.release();
      }
    }
  }
}

async function readSnapshotTables(connection: PoolConnection) {
  await assertNoDatabaseTriggers(connection);
  const objects = await readDatabaseObjects(connection);
  const unsupportedObjects = objects.filter(
    (object) => object.tableType !== "BASE TABLE",
  );

  if (unsupportedObjects.length > 0) {
    throw new ProductionSnapshotSchemaMismatchError(
      "Production snapshot supports base tables only. Remove views before synchronization.",
    );
  }

  const tables: DatabaseSnapshotTable[] = [];

  for (const object of objects) {
    const tableName = object.tableName;
    const [createRows] = await connection.query<RowDataPacket[]>(
      `show create table ${quoteIdentifier(tableName)}`,
    );
    const createSql = readCreateTableSql(createRows[0]);
    const [rows, fields] = await connection.query<RowDataPacket[]>(
      `select * from ${quoteIdentifier(tableName)}`,
    );
    const columns = fields.map((field) => field.name);

    tables.push({
      name: tableName,
      createSql,
      columns,
      rows: rows.map((row) => columns.map((column) => row[column])),
    });
  }

  return tables;
}

async function assertNoDatabaseTriggers(connection: PoolConnection) {
  const [rows] = await connection.query<RowDataPacket[]>(
    `select trigger_name as triggerName
       from information_schema.triggers
      where trigger_schema = database()
      limit 1`,
  );

  if (rows.length > 0) {
    throw new ProductionSnapshotSchemaMismatchError(
      "Production snapshot replacement does not support database triggers.",
    );
  }
}

async function readDatabaseObjects(connection: PoolConnection) {
  const [rows] = await connection.query<RowDataPacket[]>(
    `select table_name as tableName, table_type as tableType
       from information_schema.tables
      where table_schema = database()
      order by table_name`,
  );

  return rows.map((row) => ({
    tableName: String(row.tableName),
    tableType: String(row.tableType),
  }));
}

async function readTableNames(connection: PoolConnection) {
  const objects = await readDatabaseObjects(connection);
  const unsupportedObjects = objects.filter(
    (object) => object.tableType !== "BASE TABLE",
  );

  if (unsupportedObjects.length > 0) {
    throw new Error("Database contains unsupported non-table objects.");
  }

  return objects.map((object) => object.tableName);
}

function readCreateTableSql(row: RowDataPacket | undefined) {
  if (row === undefined) {
    throw new Error("SHOW CREATE TABLE returned no rows.");
  }

  const entry = Object.entries(row).find(([key]) =>
    key.toLowerCase().includes("create table"),
  );

  if (entry === undefined || typeof entry[1] !== "string") {
    throw new Error("SHOW CREATE TABLE returned an unsupported response.");
  }

  return entry[1];
}

async function insertSnapshotRows(
  connection: PoolConnection,
  table: DatabaseSnapshotTable,
) {
  if (table.rows.length === 0) {
    return;
  }

  if (table.columns.length === 0) {
    throw new Error(`Snapshot table ${table.name} has rows without columns.`);
  }

  const batchSize = Math.max(
    1,
    Math.min(250, Math.floor(5_000 / table.columns.length)),
  );
  const columnSql = table.columns.map(quoteIdentifier).join(", ");

  for (let offset = 0; offset < table.rows.length; offset += batchSize) {
    const batch = table.rows.slice(offset, offset + batchSize);
    const rowPlaceholder = `(${table.columns.map(() => "?").join(", ")})`;
    const valuesSql = batch.map(() => rowPlaceholder).join(", ");

    await connection.query(
      `insert into ${quoteIdentifier(table.name)} (${columnSql}) values ${valuesSql}`,
      batch.flat(),
    );
  }
}

async function verifySnapshotRows(
  connection: PoolConnection,
  snapshot: DatabaseSnapshot,
) {
  const actualTableNames = await readTableNames(connection);
  const expectedTableNames = snapshot.tables.map((table) => table.name);

  if (!sameStringList(actualTableNames, expectedTableNames)) {
    throw new Error("Restored database table list does not match the snapshot.");
  }

  for (const table of snapshot.tables) {
    const [rows] = await connection.query<RowDataPacket[]>(
      `select count(*) as rowCount from ${quoteIdentifier(table.name)}`,
    );
    const actualCount = Number(rows[0]?.rowCount ?? -1);

    if (actualCount !== table.rows.length) {
      throw new Error(
        `Restored row count does not match the snapshot for table ${table.name}.`,
      );
    }
  }
}

function assertCompatibleSchemas(
  productionSnapshot: DatabaseSnapshot,
  testSnapshot: DatabaseSnapshot,
) {
  const productionNames = productionSnapshot.tables.map((table) => table.name);
  const testNames = testSnapshot.tables.map((table) => table.name);

  if (!sameStringList(productionNames, testNames)) {
    throw new ProductionSnapshotSchemaMismatchError(
      "Production and test table lists differ. Deploy the same migrations to both environments first.",
    );
  }

  for (const productionTable of productionSnapshot.tables) {
    const testTable = testSnapshot.tables.find(
      (table) => table.name === productionTable.name,
    );

    if (
      testTable === undefined ||
      normalizeCreateTableSql(testTable.createSql) !==
        normalizeCreateTableSql(productionTable.createSql)
    ) {
      throw new ProductionSnapshotSchemaMismatchError(
        `Production and test schemas differ for table ${productionTable.name}. Deploy the same migrations to both environments first.`,
      );
    }

    if (!/\bengine\s*=\s*innodb\b/iu.test(productionTable.createSql)) {
      throw new ProductionSnapshotSchemaMismatchError(
        `Table ${productionTable.name} must use InnoDB for atomic snapshot replacement.`,
      );
    }
  }

  const productionMigrations = readMigrationIds(productionSnapshot);
  const testMigrations = readMigrationIds(testSnapshot);

  if (!sameStringList(productionMigrations, testMigrations)) {
    throw new ProductionSnapshotSchemaMismatchError(
      "Production and test migration histories differ. Deploy the same migrations to both environments first.",
    );
  }
}

function readMigrationIds(snapshot: DatabaseSnapshot) {
  const table = snapshot.tables.find((item) => item.name === "schema_migrations");
  const idIndex = table?.columns.indexOf("id") ?? -1;

  if (table === undefined || idIndex < 0) {
    throw new ProductionSnapshotSchemaMismatchError(
      "The schema_migrations table is missing from the database snapshot.",
    );
  }

  return table.rows.map((row) => String(row[idIndex])).sort();
}

function normalizeCreateTableSql(value: string) {
  return value
    .replace(/AUTO_INCREMENT=\d+\s*/giu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function withClearedAuthSessions(snapshot: DatabaseSnapshot): DatabaseSnapshot {
  return {
    tables: snapshot.tables.map((table) =>
      table.name === "auth_sessions" ||
        table.name === "auth_session_notification_deliveries"
        ? { ...table, rows: [] }
        : table,
    ),
  };
}

function countSnapshotRows(snapshot: DatabaseSnapshot) {
  return snapshot.tables.reduce((total, table) => total + table.rows.length, 0);
}

function sameStringList(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) {
    return false;
  }

  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();

  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function quoteIdentifier(value: string) {
  return `\`${value.replaceAll("`", "``")}\``;
}

function readErrorName(error: unknown) {
  return error instanceof Error ? error.name : "UnknownError";
}
