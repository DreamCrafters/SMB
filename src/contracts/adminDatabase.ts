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

export type AdminDatabaseEditorInputType =
  | "text"
  | "textarea"
  | "select"
  | "number"
  | "date"
  | "month"
  | "datetime-local";

export type AdminDatabaseEditorField = {
  name: string;
  label: string;
  inputType: AdminDatabaseEditorInputType;
  required: boolean;
  options: Array<{ value: string; label: string }>;
  value: AdminDatabaseCellValue;
};

export type AdminDatabaseTable = {
  name: string;
  label: string;
  rowCount: number | null;
  columns: AdminDatabaseColumn[];
  primaryKey: string[];
  canDelete: boolean;
  canClear: boolean;
  canMerge: boolean;
};

export type AdminDatabaseMergeTarget = {
  primaryKey: Record<string, AdminDatabaseCellValue>;
  label: string;
};

export type AdminDatabaseRow = {
  primaryKey: Record<string, AdminDatabaseCellValue>;
  values: Record<string, AdminDatabaseCellValue>;
  editorFields: AdminDatabaseEditorField[];
};

export type AdminDatabaseTablesResponse = {
  tables: AdminDatabaseTable[];
};

export type AdminDatabaseRowsResponse = {
  table: AdminDatabaseTable;
  rows: AdminDatabaseRow[];
  mergeTargets: AdminDatabaseMergeTarget[];
  limit: number;
  offset: number;
};
