import type { RowDataPacket } from "mysql2/promise";
import type { DatabasePool } from "../db/pool.js";

export type AdminDatabaseColumn = {
  name: string;
  dataType: string;
  columnType: string;
  nullable: boolean;
  primaryKey: boolean;
  defaultValue: string | null;
  extra: string;
};

export type AdminDatabaseTable = {
  name: string;
  rowCount: number | null;
  columns: AdminDatabaseColumn[];
  primaryKey: string[];
};

export type AdminDatabaseCellValue = string | null;

export type AdminDatabaseRow = {
  primaryKey: Record<string, AdminDatabaseCellValue>;
  values: Record<string, AdminDatabaseCellValue>;
};

export type AdminDatabaseTableRows = {
  table: AdminDatabaseTable;
  rows: AdminDatabaseRow[];
  limit: number;
  offset: number;
};

export type AdminDatabaseUpdate = {
  tableName: string;
  primaryKey: Record<string, AdminDatabaseCellValue>;
  values: Record<string, AdminDatabaseCellValue>;
};

export type AdminDatabaseDelete = {
  tableName: string;
  primaryKey: Record<string, AdminDatabaseCellValue>;
};

export type AdminDatabaseRepository = {
  listTables: () => Promise<AdminDatabaseTable[]>;
  listRows: (
    tableName: string,
    options?: {
      limit?: number;
      offset?: number;
    },
  ) => Promise<AdminDatabaseTableRows>;
  updateRow: (value: AdminDatabaseUpdate) => Promise<void>;
  deleteRow: (value: AdminDatabaseDelete) => Promise<void>;
};

type TableRow = RowDataPacket & {
  table_name: string;
  table_rows: number | string | null;
};

type ColumnRow = RowDataPacket & {
  column_name: string;
  data_type: string;
  column_type: string;
  is_nullable: "YES" | "NO";
  column_key: string;
  column_default: string | null;
  extra: string;
};

type RawDatabaseRow = RowDataPacket & Record<string, unknown>;

const identifierPattern = /^[A-Za-z0-9_]+$/;

export function createAdminDatabaseRepository(
  pool: DatabasePool,
): AdminDatabaseRepository {
  async function listTables() {
    const [rows] = await pool.query<TableRow[]>(
      `
        select table_name, table_rows
        from information_schema.tables
        where table_schema = database()
          and table_type = 'BASE TABLE'
        order by table_name
      `,
    );

    return Promise.all(
      rows.map(async (row) => {
        const columns = await readColumns(row.table_name);

        return {
          name: row.table_name,
          rowCount:
            row.table_rows === null ? null : Number(row.table_rows),
          columns,
          primaryKey: columns
            .filter((column) => column.primaryKey)
            .map((column) => column.name),
        };
      }),
    );
  }

  async function listRows(
    tableName: string,
    {
      limit = 100,
      offset = 0,
    }: {
      limit?: number;
      offset?: number;
    } = {},
  ) {
    const table = await readTable(tableName);
    const safeLimit = Math.min(Math.max(limit, 1), 500);
    const safeOffset = Math.max(offset, 0);
    const orderBy =
      table.primaryKey.length === 0
        ? ""
        : `order by ${table.primaryKey.map(quoteIdentifier).join(", ")}`;
    const [rows] = await pool.query<RawDatabaseRow[]>(
      `
        select *
        from ${quoteIdentifier(table.name)}
        ${orderBy}
        limit ?
        offset ?
      `,
      [safeLimit, safeOffset],
    );

    return {
      table,
      rows: rows.map((row) => mapDatabaseRow(row, table)),
      limit: safeLimit,
      offset: safeOffset,
    };
  }

  async function updateRow(value: AdminDatabaseUpdate) {
    const table = await readTable(value.tableName);

    assertPrimaryKey(table, value.primaryKey);

    const columnByName = new Map(table.columns.map((column) => [column.name, column]));
    const updateEntries = Object.entries(value.values).filter(([columnName]) => {
      const column = columnByName.get(columnName);

      return column !== undefined && !column.primaryKey;
    });

    if (updateEntries.length === 0) {
      throw new Error("No editable values were provided.");
    }

    const assignments: string[] = [];
    const assignmentValues: unknown[] = [];

    for (const [columnName, rawValue] of updateEntries) {
      const column = columnByName.get(columnName);

      if (column === undefined) {
        throw new Error(`Unknown column: ${columnName}`);
      }

      assignments.push(`${quoteIdentifier(column.name)} = ?`);
      assignmentValues.push(normalizeDatabaseValue(rawValue, column));
    }

    await pool.query(
      `
        update ${quoteIdentifier(table.name)}
        set ${assignments.join(", ")}
        where ${buildPrimaryKeyWhereClause(table)}
      `,
      [...assignmentValues, ...readPrimaryKeyValues(table, value.primaryKey)],
    );
  }

  async function deleteRow(value: AdminDatabaseDelete) {
    const table = await readTable(value.tableName);

    assertPrimaryKey(table, value.primaryKey);

    await pool.query(
      `
        delete from ${quoteIdentifier(table.name)}
        where ${buildPrimaryKeyWhereClause(table)}
        limit 1
      `,
      readPrimaryKeyValues(table, value.primaryKey),
    );
  }

  async function readTable(tableName: string) {
    const tables = await listTables();
    const table = tables.find((item) => item.name === tableName);

    if (table === undefined) {
      throw new Error("Unknown database table.");
    }

    return table;
  }

  async function readColumns(tableName: string) {
    assertSafeIdentifier(tableName);

    const [rows] = await pool.query<ColumnRow[]>(
      `
        select
          column_name,
          data_type,
          column_type,
          is_nullable,
          column_key,
          column_default,
          extra
        from information_schema.columns
        where table_schema = database()
          and table_name = ?
        order by ordinal_position
      `,
      [tableName],
    );

    return rows.map((row) => ({
      name: row.column_name,
      dataType: row.data_type,
      columnType: row.column_type,
      nullable: row.is_nullable === "YES",
      primaryKey: row.column_key === "PRI",
      defaultValue: row.column_default,
      extra: row.extra,
    }));
  }

  return {
    listTables,
    listRows,
    updateRow,
    deleteRow,
  };
}

function mapDatabaseRow(row: RawDatabaseRow, table: AdminDatabaseTable) {
  const values = Object.fromEntries(
    table.columns.map((column) => [
      column.name,
      serializeDatabaseValue(row[column.name]),
    ]),
  );
  const primaryKey = Object.fromEntries(
    table.primaryKey.map((columnName) => [columnName, values[columnName] ?? null]),
  );

  return {
    primaryKey,
    values,
  };
}

function serializeDatabaseValue(value: unknown): AdminDatabaseCellValue {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function normalizeDatabaseValue(
  value: AdminDatabaseCellValue,
  column: AdminDatabaseColumn,
) {
  if (value === null) {
    if (!column.nullable) {
      throw new Error(`${column.name} cannot be null.`);
    }

    return null;
  }

  if (column.dataType === "json") {
    try {
      return JSON.stringify(JSON.parse(value));
    } catch {
      throw new Error(`${column.name} must contain valid JSON.`);
    }
  }

  return value;
}

function assertPrimaryKey(
  table: AdminDatabaseTable,
  primaryKey: Record<string, AdminDatabaseCellValue>,
) {
  if (table.primaryKey.length === 0) {
    throw new Error("Selected table does not have a primary key.");
  }

  for (const columnName of table.primaryKey) {
    const value = primaryKey[columnName];

    if (value === undefined || value === null || value.length === 0) {
      throw new Error("Primary key value is missing.");
    }
  }
}

function buildPrimaryKeyWhereClause(table: AdminDatabaseTable) {
  return table.primaryKey
    .map((columnName) => `${quoteIdentifier(columnName)} = ?`)
    .join(" and ");
}

function readPrimaryKeyValues(
  table: AdminDatabaseTable,
  primaryKey: Record<string, AdminDatabaseCellValue>,
) {
  return table.primaryKey.map((columnName) => primaryKey[columnName]);
}

function quoteIdentifier(value: string) {
  assertSafeIdentifier(value);

  return `\`${value}\``;
}

function assertSafeIdentifier(value: string) {
  if (!identifierPattern.test(value)) {
    throw new Error("Unsafe database identifier.");
  }
}
