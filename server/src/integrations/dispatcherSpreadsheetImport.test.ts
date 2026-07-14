import assert from "node:assert/strict";
import test from "node:test";
import type { GoogleSheetsReferenceConfig } from "../config/env.js";
import type { DispatcherSpreadsheetImportRepository } from "../repositories/dispatcherSpreadsheetImportRepository.js";
import {
  createDispatcherSpreadsheetImportService,
  DispatcherSpreadsheetImportChangedError,
} from "./dispatcherSpreadsheetImport.js";

const config = {
  authMode: "service_account",
} as GoogleSheetsReferenceConfig;

test("dispatcher spreadsheet import previews existing rows and imports scoped records", async () => {
  let importedSourceKey = "";
  const repository: DispatcherSpreadsheetImportRepository = {
    async listBusinessAccounts() {
      return [{ id: "business-main", displayName: "Основной бизнес" }];
    },
    async findExistingSourceKeys(_businessAccountId, records) {
      return new Set(records.slice(0, 1).map((record) => record.sourceKey));
    },
    async importRecords(value) {
      importedSourceKey = value.records[0]?.sourceKey ?? "";
      return { inserted: value.records.length, skipped: 0 };
    },
  };
  const service = createDispatcherSpreadsheetImportService(
    config,
    repository,
    async () => buildWorkbook("10.06.2026 07:42"),
  );

  const preview = await service.preview({
    spreadsheetUrl: "https://docs.google.com/spreadsheets/d/source_sheet_123/edit",
    businessAccountId: "business-main",
  });
  const result = await service.execute({
    spreadsheetUrl: "https://docs.google.com/spreadsheets/d/source_sheet_123/edit",
    businessAccountId: "business-main",
    previewToken: preview.previewToken,
    submittedByAccountId: "admin-access",
  });

  assert.equal(preview.totalRecords, 2);
  assert.equal(preview.existingRecords, 1);
  assert.equal(preview.newRecords, 1);
  assert.equal(result.inserted, 2);
  assert.match(importedSourceKey, /^business-main:/);
});

test("dispatcher spreadsheet import rejects commit when source changed", async () => {
  let exitAt = "10.06.2026 07:42";
  const repository: DispatcherSpreadsheetImportRepository = {
    async listBusinessAccounts() {
      return [{ id: "business-main", displayName: "Основной бизнес" }];
    },
    async findExistingSourceKeys() {
      return new Set();
    },
    async importRecords() {
      throw new Error("must not import changed source");
    },
  };
  const service = createDispatcherSpreadsheetImportService(
    config,
    repository,
    async () => buildWorkbook(exitAt),
  );
  const preview = await service.preview({
    spreadsheetUrl: "https://docs.google.com/spreadsheets/d/source_sheet_456/edit",
    businessAccountId: "business-main",
  });

  exitAt = "10.06.2026 08:00";

  await assert.rejects(
    service.execute({
      spreadsheetUrl: "https://docs.google.com/spreadsheets/d/source_sheet_456/edit",
      businessAccountId: "business-main",
      previewToken: preview.previewToken,
      submittedByAccountId: "admin-access",
    }),
    DispatcherSpreadsheetImportChangedError,
  );
});

function buildWorkbook(exitAt: string) {
  return {
    spreadsheetId: "source_sheet_123",
    rowsBySheet: {
      Оборудование: [[
        "Дата внесения данных в отчет", "Дата отчета", "Месяц отчета",
        "Оборудование", "Выработка, тонн", "Причина простоя",
        "Время простоя, часов", "Примечание",
      ]],
      Инциденты: [[
        "№", "Дата и время", "Место", "Тип", "Описание", "Крит.",
        "Ответственный за регистрацию", "Статус", "Меры оперативные",
        "Причины", "Меры после закрытия", "Примечание",
        "Дата и время закрытия", "Расходы на инцидент",
        "Ответственный о внесении записи о закрытии", "Запись о закрытии",
      ]],
      Посетители: [
        [
          "Дата время", "ФИО посетителя", "Должность", "Организация",
          "Цель визита", "Кого посещает", "Дата время выхода", "Примечание",
        ],
        ["09.06.2026 14:16", "Иванов", "", "Организация", "", "", exitAt, ""],
      ],
    },
  };
}
