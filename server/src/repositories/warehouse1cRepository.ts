import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import type {
  Warehouse1cAccount,
  Warehouse1cStockBalance,
  Warehouse1cStockReport,
  Warehouse1cUpload,
  Warehouse1cUploadOutcome,
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

/** Одна попытка приёма выгрузки: и принятая, и отклонённая. */
export type Warehouse1cUploadRecord = {
  outcome: Warehouse1cUploadOutcome;
  statusCode: number;
  fileName: string;
  fileSize?: number;
  fileChecksum?: string;
  fileContent?: Buffer;
  source?: string;
  sentAt?: string;
  reportDate?: string;
  accounts?: string;
  rowCount?: number;
  errorMessage?: string;
};

export type Warehouse1cUploadFile = {
  fileName: string;
  content: Buffer;
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
  recordUpload: (input: Warehouse1cUploadRecord) => Promise<void>;
  listUploads: (limit: number) => Promise<Warehouse1cUpload[]>;
  readUploadFile: (id: string) => Promise<Warehouse1cUploadFile | undefined>;
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

type UploadRow = {
  id: string;
  received_at: Date | string;
  outcome: string;
  status_code: number;
  file_name: string | null;
  file_size: number | null;
  source: string | null;
  sent_at: string | null;
  report_date: Date | string | null;
  accounts: string | null;
  row_count: number | null;
  error_message: string | null;
  has_file: number;
} & RowDataPacket;

type UploadFileRow = {
  file_name: string | null;
  file_content: Buffer | null;
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

/**
 * Больше этого размера файл в журнал не кладётся: реальная выгрузка весит
 * сотни килобайт, а blob под лимит приёмника в 20 МБ упёрся бы в
 * `max_allowed_packet` и уронил бы запись журнала вместе с самим импортом.
 * Запись при этом сохраняется — без содержимого.
 */
const maxStoredUploadBytes = 8_000_000;

/** Журнал приёма читается страницей: он растёт по выгрузке в день. */
export const maxWarehouse1cUploadListSize = 200;

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

    /**
     * Журнал пишется и для отклонённой выгрузки, поэтому запись не привязана к
     * отчёту. В режиме чтения запись пропускается молча: писать в чужую базу
     * нельзя, а сам приёмник в этом режиме и так отвечает `409`.
     */
    async recordUpload(input) {
      if (isReadOnly) return;

      const content = input.fileContent !== undefined &&
          input.fileContent.length <= maxStoredUploadBytes
        ? input.fileContent
        : null;

      await pool.query(
        `insert into warehouse_1c_uploads (
          id,
          received_at,
          outcome,
          status_code,
          file_name,
          file_size,
          file_checksum,
          file_content,
          source,
          sent_at,
          report_date,
          accounts,
          row_count,
          error_message
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          createId(),
          now().toISOString(),
          input.outcome,
          input.statusCode,
          emptyToNull(input.fileName),
          input.fileSize ?? null,
          emptyToNull(input.fileChecksum ?? ""),
          content,
          emptyToNull(input.source ?? ""),
          emptyToNull(input.sentAt ?? ""),
          emptyToNull(input.reportDate ?? ""),
          emptyToNull(input.accounts ?? ""),
          input.rowCount ?? null,
          emptyToNull(input.errorMessage ?? ""),
        ],
      );
    },

    async listUploads(limit) {
      const [rows] = await pool.query<UploadRow[]>(
        `select id,
          received_at,
          outcome,
          status_code,
          file_name,
          file_size,
          source,
          sent_at,
          report_date,
          accounts,
          row_count,
          error_message,
          file_content is not null as has_file
        from warehouse_1c_uploads
        order by received_at desc, sequence_id desc
        limit ?`,
        [Math.min(Math.max(Math.trunc(limit), 1), maxWarehouse1cUploadListSize)],
      );

      return rows.map((row) => ({
        id: row.id,
        receivedAt: toIsoString(row.received_at),
        outcome: row.outcome === "accepted" ? "accepted" : "rejected",
        statusCode: row.status_code,
        fileName: row.file_name ?? "",
        hasFile: Number(row.has_file) === 1,
        ...(row.file_size === null ? {} : { fileSize: row.file_size }),
        ...(row.source === null ? {} : { source: row.source }),
        ...(row.sent_at === null ? {} : { sentAt: row.sent_at }),
        ...(row.report_date === null
          ? {}
          : { reportDate: formatDate(row.report_date) }),
        ...(row.accounts === null ? {} : { accounts: row.accounts }),
        ...(row.row_count === null ? {} : { rowCount: row.row_count }),
        ...(row.error_message === null
          ? {}
          : { errorMessage: row.error_message }),
      }));
    },

    async readUploadFile(id) {
      const [rows] = await pool.query<UploadFileRow[]>(
        `select file_name, file_content
        from warehouse_1c_uploads
        where id = ?
        limit 1`,
        [id],
      );
      const row = rows[0];

      if (row?.file_content == null) return undefined;

      return {
        fileName: row.file_name ?? "report.xlsx",
        content: row.file_content,
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
