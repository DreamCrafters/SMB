import { createHash } from "node:crypto";
import type { GoogleSheetsReferenceConfig } from "../config/env.js";
import {
  buildDispatcherSpreadsheetImportPlan,
  dispatcherImportSheetNames,
  scopeDispatcherSpreadsheetImportRecords,
  type DispatcherSpreadsheetImportSheetSummary,
} from "../domain/dispatcherSpreadsheetImport.js";
import type {
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
  preview: (value: {
    spreadsheetUrl: string;
  }) => Promise<DispatcherSpreadsheetImportPreview>;
  execute: (value: {
    spreadsheetUrl: string;
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
    async preview(value) {
      const businessAccountId = await requireSingleBusinessAccount(repository);
      const plan = await readImportPlan(config, value.spreadsheetUrl, readWorkbook);
      const records = scopeDispatcherSpreadsheetImportRecords(
        plan.records,
        businessAccountId,
      );
      const uniqueRecords = deduplicateImportRecords(records);
      const existing = await repository.findExistingSourceKeys(
        businessAccountId,
        uniqueRecords.records,
      );

      return {
        previewToken: buildPreviewToken(plan.fingerprint, businessAccountId),
        totalRecords: records.length,
        newRecords: uniqueRecords.records.length - existing.size,
        existingRecords: existing.size + uniqueRecords.duplicateCount,
        sheets: plan.sheets,
        warnings: plan.warnings,
      };
    },

    async execute(value) {
      const businessAccountId = await requireSingleBusinessAccount(repository);
      const plan = await readImportPlan(config, value.spreadsheetUrl, readWorkbook);
      const expectedToken = buildPreviewToken(
        plan.fingerprint,
        businessAccountId,
      );

      if (value.previewToken !== expectedToken) {
        throw new DispatcherSpreadsheetImportChangedError(
          "Таблица изменилась после предпросмотра. Проверьте её ещё раз.",
        );
      }

      const records = scopeDispatcherSpreadsheetImportRecords(
        plan.records,
        businessAccountId,
      );
      const uniqueRecords = deduplicateImportRecords(records);
      const result = await repository.importRecords({
        businessAccountId,
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

async function requireSingleBusinessAccount(
  repository: DispatcherSpreadsheetImportRepository,
) {
  const accounts = await repository.listBusinessAccounts();

  if (accounts.length === 0) {
    throw new Error("Нет активного бизнес-аккаунта для импорта.");
  }

  if (accounts.length > 1) {
    throw new Error(
      "Импорт доступен только при одном активном бизнес-аккаунте.",
    );
  }

  return accounts[0]?.id ?? "";
}

function buildPreviewToken(fingerprint: string, businessAccountId: string) {
  return createHash("sha256")
    .update(`${businessAccountId}:${fingerprint}`)
    .digest("hex");
}
