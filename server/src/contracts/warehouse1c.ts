/**
 * Интеграция с 1С, первый этап: просмотр остатков по складу в разрезе
 * номенклатуры. Отчёт приходит выгрузкой из 1С, поэтому дата и счета берутся
 * из самого файла, а не задаются в интерфейсе. Движение по складу за период —
 * следующий этап, поэтому раздел уже разделён на виды отчётов.
 */
export const warehouse1cReportViews = [
  { id: "stock_balances", label: "Остатки" },
] as const;

export type Warehouse1cReportView =
  (typeof warehouse1cReportViews)[number]["id"];

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
