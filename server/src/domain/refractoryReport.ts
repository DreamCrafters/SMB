export const refractoryReportTypes = ["cosh", "equipment", "firing"] as const;

export type RefractoryReportType = (typeof refractoryReportTypes)[number];
export type RefractoryShiftNumber = 1 | 2;
export type RefractoryReportStatus = "pending" | "rejected" | "approved";

export const refractoryReportLabels: Record<RefractoryReportType, string> = {
  cosh: "ЦОШ",
  equipment: "Сводка по работе оборудования",
  firing: "Печное отделение",
};

export const refractoryEquipmentNames = [
  "Пресс СМ-1085 №1",
  "СМ-1085 №2",
  "СМ-1085 №3",
  "СМ-1085 №4",
  "СМ-1085 №5",
  "СМ-1085 №6",
  "СМ-1085 №7",
  "СМ-1085 №8",
  "Пресс 4КФ-200 №1",
  "4КФ-200 №2",
  "Пресс «ФЕЩЕНКО» №1",
  "«ФЕЩЕНКО» №2",
  "«ФЕЩЕНКО» №3",
  "«ФЕЩЕНКО» №4",
  "Пресс «ТАТПЛЕН»",
] as const;

export type RefractoryEquipmentName = (typeof refractoryEquipmentNames)[number];

export type RefractoryEquipmentRow = {
  equipment: RefractoryEquipmentName;
  productBrand?: string;
  outputNorm?: number;
  actualPieces?: number;
  actualTons?: number;
  workedHours?: number;
  mechanicalRepairHours?: number;
  electricalRepairHours?: number;
  carriageReplacementHours?: number;
  brandReplacementHours?: number;
  moldReplacementHours?: number;
  reserveHours?: number;
  workerAbsenceHours?: number;
  rawMaterialAbsenceHours?: number;
  note?: string;
  totalDowntimeHours: number;
};

export type RefractoryUnformedRow = {
  productBrand: string;
  outputNormContainers?: number;
  actualContainers?: number;
  actualTons?: number;
};

export type RefractoryEquipmentPayload = {
  formedRows: RefractoryEquipmentRow[];
  unformedRows: RefractoryUnformedRow[];
};

export type RefractoryEquipmentTotals = {
  formedActualPieces: number;
  formedActualTons: number;
  formedWorkedHours: number;
  formedDowntimeHours: number;
  unformedActualContainers: number;
  unformedActualTons: number;
};

export type RefractoryCoshPayload = {
  kilnNumber?: string;
  chamotteOutputRows?: Array<{
    productBrand: string;
    quantityTons: number;
  }>;
  /** Legacy shape kept for reading revisions saved before dynamic brand rows. */
  chamotteOutput?: {
    shbo?: number;
    shgr1?: number;
    shgr2?: number;
    shki?: number;
  };
  loadingBucketsPerHour?: number;
  totalLoadingBuckets?: number;
  jarMeasurements?: Array<{
    jarNumber: 1 | 2 | 3;
    values: number[];
    bankLabel?: string;
    material?: string;
    assignmentId?: string;
    bulkDensitySource?: string;
    bulkDensitySampleCount?: number;
    laboratoryResultId?: string;
    sampleIndex?: number;
    sampleIdentifier?: string;
    assignmentAssignedAt?: string;
    averageHeightMeters?: number;
    volumeCubicMeters?: number;
    bulkDensityTonsPerCubicMeter?: number;
    materialMassTons?: number;
  }>;
  bunkerFill?: Array<{
    bunker: "I" | "II" | "III" | "IV";
    productName?: string;
    quantity?: number;
  }>;
  chamotteSupply?: Array<{
    source: "I" | "II" | "III" | "street";
    productName?: string;
    quantity?: number;
  }>;
  bagging?: {
    jarNumber?: string;
    quantity?: number;
  };
  scrapRemovalTons?: number;
  furnaceIgnitionTime?: string;
  loadingStartTime?: string;
  bunkerTransitionTime?: string;
  bunkerNumber?: string;
  jarTransitionTime?: string;
  jarNumber?: string;
  furnaceStopTime?: string;
  note?: string;
};

export type RefractoryCoshTotals = {
  chamotteOutputTons: number;
  bunkerFillTons: number;
  chamotteSupplyTons: number;
  baggingTons: number;
  scrapRemovalTons: number;
  jarMaterialMassTons?: number;
};

export type RefractoryFiringRow = {
  productBrand: string;
  quantityPieces?: number;
  palletCount?: number;
  goodTonsAverageWeight?: number;
  goodTonsWeighed?: number;
  rejectUnderburnPieces?: number;
  rejectCracksPieces?: number;
  rejectFusionPieces?: number;
  rejectChipsPieces?: number;
  note?: string;
  rejectTotalPieces: number;
};

export type RefractoryFiringPayload = {
  rows: RefractoryFiringRow[];
  calcinationHours?: number;
  sorterCount?: number;
  planFailureReason?: string;
};

export type RefractoryFiringTotals = {
  quantityPieces: number;
  palletCount: number;
  goodTonsAverageWeight: number;
  goodTonsWeighed: number;
  rejectTotalPieces: number;
  rejectUnderburnPieces: number;
  rejectCracksPieces: number;
  rejectFusionPieces: number;
  rejectChipsPieces: number;
};

type RefractoryReportNotificationBase = {
  reportId: string;
  reportDate: string;
  shiftNumber: RefractoryShiftNumber;
  revisionNumber: number;
  masterDisplayName: string;
  reviewerDisplayName?: string;
};

export type RefractoryReportNotification =
  | (RefractoryReportNotificationBase & {
      reportType: "cosh";
      payload: RefractoryCoshPayload;
      totals: RefractoryCoshTotals;
    })
  | (RefractoryReportNotificationBase & {
      reportType: "equipment";
      payload: RefractoryEquipmentPayload;
      totals: RefractoryEquipmentTotals;
    })
  | (RefractoryReportNotificationBase & {
      reportType: "firing";
      payload: RefractoryFiringPayload;
      totals: RefractoryFiringTotals;
    });

export type ValidatedRefractoryReportSubmission =
  | {
      reportType: "equipment";
      reportDate: string;
      shiftNumber: RefractoryShiftNumber;
      payload: RefractoryEquipmentPayload;
      totals: RefractoryEquipmentTotals;
    }
  | {
      reportType: "cosh";
      reportDate: string;
      shiftNumber: RefractoryShiftNumber;
      payload: RefractoryCoshPayload;
      totals: RefractoryCoshTotals;
    }
  | {
      reportType: "firing";
      reportDate: string;
      shiftNumber: RefractoryShiftNumber;
      payload: RefractoryFiringPayload;
      totals: RefractoryFiringTotals;
    };

export type RefractoryValidationResult =
  | { ok: true; value: ValidatedRefractoryReportSubmission }
  | {
      ok: false;
      errors: string[];
      fieldErrors?: RefractoryFieldValidationError[];
    };

export type RefractoryFieldValidationError = {
  fieldPath: string;
  message: string;
};

type RefractoryValidationIssue = {
  message: string;
  fieldPath?: string;
};

type RefractoryValidationFailure = Extract<
  RefractoryValidationResult,
  { ok: false }
>;

export type RefractoryReportDecision =
  | { decision: "approve" }
  | { decision: "reject"; comment: string };

export type RefractoryDecisionValidationResult =
  | { ok: true; value: RefractoryReportDecision }
  | { ok: false; errors: string[] };

const equipmentNumberFields = [
  "outputNorm",
  "actualPieces",
  "actualTons",
  "workedHours",
  "mechanicalRepairHours",
  "electricalRepairHours",
  "carriageReplacementHours",
  "brandReplacementHours",
  "moldReplacementHours",
  "reserveHours",
  "workerAbsenceHours",
  "rawMaterialAbsenceHours",
] as const;

const downtimeFields = [
  "mechanicalRepairHours",
  "electricalRepairHours",
  "carriageReplacementHours",
  "brandReplacementHours",
  "moldReplacementHours",
  "reserveHours",
  "workerAbsenceHours",
  "rawMaterialAbsenceHours",
] as const satisfies readonly (keyof RefractoryEquipmentRow)[];

const refractoryFieldLabels: Record<string, string> = {
  actualContainers: "Факт, контейнеры",
  actualPieces: "Факт, шт.",
  actualTons: "Факт, т",
  brandReplacementHours: "Замена марки",
  bunkerNumber: "№ бункера",
  calcinationHours: "Время прогонки, час(а)",
  carriageReplacementHours: "Замена вагона",
  electricalRepairHours: "Ремонт по эл. части",
  furnaceIgnitionTime: "Время розжига печи",
  furnaceStopTime: "Время прекращения работы печи",
  goodTonsAverageWeight: "Годная, т по среднему весу",
  goodTonsWeighed: "Годная, т по взвешиванию",
  jarNumber: "№ банки",
  jarTransitionTime: "Время перехода на банку",
  kilnNumber: "Работает вр. печь №",
  loadingBucketsPerHour: "Загрузка, ковш/час",
  loadingStartTime: "Время начала загрузки",
  mechanicalRepairHours: "Ремонт по мех. части",
  moldReplacementHours: "Замена формы",
  note: "Примечание",
  outputNorm: "Норма выработки",
  outputNormContainers: "Норма, контейнеры",
  palletCount: "Кол-во, поддонов",
  planFailureReason: "Причина невыполнения плана",
  productBrand: "Марка изделия",
  productName: "Наименование продукции",
  quantity: "Кол-во, т",
  quantityTons: "Выпуск, т",
  quantityPieces: "Кол-во, шт.",
  rawMaterialAbsenceHours: "Отсутствие сырья",
  rejectChipsPieces: "Сколы",
  rejectCracksPieces: "Трещины",
  rejectFusionPieces: "Выплавка",
  rejectUnderburnPieces: "Недожог",
  reserveHours: "Резерв",
  scrapRemovalTons: "Вывоз недопала с ж/д бункера, тн",
  shbo: "ШБО, т",
  shgr1: "ШГР-1, т",
  shgr2: "ШГР-2, т",
  shki: "ШКИ, т",
  sorterCount: "Присутствуют на смене, сортировщиков",
  totalLoadingBuckets: "Загрузка, всего ковшей",
  workedHours: "Отработано, ч",
  workerAbsenceHours: "Отсутствие рабочего/сменщика",
  bunkerTransitionTime: "Время перехода на ж/д бункер",
};

export function validateRefractoryReportSubmission(
  input: unknown,
): RefractoryValidationResult {
  if (!isRecord(input) || Array.isArray(input)) {
    return invalid("Передайте таблицу ОЦ.");
  }

  const unexpectedFields = unexpectedKeys(input, [
    "reportType",
    "reportDate",
    "shiftNumber",
    "payload",
  ]);

  if (unexpectedFields.length > 0) {
    return invalid("Запрос содержит неизвестные поля.");
  }

  if (!isCalendarDate(input.reportDate)) {
    return invalid("Укажите дату отчёта в формате ГГГГ-ММ-ДД.");
  }

  if (input.shiftNumber !== 1 && input.shiftNumber !== 2) {
    return invalid("Выберите первую или вторую смену.");
  }

  if (input.reportType === "equipment") {
    const payload = validateEquipmentPayload(input.payload);

    return payload.ok
      ? {
          ok: true,
          value: {
            reportType: input.reportType,
            reportDate: input.reportDate,
            shiftNumber: input.shiftNumber,
            payload: payload.value,
            totals: buildEquipmentTotals(payload.value),
          },
        }
      : payload;
  }

  if (input.reportType === "cosh") {
    const payload = validateCoshPayload(input.payload);

    return payload.ok
      ? {
          ok: true,
          value: {
            reportType: input.reportType,
            reportDate: input.reportDate,
            shiftNumber: input.shiftNumber,
            payload: payload.value,
            totals: buildCoshTotals(payload.value),
          },
        }
      : payload;
  }

  if (input.reportType === "firing") {
    const payload = validateFiringPayload(input.payload);

    return payload.ok
      ? {
          ok: true,
          value: {
            reportType: input.reportType,
            reportDate: input.reportDate,
            shiftNumber: input.shiftNumber,
            payload: payload.value,
            totals: buildFiringTotals(payload.value),
          },
        }
      : payload;
  }

  return invalid("Выберите поддерживаемую таблицу ОЦ.");
}

export function validateRefractoryReportDecision(
  input: unknown,
): RefractoryDecisionValidationResult {
  if (!isRecord(input) || Array.isArray(input)) {
    return invalid("Передайте решение по таблице ОЦ.");
  }

  if (unexpectedKeys(input, ["decision", "comment"]).length > 0) {
    return invalid("Решение содержит неизвестные поля.");
  }

  if (input.decision === "approve") {
    if (
      input.comment !== undefined &&
      input.comment !== null &&
      input.comment !== ""
    ) {
      return invalid(
        "Комментарий указывается только при возврате на доработку.",
      );
    }

    return { ok: true, value: { decision: "approve" } };
  }

  if (input.decision === "reject") {
    if (
      typeof input.comment !== "string" ||
      input.comment.trim().length === 0 ||
      input.comment.trim().length > 2_000
    ) {
      return invalid("Укажите причину возврата на доработку.");
    }

    return {
      ok: true,
      value: { decision: "reject", comment: input.comment.trim() },
    };
  }

  return invalid("Выберите подтверждение или возврат на доработку.");
}

function validateCoshPayload(
  input: unknown,
):
  | { ok: true; value: RefractoryCoshPayload }
  | RefractoryValidationFailure {
  if (!isRecord(input) || Array.isArray(input)) {
    return invalid("Заполните таблицу ЦОШ.");
  }

  const scalarTextFields = [
    "kilnNumber",
    "bunkerNumber",
    "jarNumber",
    "note",
  ] as const;
  const timeFields = [
    "furnaceIgnitionTime",
    "loadingStartTime",
    "bunkerTransitionTime",
    "jarTransitionTime",
    "furnaceStopTime",
  ] as const;
  const numberFields = [
    "loadingBucketsPerHour",
    "totalLoadingBuckets",
    "scrapRemovalTons",
  ] as const;
  const allowed = [
    ...scalarTextFields,
    ...timeFields,
    ...numberFields,
    "chamotteOutputRows",
    "chamotteOutput",
    "jarMeasurements",
    "bunkerFill",
    "chamotteSupply",
    "bagging",
  ];

  if (unexpectedKeys(input, allowed).length > 0) {
    return invalid("Таблица ЦОШ содержит неизвестные поля.");
  }

  const errors: RefractoryValidationIssue[] = [];
  const payload: RefractoryCoshPayload = {};
  for (const field of scalarTextFields) {
    readOptionalText(
      input,
      payload,
      field,
      field === "note" ? 2_000 : 120,
      undefined,
      errors,
    );
  }
  for (const field of numberFields) {
    readOptionalNumber(input, payload, field, undefined, errors, {
      integer: field !== "scrapRemovalTons",
    });
  }
  for (const field of timeFields) {
    const value = input[field];
    if (value === undefined || value === null || value === "") continue;
    if (
      typeof value !== "string" ||
      !/^([01]\d|2[0-3]):[0-5]\d$/u.test(value)
    ) {
      addValidationIssue(
        errors,
        `Поле «${readRefractoryFieldLabel(field)}»: укажите время в формате ЧЧ:ММ.`,
        field,
      );
    } else {
      payload[field] = value;
    }
  }

  payload.chamotteOutputRows = readChamotteOutputRows(
    input.chamotteOutputRows,
    errors,
  );
  payload.chamotteOutput = readNumberRecord(
    input.chamotteOutput,
    ["shbo", "shgr1", "shgr2", "shki"],
    "Выпуск шамота",
    "chamotteOutput",
    errors,
  );
  payload.jarMeasurements = readJarMeasurements(input.jarMeasurements, errors);
  payload.bunkerFill = readNamedQuantityRows(
    input.bunkerFill,
    "bunker",
    ["I", "II", "III", "IV"],
    "Заполнение ж/д бункеров",
    errors,
  ) as RefractoryCoshPayload["bunkerFill"];
  payload.chamotteSupply = readNamedQuantityRows(
    input.chamotteSupply,
    "source",
    ["I", "II", "III", "street"],
    "Подача шамота в огнеупорный цех, тн",
    errors,
  ) as RefractoryCoshPayload["chamotteSupply"];
  payload.bagging = readBagging(input.bagging, errors);

  for (const field of [
    "chamotteOutputRows",
    "chamotteOutput",
    "jarMeasurements",
    "bunkerFill",
    "chamotteSupply",
    "bagging",
  ] as const) {
    const value = payload[field];
    if (
      value === undefined ||
      (Array.isArray(value) && value.length === 0) ||
      (!Array.isArray(value) &&
        typeof value === "object" &&
        Object.keys(value).length === 0)
    ) {
      delete payload[field];
    }
  }

  if (Object.keys(payload).length === 0 && errors.length === 0) {
    addValidationIssue(errors, "Заполните хотя бы одно поле таблицы.");
  }

  return errors.length > 0
    ? buildValidationFailure(errors)
    : { ok: true, value: payload };
}

function readChamotteOutputRows(
  input: unknown,
  errors: RefractoryValidationIssue[],
): RefractoryCoshPayload["chamotteOutputRows"] {
  if (input === undefined || input === null) return undefined;
  if (!Array.isArray(input) || input.length > 50) {
    addValidationIssue(
      errors,
      "Выпуск шамота: строки переданы в неверном формате.",
    );
    return undefined;
  }

  const rows: NonNullable<RefractoryCoshPayload["chamotteOutputRows"]> = [];
  for (const [index, value] of input.entries()) {
    if (
      !isRecord(value) ||
      Array.isArray(value) ||
      unexpectedKeys(value, ["productBrand", "quantityTons"]).length > 0
    ) {
      addValidationIssue(
        errors,
        `Выпуск шамота, строка ${index + 1}: неверный формат.`,
      );
      continue;
    }

    const row: Partial<
      NonNullable<RefractoryCoshPayload["chamotteOutputRows"]>[number]
    > = {};
    readOptionalText(value, row, "productBrand", 120, index, errors, {
      section: "Выпуск шамота",
      fieldPath: `chamotteOutputRows.${index}.productBrand`,
    });
    readOptionalNumber(value, row, "quantityTons", index, errors, {
      section: "Выпуск шамота",
      fieldPath: `chamotteOutputRows.${index}.quantityTons`,
    });

    if (row.productBrand === undefined && row.quantityTons === undefined) {
      continue;
    }
    if (row.productBrand === undefined) {
      addValidationIssue(
        errors,
        `Выпуск шамота, строка ${index + 1}: укажите марку изделия.`,
        `chamotteOutputRows.${index}.productBrand`,
      );
      continue;
    }
    if (row.quantityTons === undefined) {
      addValidationIssue(
        errors,
        `Выпуск шамота, строка ${index + 1}: укажите выпуск в тоннах.`,
        `chamotteOutputRows.${index}.quantityTons`,
      );
      continue;
    }
    rows.push(row as NonNullable<
      RefractoryCoshPayload["chamotteOutputRows"]
    >[number]);
  }

  const normalizedBrands = rows.map((row) =>
    row.productBrand.trim().replace(/\s+/gu, " ").toLocaleLowerCase("ru-RU")
  );
  if (new Set(normalizedBrands).size !== normalizedBrands.length) {
    addValidationIssue(
      errors,
      "Выпуск шамота: марки не должны повторяться.",
    );
  }

  return rows;
}

function readNumberRecord<Key extends string>(
  input: unknown,
  keys: readonly Key[],
  label: string,
  fieldPathPrefix: string,
  errors: RefractoryValidationIssue[],
): Partial<Record<Key, number>> | undefined {
  if (input === undefined || input === null) return undefined;
  if (
    !isRecord(input) ||
    Array.isArray(input) ||
    unexpectedKeys(input, keys).length > 0
  ) {
    addValidationIssue(errors, `${label}: неверный формат.`);
    return undefined;
  }

  const result: Partial<Record<Key, number>> = {};
  for (const key of keys) {
    readOptionalNumber(input, result, key, undefined, errors, {
      fieldPath: `${fieldPathPrefix}.${key}`,
    });
  }
  return result;
}

function readJarMeasurements(
  input: unknown,
  errors: RefractoryValidationIssue[],
): RefractoryCoshPayload["jarMeasurements"] {
  if (input === undefined || input === null) return undefined;
  if (!Array.isArray(input) || input.length > 3) {
    addValidationIssue(errors, "Замеры банок переданы в неверном формате.");
    return undefined;
  }

  const rows: NonNullable<RefractoryCoshPayload["jarMeasurements"]> = [];
  for (const [index, value] of input.entries()) {
    if (
      !isRecord(value) ||
      Array.isArray(value) ||
      unexpectedKeys(value, ["jarNumber", "values"]).length > 0 ||
      (value.jarNumber !== 1 &&
        value.jarNumber !== 2 &&
        value.jarNumber !== 3) ||
      !Array.isArray(value.values) ||
      value.values.length > 100 ||
      value.values.length === 0 ||
      value.values.some((entry) => !isValidNumber(entry))
    ) {
      addValidationIssue(
        errors,
        `Замеры банки ${index + 1} заполнены неверно.`,
      );
      continue;
    }
    rows.push({ jarNumber: value.jarNumber, values: value.values as number[] });
  }
  if (new Set(rows.map((row) => row.jarNumber)).size !== rows.length) {
    addValidationIssue(errors, "Номер банки в замерах не должен повторяться.");
  }
  return rows;
}

function readNamedQuantityRows(
  input: unknown,
  identityField: "bunker" | "source",
  identities: readonly string[],
  label: string,
  errors: RefractoryValidationIssue[],
): Array<Record<string, unknown>> | undefined {
  if (input === undefined || input === null) return undefined;
  if (!Array.isArray(input) || input.length > identities.length) {
    addValidationIssue(errors, `${label}: строки переданы в неверном формате.`);
    return undefined;
  }

  const rows: Array<Record<string, unknown>> = [];
  for (const [index, value] of input.entries()) {
    if (
      !isRecord(value) ||
      Array.isArray(value) ||
      unexpectedKeys(value, [identityField, "productName", "quantity"]).length >
        0 ||
      !identities.includes(value[identityField] as string)
    ) {
      addValidationIssue(
        errors,
        `${label}, строка ${index + 1}: неверный формат.`,
      );
      continue;
    }
    const row: Record<string, unknown> = {
      [identityField]: value[identityField],
    };
    const identity = String(value[identityField]);
    const fieldPathPrefix = identityField === "bunker" ? "bunker" : "supply";
    readOptionalText(value, row, "productName", 120, index, errors, {
      section: label,
      fieldPath: `${fieldPathPrefix}.${identity}.productName`,
    });
    readOptionalNumber(value, row, "quantity", index, errors, {
      section: label,
      fieldPath: `${fieldPathPrefix}.${identity}.quantity`,
    });
    if (Object.keys(row).length === 1) continue;
    rows.push(row);
  }
  if (new Set(rows.map((row) => row[identityField])).size !== rows.length) {
    addValidationIssue(errors, `${label}: строки не должны повторяться.`);
  }
  return rows;
}

function readBagging(
  input: unknown,
  errors: RefractoryValidationIssue[],
): RefractoryCoshPayload["bagging"] {
  if (input === undefined || input === null) return undefined;
  if (
    !isRecord(input) ||
    Array.isArray(input) ||
    unexpectedKeys(input, ["jarNumber", "quantity"]).length > 0
  ) {
    addValidationIssue(errors, "Затарка в мешки передана в неверном формате.");
    return undefined;
  }
  const result: NonNullable<RefractoryCoshPayload["bagging"]> = {};
  readOptionalText(input, result, "jarNumber", 120, undefined, errors, {
    fieldPath: "bagging.jarNumber",
  });
  readOptionalNumber(input, result, "quantity", undefined, errors, {
    fieldPath: "bagging.quantity",
  });
  return result;
}

function buildCoshTotals(payload: RefractoryCoshPayload): RefractoryCoshTotals {
  return {
    chamotteOutputTons: roundNumber(
      payload.chamotteOutputRows === undefined
        ? Object.values(payload.chamotteOutput ?? {}).reduce(
            (total, value) => total + (value ?? 0),
            0,
          )
        : payload.chamotteOutputRows.reduce(
            (total, row) => total + row.quantityTons,
            0,
          ),
    ),
    bunkerFillTons: roundNumber(
      (payload.bunkerFill ?? []).reduce(
        (total, row) => total + (row.quantity ?? 0),
        0,
      ),
    ),
    chamotteSupplyTons: roundNumber(
      (payload.chamotteSupply ?? []).reduce(
        (total, row) => total + (row.quantity ?? 0),
        0,
      ),
    ),
    baggingTons: payload.bagging?.quantity ?? 0,
    scrapRemovalTons: payload.scrapRemovalTons ?? 0,
  };
}

function validateEquipmentPayload(
  input: unknown,
):
  | { ok: true; value: RefractoryEquipmentPayload }
  | RefractoryValidationFailure {
  if (!isRecord(input) || Array.isArray(input)) {
    return invalid("Заполните таблицу оборудования.");
  }

  if (unexpectedKeys(input, ["formedRows", "unformedRows"]).length > 0) {
    return invalid("Таблица оборудования содержит неизвестные поля.");
  }

  if (!Array.isArray(input.formedRows) || !Array.isArray(input.unformedRows)) {
    return invalid("Строки оборудования переданы в неверном формате.");
  }

  if (input.formedRows.length > refractoryEquipmentNames.length) {
    return invalid("В таблице слишком много строк оборудования.");
  }

  if (input.unformedRows.length > 50) {
    return invalid("В таблице слишком много строк неформованных огнеупоров.");
  }

  const errors: RefractoryValidationIssue[] = [];
  const formedRows = input.formedRows.flatMap((row, index) => {
    const value = readEquipmentRow(row, index, errors);
    return value === undefined ? [] : [value];
  });
  const unformedRows = input.unformedRows.flatMap((row, index) => {
    const value = readUnformedRow(row, index, errors);
    return value === undefined ? [] : [value];
  });

  if (
    new Set(formedRows.map((row) => row.equipment)).size !== formedRows.length
  ) {
    addValidationIssue(errors, "Оборудование не должно повторяться.");
  }

  if (
    formedRows.length === 0 &&
    unformedRows.length === 0 &&
    errors.length === 0
  ) {
    addValidationIssue(errors, "Заполните хотя бы одну строку таблицы.");
  }

  return errors.length > 0
    ? buildValidationFailure(errors)
    : { ok: true, value: { formedRows, unformedRows } };
}

function readEquipmentRow(
  input: unknown,
  index: number,
  errors: RefractoryValidationIssue[],
): RefractoryEquipmentRow | undefined {
  if (!isRecord(input) || Array.isArray(input)) {
    addValidationIssue(
      errors,
      `Строка оборудования ${index + 1} имеет неверный формат.`,
    );
    return undefined;
  }

  const allowedFields = [
    "equipment",
    "productBrand",
    "note",
    ...equipmentNumberFields,
  ];

  if (unexpectedKeys(input, allowedFields).length > 0) {
    addValidationIssue(
      errors,
      `Строка оборудования ${index + 1} содержит неизвестные поля.`,
    );
    return undefined;
  }

  if (
    !refractoryEquipmentNames.includes(
      input.equipment as RefractoryEquipmentName,
    )
  ) {
    addValidationIssue(
      errors,
      `Строка оборудования ${index + 1}: выберите оборудование из списка.`,
    );
    return undefined;
  }

  const row: Partial<RefractoryEquipmentRow> & {
    equipment: RefractoryEquipmentName;
  } = {
    equipment: input.equipment as RefractoryEquipmentName,
  };
  readOptionalText(input, row, "productBrand", 120, index, errors, {
    fieldPath: `formed.${index}.productBrand`,
  });
  readOptionalText(input, row, "note", 2_000, index, errors, {
    fieldPath: `formed.${index}.note`,
  });

  for (const field of equipmentNumberFields) {
    readOptionalNumber(input, row, field, index, errors, {
      integer: field === "actualPieces",
      ...(field.endsWith("Hours") ? { max: 24 } : {}),
      fieldPath: `formed.${index}.${field}`,
    });
  }

  const hasData = Object.keys(row).some((field) => field !== "equipment");

  if (!hasData) {
    return undefined;
  }

  return {
    ...row,
    totalDowntimeHours: roundNumber(
      downtimeFields.reduce(
        (sum, field) => sum + (typeof row[field] === "number" ? row[field] : 0),
        0,
      ),
    ),
  } as RefractoryEquipmentRow;
}

function readUnformedRow(
  input: unknown,
  index: number,
  errors: RefractoryValidationIssue[],
): RefractoryUnformedRow | undefined {
  if (!isRecord(input) || Array.isArray(input)) {
    addValidationIssue(
      errors,
      `Строка неформованных огнеупоров ${index + 1} имеет неверный формат.`,
    );
    return undefined;
  }

  if (
    unexpectedKeys(input, [
      "productBrand",
      "outputNormContainers",
      "actualContainers",
      "actualTons",
    ]).length > 0
  ) {
    addValidationIssue(
      errors,
      `Строка неформованных огнеупоров ${index + 1} содержит неизвестные поля.`,
    );
    return undefined;
  }

  const row: Partial<RefractoryUnformedRow> = {};
  readOptionalText(input, row, "productBrand", 120, index, errors, {
    fieldPath: `unformed.${index}.productBrand`,
  });
  readOptionalNumber(input, row, "outputNormContainers", index, errors, {
    fieldPath: `unformed.${index}.outputNormContainers`,
  });
  readOptionalNumber(input, row, "actualContainers", index, errors, {
    integer: true,
    fieldPath: `unformed.${index}.actualContainers`,
  });
  readOptionalNumber(input, row, "actualTons", index, errors, {
    fieldPath: `unformed.${index}.actualTons`,
  });

  if (Object.keys(row).length === 0) {
    return undefined;
  }

  if (row.productBrand === undefined) {
    addValidationIssue(
      errors,
      `Строка неформованных огнеупоров ${index + 1}: укажите марку.`,
      `unformed.${index}.productBrand`,
    );
    return undefined;
  }

  return row as RefractoryUnformedRow;
}

function buildEquipmentTotals(
  payload: RefractoryEquipmentPayload,
): RefractoryEquipmentTotals {
  return {
    formedActualPieces: sum(payload.formedRows, "actualPieces"),
    formedActualTons: sum(payload.formedRows, "actualTons"),
    formedWorkedHours: sum(payload.formedRows, "workedHours"),
    formedDowntimeHours: sum(payload.formedRows, "totalDowntimeHours"),
    unformedActualContainers: sum(payload.unformedRows, "actualContainers"),
    unformedActualTons: sum(payload.unformedRows, "actualTons"),
  };
}

function validateFiringPayload(
  input: unknown,
):
  | { ok: true; value: RefractoryFiringPayload }
  | RefractoryValidationFailure {
  if (!isRecord(input) || Array.isArray(input)) {
    return invalid("Заполните таблицу печного отделения.");
  }

  if (
    unexpectedKeys(input, [
      "rows",
      "calcinationHours",
      "sorterCount",
      "planFailureReason",
    ]).length > 0
  ) {
    return invalid("Таблица печного отделения содержит неизвестные поля.");
  }

  if (!Array.isArray(input.rows) || input.rows.length > 50) {
    return invalid("Строки печного отделения переданы в неверном формате.");
  }

  const errors: RefractoryValidationIssue[] = [];
  const rows = input.rows.flatMap((row, index) => {
    const value = readFiringRow(row, index, errors);
    return value === undefined ? [] : [value];
  });
  const payload: Partial<RefractoryFiringPayload> & {
    rows: RefractoryFiringRow[];
  } = { rows };

  readOptionalNumber(input, payload, "calcinationHours", undefined, errors, {
    max: 24,
  });
  readOptionalNumber(input, payload, "sorterCount", undefined, errors, {
    integer: true,
    max: 1_000,
  });
  readOptionalText(
    input,
    payload,
    "planFailureReason",
    2_000,
    undefined,
    errors,
  );

  if (
    rows.length === 0 &&
    payload.calcinationHours === undefined &&
    payload.sorterCount === undefined &&
    payload.planFailureReason === undefined &&
    errors.length === 0
  ) {
    addValidationIssue(errors, "Заполните хотя бы одну строку таблицы.");
  }

  return errors.length > 0
    ? buildValidationFailure(errors)
    : { ok: true, value: payload as RefractoryFiringPayload };
}

function readFiringRow(
  input: unknown,
  index: number,
  errors: RefractoryValidationIssue[],
): RefractoryFiringRow | undefined {
  if (!isRecord(input) || Array.isArray(input)) {
    addValidationIssue(
      errors,
      `Строка печного отделения ${index + 1} имеет неверный формат.`,
    );
    return undefined;
  }

  const numberFields = [
    "quantityPieces",
    "palletCount",
    "goodTonsAverageWeight",
    "goodTonsWeighed",
    "rejectUnderburnPieces",
    "rejectCracksPieces",
    "rejectFusionPieces",
    "rejectChipsPieces",
  ] as const;

  if (
    unexpectedKeys(input, ["productBrand", "note", ...numberFields]).length > 0
  ) {
    addValidationIssue(
      errors,
      `Строка печного отделения ${index + 1} содержит неизвестные поля.`,
    );
    return undefined;
  }

  const row: Partial<RefractoryFiringRow> = {};
  readOptionalText(input, row, "productBrand", 120, index, errors, {
    fieldPath: `firing.${index}.productBrand`,
  });
  readOptionalText(input, row, "note", 2_000, index, errors, {
    fieldPath: `firing.${index}.note`,
  });

  for (const field of numberFields) {
    readOptionalNumber(input, row, field, index, errors, {
      integer:
        field === "quantityPieces" ||
        field === "palletCount" ||
        field.startsWith("reject"),
      fieldPath: `firing.${index}.${field}`,
    });
  }

  if (Object.keys(row).length === 0) {
    return undefined;
  }

  if (row.productBrand === undefined) {
    addValidationIssue(
      errors,
      `Строка печного отделения ${index + 1}: укажите марку изделия.`,
      `firing.${index}.productBrand`,
    );
    return undefined;
  }

  return {
    ...row,
    rejectTotalPieces:
      (row.rejectUnderburnPieces ?? 0) +
      (row.rejectCracksPieces ?? 0) +
      (row.rejectFusionPieces ?? 0) +
      (row.rejectChipsPieces ?? 0),
  } as RefractoryFiringRow;
}

function buildFiringTotals(
  payload: RefractoryFiringPayload,
): RefractoryFiringTotals {
  return {
    quantityPieces: sum(payload.rows, "quantityPieces"),
    palletCount: sum(payload.rows, "palletCount"),
    goodTonsAverageWeight: sum(payload.rows, "goodTonsAverageWeight"),
    goodTonsWeighed: sum(payload.rows, "goodTonsWeighed"),
    rejectTotalPieces: sum(payload.rows, "rejectTotalPieces"),
    rejectUnderburnPieces: sum(payload.rows, "rejectUnderburnPieces"),
    rejectCracksPieces: sum(payload.rows, "rejectCracksPieces"),
    rejectFusionPieces: sum(payload.rows, "rejectFusionPieces"),
    rejectChipsPieces: sum(payload.rows, "rejectChipsPieces"),
  };
}

function sum<Row extends object>(rows: Row[], field: keyof Row) {
  return roundNumber(
    rows.reduce((total, row) => {
      const value = row[field];
      return total + (typeof value === "number" ? value : 0);
    }, 0),
  );
}

function readOptionalText<Row extends object>(
  input: Record<string, unknown>,
  output: Partial<Row>,
  field: keyof Row & string,
  maxLength: number,
  index: number | undefined,
  errors: RefractoryValidationIssue[],
  options: { fieldPath?: string; section?: string } = {},
) {
  const value = input[field];

  if (value === undefined || value === null || value === "") {
    return;
  }

  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.trim().length > maxLength
  ) {
    addValidationIssue(
      errors,
      `${formatRefractoryFieldLocation(field, index, options.section)}: проверьте значение.`,
      options.fieldPath ?? field,
    );
    return;
  }

  (output as Record<string, unknown>)[field] = value.trim();
}

function readOptionalNumber<Row extends object>(
  input: Record<string, unknown>,
  output: Partial<Row>,
  field: keyof Row & string,
  index: number | undefined,
  errors: RefractoryValidationIssue[],
  options: {
    fieldPath?: string;
    integer?: boolean;
    max?: number;
    section?: string;
  } = {},
) {
  const value = input[field];

  if (value === undefined || value === null || value === "") {
    return;
  }

  const location = formatRefractoryFieldLocation(
    field,
    index,
    options.section,
  );
  if (typeof value !== "number" || !Number.isFinite(value)) {
    addValidationIssue(
      errors,
      `${location}: введите число цифрами.`,
      options.fieldPath ?? field,
    );
    return;
  }

  const maximum = options.max ?? 1_000_000_000;
  if (value < 0 || value > maximum) {
    const valueKind = options.integer === true ? "целое число" : "число";
    addValidationIssue(
      errors,
      `${location}: укажите ${valueKind} от 0 до ${formatRefractoryLimit(maximum)}.`,
      options.fieldPath ?? field,
    );
    return;
  }

  if (options.integer === true && !Number.isSafeInteger(value)) {
    addValidationIssue(
      errors,
      `${location}: укажите целое число без знаков после запятой.`,
      options.fieldPath ?? field,
    );
    return;
  }

  if (readDecimalPlaces(value) > 3) {
    addValidationIssue(
      errors,
      `${location}: укажите не более трёх знаков после запятой.`,
      options.fieldPath ?? field,
    );
    return;
  }

  (output as Record<string, unknown>)[field] = value;
}

function readRefractoryFieldLabel(field: string) {
  return refractoryFieldLabels[field] ?? "Поле таблицы";
}

function formatRefractoryFieldLocation(
  field: string,
  index: number | undefined,
  section?: string,
) {
  const fieldPart = `«${readRefractoryFieldLabel(field)}»`;
  if (index === undefined) return `Поле ${fieldPart}`;
  const rowPart = `строка ${index + 1}, ${fieldPart}`;
  return section === undefined
    ? `Строка ${index + 1}, ${fieldPart}`
    : `${section}, ${rowPart}`;
}

function formatRefractoryLimit(value: number) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/gu, " ");
}

function addValidationIssue(
  issues: RefractoryValidationIssue[],
  message: string,
  fieldPath?: string,
) {
  issues.push({ message, ...(fieldPath === undefined ? {} : { fieldPath }) });
}

function buildValidationFailure(
  issues: RefractoryValidationIssue[],
): RefractoryValidationFailure {
  const fieldErrors = issues.flatMap((issue) =>
    issue.fieldPath === undefined
      ? []
      : [{ fieldPath: issue.fieldPath, message: issue.message }]
  );
  return {
    ok: false,
    errors: issues.map((issue) => issue.message),
    ...(fieldErrors.length === 0 ? {} : { fieldErrors }),
  };
}

function isValidNumber(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1_000_000_000 &&
    readDecimalPlaces(value) <= 3
  );
}

function readDecimalPlaces(value: number) {
  const [coefficient, exponentText] = String(value).toLowerCase().split("e");
  const fractionLength = coefficient?.split(".")[1]?.length ?? 0;
  const exponent = exponentText === undefined ? 0 : Number(exponentText);

  return Math.max(0, fractionLength - exponent);
}

function roundNumber(value: number) {
  return Math.round((value + Number.EPSILON) * 1_000) / 1_000;
}

function unexpectedKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
) {
  const allowedSet = new Set(allowed);
  return Object.keys(value).filter((key) => !allowedSet.has(key));
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function invalid(message: string): { ok: false; errors: string[] } {
  return { ok: false, errors: [message] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
