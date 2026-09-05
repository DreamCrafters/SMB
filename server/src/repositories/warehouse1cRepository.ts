import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import type {
  Warehouse1cAccount,
  Warehouse1cStockBalance,
  Warehouse1cStockReport,
} from "../contracts/warehouse1c.js";
import type { DatabasePool } from "../db/pool.js";

export type Warehouse1cStockReportImport = {
  accountCode: string;
  accountLabel: string;
  reportDate: string;
  fileName: string;
  fileChecksum: string;
  fileSize: number;
  source?: string;
  sentAt?: string;
  balances: readonly Warehouse1cStockBalance[];
};

export type Warehouse1cStockReportImportResult = {
  reportId: string;
  rowCount: number;
  /** Отчёт за эту дату и счёт уже был загружен и заменён новым файлом. */
  isReplaced: boolean;
};

/**
 * Тестовая среда читает остатки из основной базы: поток из 1С остаётся один, а
 * сохранять в чужую базу нельзя — отсюда явный флаг вместо молчаливого отказа.
 */
export class Warehouse1cReadOnlyError extends Error {
  constructor() {
    super("Хранилище остатков 1С открыто только для чтения.");
    this.name = "Warehouse1cReadOnlyError";
  }
}

export type Warehouse1cRepository = {
  isReadOnly: boolean;
  listAccounts: () => Promise<Warehouse1cAccount[]>;
  listReportDates: (accountCode: string) => Promise<string[]>;
  readStockReport: (input: {
    accountCode: string;
    reportDate?: string;
  }) => Promise<Warehouse1cStockReport | undefined>;
  saveStockReport: (
    input: Warehouse1cStockReportImport,
  ) => Promise<Warehouse1cStockReportImportResult>;
};

type ReportRow = {
  id: string;
  account_code: string;
  account_label: string;
  report_date: Date | string;
  file_name: string;
  imported_at: Date | string;
} & RowDataPacket;

type BalanceRow = {
  nomenclature: string;
  opening_balance: string | number | null;
  closing_balance: string | number | null;
} & RowDataPacket;

type AccountRow = {
  account_code: string;
  account_label: string;
} & RowDataPacket;
type DateRow = { report_date: Date | string } & RowDataPacket;

type RepositoryOptions = {
  createId?: () => string;
  now?: () => Date;
  /** Пул указывает на чужую базу: читаем, но не пишем. */
  isReadOnly?: boolean;
};

/** Столько строк уходит в базу одним `insert`. */
const balanceInsertChunkSize = 500;

export function createWarehouse1cRepository(
  pool: DatabasePool,
  {
    createId = randomUUID,
    now = () => new Date(),
    isReadOnly = false,
  }: RepositoryOptions = {},
): Warehouse1cRepository {
  return {
    isReadOnly,

    /** Подпись счёта берётся из самой свежей выгрузки этого счёта. */
    async listAccounts() {
      const [rows] = await pool.query<AccountRow[]>(
        `select account_code,
          substring_index(
            group_concat(account_label order by report_date desc separator 0x1f),
            0x1f,
            1
          ) as account_label
        from warehouse_1c_stock_reports
        group by account_code
        order by account_code asc`,
      );

      return rows.map((row) => ({
        code: row.account_code,
        label: row.account_label,
      }));
    },

    async listReportDates(accountCode) {
      const [rows] = await pool.query<DateRow[]>(
        `select report_date
        from warehouse_1c_stock_reports
        where account_code = ?
        order by report_date desc`,
        [accountCode],
      );

      return rows.map((row) => formatDate(row.report_date));
    },

    async readStockReport({ accountCode, reportDate }) {
      const [reports] = await pool.query<ReportRow[]>(
        `select id, account_code, account_label, report_date, file_name, imported_at
        from warehouse_1c_stock_reports
        where account_code = ?
          ${reportDate === undefined ? "" : "and report_date = ?"}
        order by report_date desc
        limit 1`,
        reportDate === undefined ? [accountCode] : [accountCode, reportDate],
      );
      const report = reports[0];

      if (report === undefined) return undefined;

      const [balances] = await pool.query<BalanceRow[]>(
        `select nomenclature, opening_balance, closing_balance
        from warehouse_1c_stock_balances
        where report_id = ?
        order by row_order asc`,
        [report.id],
      );

      return {
        accountCode: report.account_code,
        accountLabel: report.account_label,
        reportDate: formatDate(report.report_date),
        fileName: report.file_name,
        importedAt: toIsoString(report.imported_at),
        balances: balances.map((row) => ({
          nomenclature: row.nomenclature,
          openingBalance: normalizeDecimal(row.opening_balance),
          closingBalance: normalizeDecimal(row.closing_balance),
        })),
      };
    },

    /**
     * Повторная выгрузка за ту же дату и счёт заменяет предыдущую целиком:
     * 1С присылает срез остатков, а не приращение, поэтому слияние строк дало
     * бы номенклатуру, которой на складе уже нет. Уникального ключа по
     * наименованию у строк нет намеренно: повторы отсеивает разбор отчёта, а
     * `utf8mb4_unicode_ci` уронил бы вставку на двух написаниях одного имени.
     */
    async saveStockReport(input) {
      if (isReadOnly) throw new Warehouse1cReadOnlyError();

      const importedAt = now().toISOString();
      const [existing] = await pool.query<ReportRow[]>(
        `select id, account_code, account_label, report_date, file_name, imported_at
        from warehouse_1c_stock_reports
        where account_code = ? and report_date = ?
        limit 1
        for update`,
        [input.accountCode, input.reportDate],
      );
      const previous = existing[0];
      const reportId = previous?.id ?? createId();

      if (previous === undefined) {
        await pool.query(
          `insert into warehouse_1c_stock_reports (
            id,
            account_code,
            account_label,
            report_date,
            file_name,
            file_checksum,
            file_size,
            source,
            sent_at,
            row_count,
            imported_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            reportId,
            input.accountCode,
            input.accountLabel,
            input.reportDate,
            input.fileName,
            input.fileChecksum,
            input.fileSize,
            emptyToNull(input.source ?? ""),
            emptyToNull(input.sentAt ?? ""),
            input.balances.length,
            importedAt,
          ],
        );
      } else {
        await pool.query(
          `delete from warehouse_1c_stock_balances where report_id = ?`,
          [reportId],
        );
        await pool.query(
          `update warehouse_1c_stock_reports
          set account_label = ?,
            file_name = ?,
            file_checksum = ?,
            file_size = ?,
            source = ?,
            sent_at = ?,
            row_count = ?,
            imported_at = ?
          where id = ?`,
          [
            input.accountLabel,
            input.fileName,
            input.fileChecksum,
            input.fileSize,
            emptyToNull(input.source ?? ""),
            emptyToNull(input.sentAt ?? ""),
            input.balances.length,
            importedAt,
            reportId,
          ],
        );
      }

      for (
        let offset = 0;
        offset < input.balances.length;
        offset += balanceInsertChunkSize
      ) {
        const chunk = input.balances.slice(
          offset,
          offset + balanceInsertChunkSize,
        );

        await pool.query(
          `insert into warehouse_1c_stock_balances (
            id,
            report_id,
            row_order,
            nomenclature,
            opening_balance,
            closing_balance
          ) values ${chunk.map(() => "(?, ?, ?, ?, ?, ?)").join(", ")}`,
          chunk.flatMap((balance, index) => [
            createId(),
            reportId,
            offset + index,
            balance.nomenclature,
            emptyToNull(balance.openingBalance),
            emptyToNull(balance.closingBalance),
          ]),
        );
      }

      return {
        reportId,
        rowCount: input.balances.length,
        isReplaced: previous !== undefined,
      };
    },
  };
}

function formatDate(value: Date | string) {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
}

function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : String(value);
}

function emptyToNull(value: string) {
  return value === "" ? null : value;
}

function normalizeDecimal(value: string | number | null) {
  if (value === null) return "";

  const text = String(value);

  if (!text.includes(".")) return text;

  const normalized = text.replace(/0+$/u, "").replace(/[.]$/u, "");

  return normalized === "-0" ? "0" : normalized;
}
