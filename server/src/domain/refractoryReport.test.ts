import assert from "node:assert/strict";
import test from "node:test";
import {
  validateRefractoryReportDecision,
  validateRefractoryReportSubmission,
} from "./refractoryReport.js";

test("equipment report calculates row downtime and server totals", () => {
  const result = validateRefractoryReportSubmission({
    reportType: "equipment",
    reportDate: "2026-07-20",
    shiftNumber: 2,
    payload: {
      formedRows: [
        {
          equipment: "Пресс СМ-1085 №1",
          productBrand: "ША-22 б/к",
          outputNorm: 23,
          actualPieces: 7106,
          actualTons: 22.59,
          workedHours: 7,
          mechanicalRepairHours: 1,
        },
        {
          equipment: "СМ-1085 №2",
          reserveHours: 8,
        },
      ],
      unformedRows: [
        {
          productBrand: "Смесь МК",
          outputNormContainers: 12,
          actualContainers: 10,
          actualTons: 4.5,
        },
      ],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.reportType, "equipment");
  if (result.value.reportType !== "equipment") return;

  assert.deepEqual(result.value.payload.formedRows[0], {
    equipment: "Пресс СМ-1085 №1",
    productBrand: "ША-22 б/к",
    outputNorm: 23,
    actualPieces: 7106,
    actualTons: 22.59,
    workedHours: 7,
    mechanicalRepairHours: 1,
    totalDowntimeHours: 1,
  });
  assert.deepEqual(result.value.totals, {
    formedActualPieces: 7106,
    formedActualTons: 22.59,
    formedWorkedHours: 7,
    formedDowntimeHours: 9,
    unformedActualContainers: 10,
    unformedActualTons: 4.5,
  });
});

test("firing report calculates reject totals from defect kinds", () => {
  const result = validateRefractoryReportSubmission({
    reportType: "firing",
    reportDate: "2026-07-20",
    shiftNumber: 1,
    payload: {
      rows: [
        {
          productBrand: "ШАБ 5",
          quantityPieces: 14400,
          palletCount: 40,
          goodTonsAverageWeight: 34.42,
          goodTonsWeighed: 54.42,
          rejectUnderburnPieces: 0,
          rejectCracksPieces: 40,
          rejectFusionPieces: 60,
          rejectChipsPieces: 160,
        },
        {
          productBrand: "ША-22",
          quantityPieces: 100,
          palletCount: 1,
          rejectUnderburnPieces: 2,
          rejectChipsPieces: 3,
        },
      ],
      calcinationHours: 3,
      sorterCount: 1,
      planFailureReason: "Не установлен бандаж",
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.reportType, "firing");
  if (result.value.reportType !== "firing") return;

  assert.equal(result.value.payload.rows[0]?.rejectTotalPieces, 260);
  assert.deepEqual(result.value.totals, {
    quantityPieces: 14500,
    palletCount: 41,
    goodTonsAverageWeight: 34.42,
    goodTonsWeighed: 54.42,
    rejectTotalPieces: 265,
    rejectUnderburnPieces: 2,
    rejectCracksPieces: 40,
    rejectFusionPieces: 60,
    rejectChipsPieces: 163,
  });
});

test("COSH report accepts the shift summary and calculates section totals", () => {
  const result = validateRefractoryReportSubmission({
    reportType: "cosh",
    reportDate: "2026-07-20",
    shiftNumber: 2,
    payload: {
      kilnNumber: "1",
      chamotteOutput: {
        shbo: 10.2,
        shgr1: 2,
        shgr2: 3,
        shki: 4,
      },
      loadingBucketsPerHour: 8,
      totalLoadingBuckets: 64,
      jarMeasurements: [
        { jarNumber: 1, values: [24, 25, 24, 26] },
        { jarNumber: 2, values: [30] },
      ],
      bunkerFill: [
        { bunker: "I", productName: "ШБО", quantity: 5 },
        { bunker: "II", productName: "ШГР", quantity: 6 },
      ],
      chamotteSupply: [
        { source: "I", productName: "ШБО", quantity: 4.5 },
        { source: "street", productName: "ШГР", quantity: 1.5 },
      ],
      bagging: { jarNumber: "2", quantity: 3 },
      scrapRemovalTons: 0.4,
      furnaceIgnitionTime: "20:10",
      loadingStartTime: "20:40",
      note: "Работа без замечаний",
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.reportType, "cosh");
  if (result.value.reportType !== "cosh") return;

  assert.deepEqual(result.value.totals, {
    chamotteOutputTons: 19.2,
    bunkerFillTons: 11,
    chamotteSupplyTons: 6,
    baggingTons: 3,
    scrapRemovalTons: 0.4,
  });
});

test("dispatcher rejection requires a comment while approval does not", () => {
  assert.deepEqual(validateRefractoryReportDecision({ decision: "approve" }), {
    ok: true,
    value: { decision: "approve" },
  });
  assert.deepEqual(validateRefractoryReportDecision({ decision: "reject" }), {
    ok: false,
    errors: ["Укажите причину возврата на доработку."],
  });
  assert.deepEqual(
    validateRefractoryReportDecision({
      decision: "reject",
      comment: " Уточните количество брака. ",
    }),
    {
      ok: true,
      value: {
        decision: "reject",
        comment: "Уточните количество брака.",
      },
    },
  );
});

test("report validation rejects negative values and empty reports", () => {
  const negative = validateRefractoryReportSubmission({
    reportType: "firing",
    reportDate: "2026-07-20",
    shiftNumber: 1,
    payload: {
      rows: [{ productBrand: "ША", quantityPieces: -1 }],
    },
  });
  const empty = validateRefractoryReportSubmission({
    reportType: "cosh",
    reportDate: "2026-07-20",
    shiftNumber: 1,
    payload: {},
  });

  assert.equal(negative.ok, false);
  assert.equal(empty.ok, false);
});

test("equipment validation names invalid fields in Russian", () => {
  const result = validateRefractoryReportSubmission({
    reportType: "equipment",
    reportDate: "2026-07-20",
    shiftNumber: 1,
    payload: {
      formedRows: [{
        equipment: "Пресс СМ-1085 №1",
        workedHours: 42,
        mechanicalRepairHours: "ремонт",
      }],
      unformedRows: [],
    },
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.errors, [
    "Строка 1, «Работа, ч»: укажите число от 0 до 24.",
    "Строка 1, «Мех. ремонт»: введите число цифрами.",
  ]);
  assert.deepEqual(result.fieldErrors, [
    {
      fieldPath: "formed.0.workedHours",
      message: "Строка 1, «Работа, ч»: укажите число от 0 до 24.",
    },
    {
      fieldPath: "formed.0.mechanicalRepairHours",
      message: "Строка 1, «Мех. ремонт»: введите число цифрами.",
    },
  ]);
  assert.doesNotMatch(result.errors.join(" "), /workedHours|mechanicalRepairHours/u);
});

test("scalar and section validation errors keep their visible context", () => {
  const firing = validateRefractoryReportSubmission({
    reportType: "firing",
    reportDate: "2026-07-20",
    shiftNumber: 1,
    payload: { rows: [], calcinationHours: 25 },
  });
  const cosh = validateRefractoryReportSubmission({
    reportType: "cosh",
    reportDate: "2026-07-20",
    shiftNumber: 1,
    payload: {
      loadingBucketsPerHour: 1_000_000_001,
      bunkerFill: [{ bunker: "I", quantity: "много" }],
    },
  });
  const precision = validateRefractoryReportSubmission({
    reportType: "firing",
    reportDate: "2026-07-20",
    shiftNumber: 1,
    payload: {
      rows: [{ productBrand: "ША", goodTonsWeighed: 12.3456 }],
    },
  });

  assert.deepEqual(firing, {
    ok: false,
    errors: [
      "Поле «Время обжига, часов»: укажите число от 0 до 24.",
    ],
    fieldErrors: [{
      fieldPath: "calcinationHours",
      message: "Поле «Время обжига, часов»: укажите число от 0 до 24.",
    }],
  });
  assert.deepEqual(cosh, {
    ok: false,
    errors: [
      "Поле «Загрузка, ковшей/час»: укажите целое число от 0 до 1 000 000 000.",
      "Наполнение бункеров РЦ, строка 1, «Количество, т»: введите число цифрами.",
    ],
    fieldErrors: [
      {
        fieldPath: "loadingBucketsPerHour",
        message:
          "Поле «Загрузка, ковшей/час»: укажите целое число от 0 до 1 000 000 000.",
      },
      {
        fieldPath: "bunker.I.quantity",
        message:
          "Наполнение бункеров РЦ, строка 1, «Количество, т»: введите число цифрами.",
      },
    ],
  });
  assert.deepEqual(precision, {
    ok: false,
    errors: [
      "Строка 1, «Годные, т (взвешено)»: укажите не более трёх знаков после запятой.",
    ],
    fieldErrors: [{
      fieldPath: "firing.0.goodTonsWeighed",
      message:
        "Строка 1, «Годные, т (взвешено)»: укажите не более трёх знаков после запятой.",
    }],
  });
});
