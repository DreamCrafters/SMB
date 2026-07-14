import { createHash } from "node:crypto";
import type { GoogleSheetsReferenceConfig } from "../config/env.js";
import {
  buildDispatcherSpreadsheetImportPlan,
  dispatcherImportSheetNames,
  scopeDispatcherSpreadsheetImportRecords,
  type DispatcherSpreadsheetImportSheetSummary,
} from "../domain/dispatcherSpreadsheetImport.js";
import type {
  DispatcherImportBusinessAccount,
  DispatcherSpreadsheetImportRepository,
} from "../repositories/dispatcherSpreadsheetImportRepository.js";
import {
  readGoogleSheetsWorkbook,
  type GoogleSheetsWorkbook,
} from "./googleSheetsReference.js";

export type DispatcherSpreadsheetImportPreview = {
  previewToken: string;
  totalRecords: number;
  newRecords: number;
  existingRecords: number;
  sheets: DispatcherSpreadsheetImportSheetSummary[];
  warnings: string[];
};

export type DispatcherSpreadsheetImportService = {
  listBusinessAccounts: () => Promise<DispatcherImportBusinessAccount[]>;
  preview: (value: {
    spreadsheetUrl: string;
    businessAccountId: string;
  }) => Promise<DispatcherSpreadsheetImportPreview>;
  execute: (value: {
    spreadsheetUrl: string;
    businessAccountId: string;
    previewToken: string;
    submittedByAccountId: string;
  }) => Promise<{ totalRecords: number; inserted: number; skipped: number }>;
};

export class DispatcherSpreadsheetImportChangedError extends Error {}

type ReadWorkbook = (
  config: GoogleSheetsReferenceConfig,
  sourceUrl: string,
  sheetTitles: readonly string[],
) => Promise<GoogleSheetsWorkbook>;

export function createDispatcherSpreadsheetImportService(
  config: GoogleSheetsReferenceConfig,
  repository: DispatcherSpreadsheetImportRepository,
  readWorkbook: ReadWorkbook = readGoogleSheetsWorkbook,
): DispatcherSpreadsheetImportService {
  return {
    listBusinessAccounts: repository.listBusinessAccounts,

    async preview(value) {
      await requireBusinessAccount(repository, value.businessAccountId);
      const plan = await readImportPlan(config, value.spreadsheetUrl, readWorkbook);
      const records = scopeDispatcherSpreadsheetImportRecords(
        plan.records,
        value.businessAccountId,
      );
      const uniqueRecords = deduplicateImportRecords(records);
      const existing = await repository.findExistingSourceKeys(
        value.businessAccountId,
        uniqueRecords.records,
      );

      return {
        previewToken: buildPreviewToken(plan.fingerprint, value.businessAccountId),
        totalRecords: records.length,
        newRecords: uniqueRecords.records.length - existing.size,
        existingRecords: existing.size + uniqueRecords.duplicateCount,
        sheets: plan.sheets,
        warnings: plan.warnings,
      };
    },

    async execute(value) {
      await requireBusinessAccount(repository, value.businessAccountId);
      const plan = await readImportPlan(config, value.spreadsheetUrl, readWorkbook);
      const expectedToken = buildPreviewToken(
        plan.fingerprint,
        value.businessAccountId,
      );

      if (value.previewToken !== expectedToken) {
        throw new DispatcherSpreadsheetImportChangedError(
          "Таблица изменилась после предпросмотра. Проверьте её ещё раз.",
        );
      }

      const records = scopeDispatcherSpreadsheetImportRecords(
        plan.records,
        value.businessAccountId,
      );
      const uniqueRecords = deduplicateImportRecords(records);
      const result = await repository.importRecords({
        businessAccountId: value.businessAccountId,
        submittedByAccountId: value.submittedByAccountId,
        records: uniqueRecords.records,
      });

      return {
        totalRecords: records.length,
        inserted: result.inserted,
        skipped: result.skipped + uniqueRecords.duplicateCount,
      };
    },
  };
}

function deduplicateImportRecords<T extends {
  sourceKey: string;
  dedupeKey: string | null;
}>(records: readonly T[]) {
  const seen = new Set<string>();
  const uniqueRecords: T[] = [];

  for (const record of records) {
    const identity =
      record.dedupeKey === null
        ? `source:${record.sourceKey}`
        : `record:${record.dedupeKey}`;

    if (seen.has(identity)) {
      continue;
    }

    seen.add(identity);
    uniqueRecords.push(record);
  }

  return {
    records: uniqueRecords,
    duplicateCount: records.length - uniqueRecords.length,
  };
}

async function readImportPlan(
  config: GoogleSheetsReferenceConfig,
  spreadsheetUrl: string,
  readWorkbook: ReadWorkbook,
) {
  if (spreadsheetUrl.length > 2_000) {
    throw new Error("Ссылка Google Sheets слишком длинная.");
  }

  const workbook = await readWorkbook(
    config,
    spreadsheetUrl,
    dispatcherImportSheetNames,
  );

  return buildDispatcherSpreadsheetImportPlan(workbook);
}

async function requireBusinessAccount(
  repository: DispatcherSpreadsheetImportRepository,
  businessAccountId: string,
) {
  if (businessAccountId.length === 0 || businessAccountId.length > 120) {
    throw new Error("Выберите бизнес-аккаунт для импорта.");
  }

  const accounts = await repository.listBusinessAccounts();

  if (!accounts.some((account) => account.id === businessAccountId)) {
    throw new Error("Выбранный бизнес-аккаунт не найден или отключён.");
  }
}

function buildPreviewToken(fingerprint: string, businessAccountId: string) {
  return createHash("sha256")
    .update(`${businessAccountId}:${fingerprint}`)
    .digest("hex");
}
