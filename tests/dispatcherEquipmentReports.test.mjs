import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEquipmentCompletionMap,
  buildEquipmentFormPayload,
  buildEquipmentReportPayloads,
  formatReportDateForPayload,
  isEquipmentReportEntryDirty,
  readEquipmentDraftPayload,
  readEquipmentOptions,
  readLastEquipmentOption,
  readEquipmentReportEntryPayload,
  writeEquipmentDraftPayload,
  writeEquipmentReportEntryPayload,
  writeLastEquipmentOption,
} from "../.test-build/src/services/dispatcherEquipmentReports.js";

const equipmentForm = {
  id: "equipment",
  title: "Оборудование",
  sheetName: "Оборудование",
  fields: [
    {
      name: "reportDate",
      label: "Дата отчета",
      type: "date",
      required: true,
    },
    {
      name: "equipment",
      label: "Оборудование",
      type: "select",
      required: true,
      options: ["Пресс №1", "Пресс №2"],
    },
    {
      name: "productionTons",
      label: "Выработка, тонн",
      type: "number",
      required: false,
    },
    {
      name: "note",
      label: "Примечание",
      type: "textarea",
      required: false,
    },
  ],
};

test("equipment draft storage keeps field values but does not keep report dates", () => {
  const storage = createMemoryStorage();

  assert.equal(
    writeEquipmentDraftPayload({
      businessAccountId: "business-id",
      equipment: "Пресс №1",
      form: equipmentForm,
      payload: {
        reportDate: "2026-07-03",
        reportMonth: "2026-07",
        equipment: "Пресс №1",
        productionTons: "42",
        note: "Тест",
      },
      storage,
    }),
    true,
  );

  const draft = readEquipmentDraftPayload({
    businessAccountId: "business-id",
    equipment: "Пресс №1",
    form: equipmentForm,
    storage,
  });
  const payload = buildEquipmentFormPayload({
    equipment: "Пресс №1",
    form: equipmentForm,
    savedDraft: draft,
    todayDate: "2026-07-04",
  });

  assert.deepEqual(draft, {
    productionTons: "42",
    note: "Тест",
  });
  assert.equal(payload.reportDate, "2026-07-04");
  assert.equal(payload.equipment, "Пресс №1");
  assert.equal(payload.productionTons, "42");
});

test("equipment draft storage remembers the last selected valid equipment", () => {
  const storage = createMemoryStorage();
  const equipmentOptions = readEquipmentOptions(equipmentForm);

  writeLastEquipmentOption({
    businessAccountId: "business-id",
    equipment: "Пресс №2",
    storage,
  });

  assert.equal(
    readLastEquipmentOption({
      businessAccountId: "business-id",
      equipmentOptions,
      storage,
    }),
    "Пресс №2",
  );
  assert.equal(
    readLastEquipmentOption({
      businessAccountId: "business-id",
      equipmentOptions: ["Пресс №1"],
      storage,
    }),
    undefined,
  );
});

test("equipment report payloads only include explicitly added entries", () => {
  const storage = createMemoryStorage();

  writeEquipmentDraftPayload({
    businessAccountId: "business-id",
    equipment: "Пресс №1",
    form: equipmentForm,
    payload: {
      equipment: "Пресс №1",
      productionTons: "42",
      note: "Автосохраненный черновик",
    },
    storage,
  });
  writeEquipmentReportEntryPayload({
    businessAccountId: "business-id",
    equipment: "Пресс №2",
    form: equipmentForm,
    payload: {
      equipment: "Пресс №2",
      productionTons: "7",
      note: "Внесено в отчет",
    },
    storage,
  });

  const payloads = buildEquipmentReportPayloads({
    businessAccountId: "business-id",
    equipmentOptions: readEquipmentOptions(equipmentForm),
    form: equipmentForm,
    reportDate: "2026-07-06",
    storage,
  });

  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].reportDate, "2026-07-06");
  assert.equal(payloads[0].equipment, "Пресс №2");
  assert.equal(payloads[0].productionTons, "7");
});

test("equipment report entries stay stable while edited drafts become dirty", () => {
  const storage = createMemoryStorage();

  writeEquipmentReportEntryPayload({
    businessAccountId: "business-id",
    equipment: "Пресс №1",
    form: equipmentForm,
    payload: {
      equipment: "Пресс №1",
      productionTons: "7",
      note: "Внесено в отчет",
    },
    storage,
  });
  writeEquipmentDraftPayload({
    businessAccountId: "business-id",
    equipment: "Пресс №1",
    form: equipmentForm,
    payload: {
      equipment: "Пресс №1",
      productionTons: "8",
      note: "Исправленный черновик",
    },
    storage,
  });

  const reportPayload = readEquipmentReportEntryPayload({
    businessAccountId: "business-id",
    equipment: "Пресс №1",
    form: equipmentForm,
    storage,
  });
  const draftPayload = readEquipmentDraftPayload({
    businessAccountId: "business-id",
    equipment: "Пресс №1",
    form: equipmentForm,
    storage,
  });

  assert.deepEqual(reportPayload, {
    productionTons: "7",
    note: "Внесено в отчет",
  });
  assert.equal(
    isEquipmentReportEntryDirty({
      currentPayload: draftPayload,
      form: equipmentForm,
      reportPayload,
    }),
    true,
  );

  writeEquipmentReportEntryPayload({
    businessAccountId: "business-id",
    equipment: "Пресс №1",
    form: equipmentForm,
    payload: draftPayload,
    storage,
  });

  assert.equal(
    isEquipmentReportEntryDirty({
      currentPayload: draftPayload,
      form: equipmentForm,
      reportPayload: readEquipmentReportEntryPayload({
        businessAccountId: "business-id",
        equipment: "Пресс №1",
        form: equipmentForm,
        storage,
      }),
    }),
    false,
  );
});

test("equipment completion map matches report date payloads and keeps the latest submission", () => {
  const completionMap = buildEquipmentCompletionMap(
    [
      buildSubmission({
        id: "older",
        equipment: "Пресс №1",
        reportDate: "04.07.2026",
        productionTons: "40",
        receivedAt: "2026-07-04T08:00:00.000Z",
      }),
      buildSubmission({
        id: "newer",
        equipment: "Пресс №1",
        reportDate: "04.07.2026",
        productionTons: "43",
        receivedAt: "2026-07-04T09:00:00.000Z",
      }),
      buildSubmission({
        id: "other-date",
        equipment: "Пресс №2",
        reportDate: "03.07.2026",
        productionTons: "20",
        receivedAt: "2026-07-04T09:30:00.000Z",
      }),
    ],
    "2026-07-04",
  );

  assert.equal(formatReportDateForPayload("2026-07-04"), "04.07.2026");
  assert.equal(completionMap.size, 1);
  assert.equal(completionMap.get("Пресс №1")?.id, "newer");
});

function buildSubmission({
  id,
  equipment,
  reportDate,
  productionTons,
  receivedAt,
}) {
  return {
    id,
    businessAccountId: "business-id",
    formId: "equipment",
    formTitle: "Оборудование",
    payload: {
      equipment,
      reportDate,
      productionTons,
    },
    summary: equipment,
    status: "received",
    submittedByAccountId: "dispatcher-id",
    submittedAt: receivedAt,
    receivedAt,
  };
}

function createMemoryStorage() {
  const values = new Map();

  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}
