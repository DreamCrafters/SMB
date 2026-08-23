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
  | "datetime-local"
  | "production_brand";

export type AdminDatabaseEditorField = {
  name: string;
  label: string;
  inputType: AdminDatabaseEditorInputType;
  required: boolean;
  options: Array<{ value: string; label: string }>;
  value: AdminDatabaseCellValue;
};

export type AdminDatabaseFilterOption = {
  value: string;
  label: string;
};

/**
 * Набор фильтров и сортировок, которые раздел поддерживает на сервере. Пустой
 * объект означает, что раздел фильтруется только общим поиском.
 */
export type AdminDatabaseTableControls = {
  section?: { label: string; options: AdminDatabaseFilterOption[] };
  eventDate?: { label: string };
  sort?: { label: string; options: AdminDatabaseFilterOption[] };
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
  controls: AdminDatabaseTableControls;
};

export type AdminDatabaseMergeTarget = {
  primaryKey: Record<string, AdminDatabaseCellValue>;
  label: string;
};

export type AdminDatabaseRow = {
  primaryKey: Record<string, AdminDatabaseCellValue>;
  values: Record<string, AdminDatabaseCellValue>;
  editorFields: AdminDatabaseEditorField[];
  /**
   * Строки одной отправки. Дневной отчёт оборудования сохраняется по записи на
   * единицу оборудования, а показывается одной группой.
   */
  group?: { key: string; label: string };
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

export type ProductionSnapshotStatusResponse = {
  available: boolean;
  inProgress: boolean;
  confirmationPhrase: string;
};

export type ProductionSnapshotResponse = {
  ok: true;
  tableCount: number;
  rowCount: number;
  authSessionsCleared: true;
};
