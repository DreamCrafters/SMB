import type {
  LaboratoryIndicatorId,
  LaboratoryIndicatorReference,
  LaboratoryProductTypeReference,
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

export type IncomingLaboratorySample = {
  sampleIdentifier: string;
  values: LaboratoryIndicatorValues;
};

export type IncomingLaboratoryResultSubmission = {
  section: "incoming";
  analysisDate: string;
  materialLabel: string;
  purpose?: string;
  protocolNote?: string;
  documentType?: LaboratoryDocumentType;
  documentNumber?: string;
  transportType?: LaboratoryTransportType;
  samplingMethod?: string;
  documentIndicators?: string;
  samples: IncomingLaboratorySample[];
};

export type FinishedProductLaboratoryResultSubmission = {
  section: "finished_product";
  analysisDate: string;
  materialLabel: string;
  productBrand: string;
  purpose?: string;
  protocolNote?: string;
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
const maxIncomingSamples = 100;

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
  const purpose = readText(input.purpose, maxLongTextLength);
  const protocolNote = readText(input.protocolNote, maxLongTextLength);
  const material = section === "incoming" || materialLabel === undefined
    ? undefined
    : findMaterial(reference.finishedProductTypes, materialLabel);

  if (analysisDate === undefined) {
    errors.push("Укажите дату анализа.");
  }
  if (section === "incoming" && materialLabel === undefined) {
    errors.push("Укажите объект испытаний.");
  }
  if (section === "finished_product" && material === undefined) {
    errors.push(
      "Выберите вид готовой продукции из справочника лаборатории.",
    );
  }
  if (purpose === undefined) {
    errors.push("Укажите цель испытаний.");
  }
  if (protocolNote === undefined) {
    errors.push("Укажите примечание к протоколу.");
  }

  if (section === "incoming") {
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

    if (input.documentType !== undefined && documentType === undefined) {
      errors.push("Выберите документ на объект из списка.");
    }
    if (input.transportType !== undefined && transportType === undefined) {
      errors.push("Выберите вид транспорта из списка.");
    }

    const samples = validateIncomingSamples(
      input.samples,
      reference.indicators,
      errors,
    );

    if (
      errors.length > 0 ||
      analysisDate === undefined ||
      materialLabel === undefined ||
      purpose === undefined ||
      protocolNote === undefined ||
      samples === undefined
    ) {
      return { ok: false, errors };
    }

    return {
      ok: true,
      value: {
        section,
        analysisDate,
        materialLabel,
        purpose,
        protocolNote,
        ...(documentType === undefined ? {} : { documentType }),
        ...(documentNumber === undefined ? {} : { documentNumber }),
        ...(transportType === undefined ? {} : { transportType }),
        ...(samplingMethod === undefined ? {} : { samplingMethod }),
        ...(documentIndicators === undefined ? {} : { documentIndicators }),
        samples,
      },
    };
  }

  const productBrand = readText(input.productBrand, maxShortTextLength);

  if (productBrand === undefined) {
    errors.push("Выберите марку готовой продукции.");
  }

  const values = validateIndicatorValues(
    input.values,
    material === undefined ? undefined : reference.indicators,
    errors,
  );

  if (
    errors.length > 0 ||
    analysisDate === undefined ||
    material === undefined ||
    productBrand === undefined ||
    purpose === undefined ||
    protocolNote === undefined
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
      purpose,
      protocolNote,
      values,
    },
  };
}

function validateIncomingSamples(
  input: unknown,
  indicators: readonly LaboratoryIndicatorReference[],
  errors: string[],
) {
  if (!Array.isArray(input) || input.length === 0) {
    errors.push("Добавьте хотя бы одну пробу.");
    return undefined;
  }
  if (input.length > maxIncomingSamples) {
    errors.push(`В одном отчёте может быть не больше ${maxIncomingSamples} проб.`);
    return undefined;
  }

  const samples: IncomingLaboratorySample[] = [];

  for (const [index, item] of input.entries()) {
    const sampleNumber = index + 1;
    const contextLabel = `Проба ${sampleNumber}`;

    if (!isRecord(item)) {
      errors.push(`${contextLabel}: проверьте данные пробы.`);
      continue;
    }

    const sampleIdentifier = readText(
      item.sampleIdentifier,
      maxShortTextLength,
    );
    if (sampleIdentifier === undefined) {
      errors.push(`${contextLabel}: укажите номер пробы или идентификатор транспорта.`);
    }
    const values = validateIndicatorValues(
      item.values,
      indicators,
      errors,
      contextLabel,
    );

    if (sampleIdentifier !== undefined) {
      samples.push({ sampleIdentifier, values });
    }
  }

  return samples;
}

function validateIndicatorValues(
  input: unknown,
  indicators: readonly LaboratoryIndicatorReference[] | undefined,
  errors: string[],
  contextLabel?: string,
) {
  const values: LaboratoryIndicatorValues = {};

  if (indicators === undefined) return values;

  const source = isRecord(input) ? input : {};
  const indicatorById = new Map(
    indicators.map((indicator) => [indicator.id, indicator]),
  );

  for (const indicator of indicators) {
    const rawValue = source[indicator.id];

    if (rawValue === undefined || rawValue === null || rawValue === "") {
      continue;
    }

    const value = readText(rawValue, maxShortTextLength);

    if (value === undefined) {
      errors.push(withValidationContext(
        contextLabel,
        `проверьте значение показателя «${indicator.label}».`,
      ));
      continue;
    }

    values[indicator.id] = value;
  }

  for (const [key, rawValue] of Object.entries(source)) {
    if (rawValue === undefined || rawValue === null || rawValue === "") continue;
    if (indicatorById.has(key as LaboratoryIndicatorId)) continue;

    errors.push(withValidationContext(
      contextLabel,
      `показатель «${readIndicatorLabel(key)}» отсутствует в справочнике лаборатории.`,
    ));
  }

  if (Object.keys(values).length === 0) {
    errors.push(withValidationContext(
      contextLabel,
      "заполните хотя бы один показатель испытаний.",
    ));
  }

  return values;
}

function withValidationContext(contextLabel: string | undefined, message: string) {
  if (contextLabel === undefined) {
    return message.charAt(0).toLocaleUpperCase("ru-RU") + message.slice(1);
  }
  return `${contextLabel}: ${message}`;
}

function findMaterial(
  materials: readonly LaboratoryProductTypeReference[],
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
