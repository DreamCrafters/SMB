/**
 * Интеграция с 1С, первый этап: просмотр остатков по складу в разрезе
 * номенклатуры. Отчёт приходит выгрузкой из 1С, поэтому дата и счета берутся
 * из самого файла, а не задаются в интерфейсе. Движение по складу за период —
 * следующий этап, поэтому раздел уже разделён на виды отчётов.
 */
export const warehouse1cReportViews = [
  { id: "stock_balances", label: "Остатки" },
  { id: "uploads", label: "Журнал загрузок" },
] as const;

export type Warehouse1cReportView =
  (typeof warehouse1cReportViews)[number]["id"];

/**
 * Журнал приёма: строка на каждый `POST /api/upload-report`, включая
 * отклонённые. Отказ в остатки ничего не пишет и раньше не оставлял следа
 * вообще, поэтому «данные не обновились» было неотличимо от «1С ничего не
 * присылала». Файл сохраняется вместе с записью, чтобы выгрузку можно было
 * скачать и открыть, а не только увидеть её имя.
 */
export const warehouse1cUploadOutcomes = ["accepted", "rejected"] as const;

export type Warehouse1cUploadOutcome =
  (typeof warehouse1cUploadOutcomes)[number];

export type Warehouse1cUpload = {
  id: string;
  receivedAt: string;
  outcome: Warehouse1cUploadOutcome;
  /** Код ответа, который получила 1С: по нему видно причину отказа. */
  statusCode: number;
  fileName: string;
  fileSize?: number;
  /** Оригинал доступен для скачивания: слишком большой файл не сохраняется. */
  hasFile: boolean;
  source?: string;
  sentAt?: string;
  reportDate?: string;
  accounts?: string;
  rowCount?: number;
  /** Причина отказа либо причина, по которой принятый файл не разобран. */
  errorMessage?: string;
};

/**
 * Принятая выгрузка считается разобранной, когда из неё вышли остатки: дату
 * разбор требует всегда, поэтому её наличие и есть признак. Отдельной колонки
 * нет намеренно — она повторяла бы то, что уже видно по данным.
 */
export function isParsedWarehouse1cUpload(upload: Warehouse1cUpload) {
  return upload.outcome === "accepted" && upload.reportDate !== undefined;
}

/**
 * Лист выгрузки как он составлен: строки и ячейки без попытки свести их к
 * номенклатуре и остаткам. 1С меняет структуру отчёта, и нераспознанный файл
 * всё равно должен быть виден целиком — разбор колонок идёт отдельным шагом.
 */
export type Warehouse1cUploadSheetMerge = {
  row: number;
  column: number;
  rowSpan: number;
  columnSpan: number;
};

export type Warehouse1cUploadSheet = {
  name: string;
  rows: string[][];
  /** Объединённые области: шапка над парой колонок, имя над «БУ» и «Кол». */
  merges: Warehouse1cUploadSheetMerge[];
  /** Лист длиннее лимита показа: строки после него не переданы. */
  isTruncated: boolean;
};

export type Warehouse1cUploadSheetsResponse = {
  fileName: string;
  sheets: Warehouse1cUploadSheet[];
};

export type Warehouse1cUploadsResponse = {
  uploads: Warehouse1cUpload[];
  /** Тестовая среда показывает журнал основной базы и выгрузки не принимает. */
  isReadOnlySource?: boolean;
};

/**
 * Счёт готовой продукции выбирается по умолчанию: сводный отчёт 1С содержит
 * несколько счетов, а раздел заводился ради остатков готовой продукции.
 */
export const defaultWarehouse1cAccountCode = "43";
export const defaultWarehouse1cAccountLabel = "Счёт 43 (Готовая продукция)";

export type Warehouse1cAccount = {
  code: string;
  label: string;
};

export type Warehouse1cStockBalance = {
  nomenclature: string;
  /** Десятичное число строкой; пустая строка — остаток в файле не указан. */
  openingBalance: string;
  closingBalance: string;
};

export type Warehouse1cStockReport = {
  accountCode: string;
  accountLabel: string;
  reportDate: string;
  fileName: string;
  importedAt: string;
  balances: Warehouse1cStockBalance[];
};

export type Warehouse1cStockFilters = {
  accountCode?: string;
  reportDate?: string;
};

export type Warehouse1cStockResponse = {
  accounts: Warehouse1cAccount[];
  accountCode: string;
  availableDates: string[];
  report?: Warehouse1cStockReport;
  /** Тестовая среда показывает остатки основной базы и выгрузки не принимает. */
  isReadOnlySource?: boolean;
};

/**
 * Подписи счетов приходят из выгрузки («Счёт 10.01 (Материалы)»), поэтому
 * зашитый список здесь только один — чтобы фильтр не был пустым, пока ни один
 * отчёт не загружен.
 */
export function buildWarehouse1cAccounts(
  stored: readonly Warehouse1cAccount[],
): Warehouse1cAccount[] {
  const accounts = new Map<string, string>([
    [defaultWarehouse1cAccountCode, defaultWarehouse1cAccountLabel],
  ]);

  for (const account of stored) {
    accounts.set(account.code, account.label);
  }

  return [...accounts]
    .map(([code, label]) => ({ code, label }))
    .sort((left, right) => compareAccountCodes(left.code, right.code));
}

export function selectWarehouse1cAccountCode(
  accounts: readonly Warehouse1cAccount[],
  requestedCode: string,
) {
  if (accounts.some((account) => account.code === requestedCode)) {
    return requestedCode;
  }

  return accounts.some(
      (account) => account.code === defaultWarehouse1cAccountCode,
    )
    ? defaultWarehouse1cAccountCode
    : accounts[0]?.code ?? defaultWarehouse1cAccountCode;
}

/** «10.01» и «43» сравниваются по числам, а не посимвольно. */
function compareAccountCodes(left: string, right: string) {
  const leftParts = left.split(".");
  const rightParts = right.split(".");

  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = Number(leftParts[index] ?? 0) - Number(rightParts[index] ?? 0);

    if (Number.isFinite(difference) && difference !== 0) return difference;
  }

  return left.localeCompare(right, "ru");
}
