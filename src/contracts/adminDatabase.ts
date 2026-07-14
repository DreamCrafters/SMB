export type AdminDatabaseCellValue = string | null;

export type AdminDatabaseValueFormat =
  | "text"
  | "status"
  | "date"
  | "date_time"
  | "number";

export type AdminDatabaseColumn = {
  name: string;
  label: string;
  format: AdminDatabaseValueFormat;
  editable: boolean;
  multiline: boolean;
  nullable: boolean;
};

export type AdminDatabaseTable = {
  name: string;
  label: string;
  rowCount: number | null;
  columns: AdminDatabaseColumn[];
  primaryKey: string[];
  canDelete: boolean;
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
