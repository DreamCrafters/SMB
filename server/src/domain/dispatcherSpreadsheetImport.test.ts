import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDispatcherSpreadsheetImportPlan,
  DispatcherSpreadsheetImportFormatError,
} from "./dispatcherSpreadsheetImport.js";

const equipmentHeaders = [
  "Дата внесения данных в отчет",
  "Дата отчета",
  "Месяц отчета",
  "Оборудование",
  "Выработка, тонн",
  "Причина простоя",
  "Время простоя, часов",
  "Примечание",
];
const incidentHeaders = [
  "№",
  "Дата и время",
  "Место",
  "Тип",
  "Описание",
  "Крит.",
  "Ответственный за регистрацию",
  "Статус",
  "Меры оперативные",
  "Причины",
  "Меры после закрытия",
  "Примечание",
  "Дата и время закрытия",
  "Расходы на инцидент",
  "Ответственный о внесении записи о закрытии",
  "Запись о закрытии",
];
const visitorHeaders = [
  "Дата время",
  "ФИО посетителя",
  "Должность",
  "Организация",
  "Цель визита",
  "Кого посещает",
  "Дата время выхода",
  "Примечание",
];

test("dispatcher spreadsheet import maps all three sheets and lifecycle rows", () => {
  const plan = buildDispatcherSpreadsheetImportPlan({
    spreadsheetId: "spreadsheet_test_123",
    rowsBySheet: {
      Оборудование: [
        equipmentHeaders,
        ["46175.761739849535", "46175", "46174", "Пресс №1", "12,5", "", "", ""],
      ],
      Инциденты: [
        incidentHeaders,
        [
          "INC-2026-1",
          "03.06.2026 09:55:00",
          "Цех",
          "Поломка оборудования по мех. части",
          "Описание",
          "Средний",
          "Ответственный",
          "Закрыт",
          "Меры",
          "Причина",
          "Профилактика",
          "Примечание",
          "2026-06-03 11:15",
          "0",
          "Руководитель",
          "Закрыт",
        ],
      ],
      Посетители: [
        visitorHeaders,
        [
          "46182.59470616898",
          "Иванов Иван",
          "Директор",
          "ООО Пример",
          "Переговоры",
          "Руководителя",
          "46183.32113399306",
          "",
        ],
      ],
    },
  });

  assert.equal(plan.records.length, 5);
  assert.deepEqual(
    plan.records.map((record) => record.formId),
    ["equipment", "incident", "incident_close", "visitor", "visitor_exit"],
  );
  assert.equal(plan.records[0]?.payload.reportDate, "02.06.2026");
  assert.equal(plan.records[0]?.payload.productionTons, "12.5");
  assert.equal(plan.records[1]?.payload.incidentNumber, "INC-2026-1");
  assert.equal(plan.records[2]?.payload.closureDateTime, "03.06.2026 11:15");
  assert.equal(plan.records[3]?.payload.entryAt, "09.06.2026 14:16");
  assert.equal(plan.records[4]?.payload.exitAt, "10.06.2026 07:42");
  assert.equal(plan.records[0]?.occurredAt.toISOString(), "2026-06-02T15:16:54.000Z");
  assert.ok(plan.records.every((record) => record.dedupeKey !== null));
  assert.equal(plan.sheets[1]?.importRecords, 2);
  assert.equal(plan.sheets[2]?.importRecords, 2);
});

test("dispatcher spreadsheet import uses source-independent content keys", () => {
  const rowsBySheet = {
    Оборудование: [equipmentHeaders],
    Инциденты: [
      incidentHeaders,
      ["INC-2026-12", "12.06.2026 08:30"],
    ],
    Посетители: [
      visitorHeaders,
      ["12.06.2026 09:00", "Иванов", "", "Организация"],
    ],
  };
  const first = buildDispatcherSpreadsheetImportPlan({
    spreadsheetId: "spreadsheet_source_one",
    rowsBySheet,
  });
  const second = buildDispatcherSpreadsheetImportPlan({
    spreadsheetId: "spreadsheet_source_two",
    rowsBySheet,
  });

  assert.notEqual(first.records[0]?.sourceKey, second.records[0]?.sourceKey);
  assert.deepEqual(
    first.records.map((record) => record.dedupeKey),
    second.records.map((record) => record.dedupeKey),
  );
});

test("dispatcher spreadsheet import keeps legacy rows and reports warnings", () => {
  const plan = buildDispatcherSpreadsheetImportPlan({
    spreadsheetId: "spreadsheet_test_456",
    rowsBySheet: {
      Оборудование: [
        equipmentHeaders,
        [
          "02.06.2026 18:16:54",
          "02.06.2026",
          "06.2026",
          "Пресс №2",
          "46181",
          "Резерв",
          "1",
          "",
        ],
      ],
      Инциденты: [
        incidentHeaders,
        ["INC-2026-6", "08.06.2026 14:40", "Цех", "Описание вместо типа"],
      ],
      Посетители: [visitorHeaders],
    },
  });

  assert.equal(plan.records.length, 2);
  assert.ok(plan.warnings.some((warning) => warning.includes("не с 8 часами")));
  assert.ok(plan.warnings.some((warning) => warning.includes("выглядит как дата")));
  assert.ok(plan.warnings.some((warning) => warning.includes("неполное открытие")));
});

test("dispatcher spreadsheet import rejects a sheet with missing columns", () => {
  assert.throws(
    () =>
      buildDispatcherSpreadsheetImportPlan({
        spreadsheetId: "spreadsheet_test_789",
        rowsBySheet: {
          Оборудование: [["Дата отчета"]],
          Инциденты: [incidentHeaders],
          Посетители: [visitorHeaders],
        },
      }),
    DispatcherSpreadsheetImportFormatError,
  );
});

test("dispatcher spreadsheet import keeps stable ids and visitor links", () => {
  const plan = buildDispatcherSpreadsheetImportPlan({
    spreadsheetId: "spreadsheet_test_999",
    rowsBySheet: {
      Оборудование: [equipmentHeaders],
      Инциденты: [incidentHeaders],
      Посетители: [
        visitorHeaders,
        ["09.06.2026 14:16", "Иванов", "", "Организация", "", "", "10.06.2026 07:42"],
      ],
    },
  });
  assert.equal(plan.records[1]?.payload.visitorEntryId, plan.records[0]?.id);
  assert.match(plan.records[0]?.sourceKey ?? "", /^google-sheets:/);
});
