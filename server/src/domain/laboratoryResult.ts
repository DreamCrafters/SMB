import type {
  LaboratoryIndicatorId,
  LaboratoryMaterialReference,
  LaboratoryReferenceData,
} from "../integrations/googleSheetsReference.js";

export const laboratorySections = ["incoming", "finished_product"] as const;
export type LaboratorySection = (typeof laboratorySections)[number];

export const laboratoryTransportTypes = [
  "ЖД",
  "Автотранспорт грузовой",
  "Легковой автотранспорт",
] as const;
export type LaboratoryTransportType =
  (typeof laboratoryTransportTypes)[number];

export const laboratoryDocumentTypes = [
  "Сертификат на отгруженную продукцию",
] as const;
export type LaboratoryDocumentType =
  (typeof laboratoryDocumentTypes)[number];

export const laboratoryIncomingPurpose =
  "Определение химического состава и свойств";

export type LaboratoryIndicatorValues = Partial<
  Record<LaboratoryIndicatorId, string>
>;

export type IncomingLaboratoryResultSubmission = {
  section: "incoming";
  analysisDate: string;
  materialLabel: string;
  sampleIdentifier: string;
  documentType?: LaboratoryDocumentType;
  documentNumber?: string;
  transportType?: LaboratoryTransportType;
  samplingMethod?: string;
  documentIndicators?: string;
  values: LaboratoryIndicatorValues;
};

export type FinishedProductLaboratoryResultSubmission = {
  section: "finished_product";
  analysisDate: string;
  materialLabel: string;
  productBrand: string;
  values: LaboratoryIndicatorValues;
};

export type LaboratoryResultSubmission =
  | IncomingLaboratoryResultSubmission
  | FinishedProductLaboratoryResultSubmission;

export type LaboratoryResultValidation =
  | { ok: true; value: LaboratoryResultSubmission }
  | { ok: false; errors: string[] };

const maxShortTextLength = 120;
const maxLongTextLength = 2_000;

export function validateLaboratoryResultSubmission(
  input: unknown,
  reference: LaboratoryReferenceData,
): LaboratoryResultValidation {
  if (!isRecord(input)) {
    return { ok: false, errors: ["Передайте данные результата испытаний."] };
  }

  const section = input.section;

  if (section !== "incoming" && section !== "finished_product") {
    return { ok: false, errors: ["Выберите раздел лабораторного контроля."] };
  }

  const errors: string[] = [];
  const analysisDate = readCalendarDate(input.analysisDate);
  const materialLabel = readText(input.materialLabel, maxShortTextLength);
  const materials = section === "incoming"
    ? reference.incomingMaterials
    : reference.finishedProductTypes;
  const material = materialLabel === undefined
    ? undefined
    : findMaterial(materials, materialLabel);

  if (analysisDate === undefined) {
    errors.push("Укажите дату анализа.");
  }
  if (material === undefined) {
    errors.push(
      section === "incoming"
        ? "Выберите материал из справочника лаборатории."
        : "Выберите вид готовой продукции из справочника лаборатории.",
    );
  }

  if (section === "incoming") {
    const sampleIdentifier = readText(
      input.sampleIdentifier,
      maxShortTextLength,
    );
    const documentType = readOptionalEnum(
      input.documentType,
      laboratoryDocumentTypes,
    );
    const transportType = readOptionalEnum(
      input.transportType,
      laboratoryTransportTypes,
    );
    const documentNumber = readOptionalText(
      input.documentNumber,
      maxShortTextLength,
    );
    const samplingMethod = readOptionalText(
      input.samplingMethod,
      maxLongTextLength,
    );
    const documentIndicators = readOptionalText(
      input.documentIndicators,
      maxLongTextLength,
    );

    if (sampleIdentifier === undefined) {
      errors.push("Укажите номер пробы или идентификатор транспорта.");
    }
    if (input.documentType !== undefined && documentType === undefined) {
      errors.push("Выберите документ на объект из списка.");
    }
    if (input.transportType !== undefined && transportType === undefined) {
      errors.push("Выберите вид транспорта из списка.");
    }

    const values = validateIndicatorValues(input.values, material, errors);

    if (
      errors.length > 0 ||
      analysisDate === undefined ||
      material === undefined ||
      sampleIdentifier === undefined
    ) {
      return { ok: false, errors };
    }

    return {
      ok: true,
      value: {
        section,
        analysisDate,
        materialLabel: material.label,
        sampleIdentifier,
        ...(documentType === undefined ? {} : { documentType }),
        ...(documentNumber === undefined ? {} : { documentNumber }),
        ...(transportType === undefined ? {} : { transportType }),
        ...(samplingMethod === undefined ? {} : { samplingMethod }),
        ...(documentIndicators === undefined ? {} : { documentIndicators }),
        values,
      },
    };
  }

  const productBrand = readText(input.productBrand, maxShortTextLength);

  if (productBrand === undefined) {
    errors.push("Выберите марку готовой продукции.");
  }

  const values = validateIndicatorValues(input.values, material, errors);

  if (
    errors.length > 0 ||
    analysisDate === undefined ||
    material === undefined ||
    productBrand === undefined
  ) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      section,
      analysisDate,
      materialLabel: material.label,
      productBrand,
      values,
    },
  };
}

function validateIndicatorValues(
  input: unknown,
  material: LaboratoryMaterialReference | undefined,
  errors: string[],
) {
  const values: LaboratoryIndicatorValues = {};

  if (material === undefined) return values;

  const source = isRecord(input) ? input : {};
  const indicatorById = new Map(
    material.indicators.map((indicator) => [indicator.id, indicator]),
  );

  for (const indicator of material.indicators) {
    const value = readText(source[indicator.id], maxShortTextLength);

    if (value === undefined) {
      errors.push(`Заполните показатель «${indicator.label}».`);
      continue;
    }

    values[indicator.id] = value;
  }

  for (const [key, rawValue] of Object.entries(source)) {
    if (rawValue === undefined || rawValue === null || rawValue === "") continue;
    if (indicatorById.has(key as LaboratoryIndicatorId)) continue;

    errors.push(`Показатель «${readIndicatorLabel(key)}» не применяется к выбранному материалу.`);
  }

  return values;
}

function findMaterial(
  materials: readonly LaboratoryMaterialReference[],
  value: string,
) {
  const key = normalizeKey(value);
  return materials.find((material) => normalizeKey(material.label) === key);
}

function readCalendarDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return undefined;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? value
    : undefined;
}

function readOptionalEnum<const Value extends string>(
  value: unknown,
  allowed: readonly Value[],
) {
  if (value === undefined || value === null || value === "") return undefined;
  return typeof value === "string" && allowed.includes(value as Value)
    ? (value as Value)
    : undefined;
}

function readOptionalText(value: unknown, maxLength: number) {
  if (value === undefined || value === null || value === "") return undefined;
  return readText(value, maxLength);
}

function readText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().replace(/\s+/gu, " ");
  return normalized.length > 0 && normalized.length <= maxLength
    ? normalized
    : undefined;
}

function normalizeKey(value: string) {
  return value.trim().replace(/\s+/gu, " ").toLocaleLowerCase("ru-RU");
}

function readIndicatorLabel(id: string) {
  const labels: Record<string, string> = {
    al2o3: "Al2O3",
    fe2o3: "Fe2O3",
    sio2: "SiO2",
    cao2: "CaO2",
    p2o5: "P2O5",
    loss_on_ignition: "ппп",
    moisture: "Влажность",
    bulk_density: "Насыпной вес",
    water_absorption: "Водопоглощение",
    strength: "Прочность",
    grain_composition: "Зерновой состав",
  };

  return labels[id] ?? id;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
