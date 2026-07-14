export type AdminDispatcherImportSheetSummary = {
  sheetName: "Оборудование" | "Инциденты" | "Посетители";
  sourceRows: number;
  importRecords: number;
  skippedRows: number;
};

export type AdminDispatcherImportPreviewResponse = {
  previewToken: string;
  totalRecords: number;
  newRecords: number;
  existingRecords: number;
  sheets: AdminDispatcherImportSheetSummary[];
  warnings: string[];
};

export type AdminDispatcherImportExecuteResponse = {
  totalRecords: number;
  inserted: number;
  skipped: number;
};
