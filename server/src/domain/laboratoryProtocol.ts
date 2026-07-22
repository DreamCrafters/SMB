import {
  laboratoryIncomingPurpose,
  type LaboratoryIndicatorValues,
} from "./laboratoryResult.js";
import {
  laboratoryIndicatorDefinitions,
  type LaboratoryIndicatorId,
  type LaboratoryIndicatorReference,
  type LaboratoryReferenceData,
} from "../integrations/googleSheetsReference.js";
import type { LaboratoryResult } from "../repositories/laboratoryResultsRepository.js";

export type LaboratoryProtocolField = {
  label: string;
  value: string;
};

export type LaboratoryProtocolResultRow = {
  indicatorId: LaboratoryIndicatorId;
  indicatorLabel: string;
  standard: string;
  value: string;
  note: string;
};

export type LaboratoryProtocolSampleGroup = {
  identifier: string;
  rows: LaboratoryProtocolResultRow[];
};

export type LaboratoryProtocol = {
  resultId: string;
  protocolDate: string;
  testDate: string;
  objectName: string;
  purpose: string;
  protocolNote: string;
  optionalFields: LaboratoryProtocolField[];
  sampleGroups: LaboratoryProtocolSampleGroup[];
  laboratoryAssistantDisplayName: string;
};

const indicatorProtocolLabels: Record<LaboratoryIndicatorId, string> = {
  al2o3: "Массовая доля Al₂O₃, %",
  fe2o3: "Массовая доля Fe₂O₃, %",
  sio2: "Массовая доля SiO₂, %",
  cao2: "Массовая доля CaO₂, %",
  p2o5: "Массовая доля P₂O₅, %",
  loss_on_ignition: "Потери при прокаливании, %",
  moisture: "Массовая доля влаги, %",
  bulk_density: "Насыпная плотность, г/см³",
  water_absorption: "Водопоглощение, %",
  strength: "Предел прочности при сжатии, Н/мм²",
  grain_composition: "Зерновой состав",
};

export function buildLaboratoryProtocol(
  result: LaboratoryResult,
  reference: LaboratoryReferenceData,
): LaboratoryProtocol {
  const indicatorIds = resolveProtocolIndicatorIds(result, reference);
  const indicatorById = new Map(
    reference.indicators.map((indicator) => [indicator.id, indicator]),
  );
  const buildRows = (values: LaboratoryIndicatorValues) =>
    indicatorIds.map((indicatorId) => {
      const indicator = indicatorById.get(indicatorId) ??
        buildFallbackIndicator(indicatorId);
      return {
        indicatorId,
        indicatorLabel: indicatorProtocolLabels[indicatorId] ?? indicator.label,
        standard: indicator.standard ?? "",
        value: values[indicatorId] ?? "",
        note: "",
      };
    });

  return {
    resultId: result.id,
    protocolDate: formatInstantDate(result.createdAt),
    testDate: formatCalendarDate(result.analysisDate),
    objectName: result.section === "incoming"
      ? result.materialLabel
      : `${result.materialLabel}, марка ${result.productBrand}`,
    purpose: result.purpose ?? laboratoryIncomingPurpose,
    protocolNote: result.protocolNote ?? "",
    optionalFields: result.section === "incoming"
      ? buildIncomingOptionalFields(result)
      : [],
    sampleGroups: result.section === "incoming"
      ? result.samples.map((sample) => ({
          identifier: sample.sampleIdentifier,
          rows: buildRows(sample.values),
        }))
      : [{ identifier: result.productBrand, rows: buildRows(result.values) }],
    laboratoryAssistantDisplayName: result.laboratoryAssistantDisplayName,
  };
}

function resolveProtocolIndicatorIds(
  result: LaboratoryResult,
  reference: LaboratoryReferenceData,
) {
  const profileIndicatorIds = result.section === "incoming"
    ? findIncomingProfileIndicatorIds(result.materialLabel, reference)
    : reference.finishedProductTypes.find(
        (profile) => normalize(profile.label) === normalize(result.materialLabel),
      )?.indicatorIds ?? [];
  const enteredIndicatorIds = new Set<LaboratoryIndicatorId>(
    result.section === "incoming"
      ? result.samples.flatMap((sample) =>
          Object.keys(sample.values) as LaboratoryIndicatorId[]
        )
      : Object.keys(result.values) as LaboratoryIndicatorId[],
  );
  const requestedIds = new Set([...profileIndicatorIds, ...enteredIndicatorIds]);
  const orderedIds = laboratoryIndicatorDefinitions
    .map((indicator) => indicator.id)
    .filter((indicatorId) => requestedIds.has(indicatorId));

  return orderedIds.length > 0 ? orderedIds : [...enteredIndicatorIds];
}

function findIncomingProfileIndicatorIds(
  materialLabel: string,
  reference: LaboratoryReferenceData,
) {
  const normalizedMaterial = normalize(materialLabel);
  return reference.incomingTestProfiles
    .filter((profile) => normalizedMaterial.includes(normalize(profile.label)))
    .sort((left, right) => right.label.length - left.label.length)[0]
    ?.indicatorIds ?? [];
}

function buildIncomingOptionalFields(
  result: Extract<LaboratoryResult, { section: "incoming" }>,
) {
  const delivery = [
    result.transportType,
    result.samples.map((sample) => sample.sampleIdentifier).join(", "),
  ].filter((value): value is string => value !== undefined && value.length > 0)
    .join("; ");
  const fields: Array<readonly [string, string | undefined]> = [
    ["Вид документа, соответствие которому проводится проверка", result.documentType],
    ["Номер документа", result.documentNumber],
    ["Способ доставки и идентификаторы транспорта", delivery],
    ["Способ отбора проб", result.samplingMethod],
    ["Показатели по сертификату", result.documentIndicators],
  ];
  return fields.flatMap(([label, value]) =>
    typeof value === "string" && value.length > 0 ? [{ label, value }] : []
  );
}

function buildFallbackIndicator(
  indicatorId: LaboratoryIndicatorId,
): LaboratoryIndicatorReference {
  const definition = laboratoryIndicatorDefinitions.find(
    (indicator) => indicator.id === indicatorId,
  );
  return {
    id: indicatorId,
    label: definition?.label ?? indicatorId,
  };
}

function formatCalendarDate(value: string) {
  const [year, month, day] = value.split("-");
  return year !== undefined && month !== undefined && day !== undefined
    ? `${day}.${month}.${year}`
    : value;
}

function formatInstantDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  const parts = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${read("day")}.${read("month")}.${read("year")}`;
}

function normalize(value: string) {
  return value.trim().replace(/\s+/gu, " ").toLocaleLowerCase("ru-RU");
}
