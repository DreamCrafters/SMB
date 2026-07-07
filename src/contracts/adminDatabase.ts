export type AdminDatabaseCellValue = string | null;

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

export type AdminDatabaseRow = {
  primaryKey: Record<string, AdminDatabaseCellValue>;
  values: Record<string, AdminDatabaseCellValue>;
};

export type AdminDatabaseTablesResponse = {
  tables: AdminDatabaseTable[];
};

export type AdminDatabaseRowsResponse = {
  table: AdminDatabaseTable;
  rows: AdminDatabaseRow[];
  limit: number;
  offset: number;
};
