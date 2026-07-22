import type {
  DispatcherFormDefinition,
  DispatcherSubmissionPayload,
} from "../contracts";

export const equipmentDowntimeReasonRequiresHoursMessage =
  "Укажите время простоя больше 0 часов, если выбрана причина простоя.";
export const equipmentDowntimeHoursRequireReasonMessage =
  "Укажите причину простоя, если время простоя больше 0 часов.";
export const equipmentReserveDowntimeRequiresEightHoursMessage =
  "Если выбрана причина простоя Резерв, время простоя должно быть 8 часов.";
export const equipmentDowntimeRequiresProductionMessage =
  "Если простой меньше 8 часов, выработка должна быть больше 0.";
export const equipmentDowntimeMaxHoursMessage =
  "Простой за смену не может быть больше 8 часов.";
export const visitorExitRequiresEntryMessage =
  "Выберите посетителя, который вошёл и ещё не вышел.";
export const incidentCloseRequiresOpenIncidentMessage =
  "Выберите незакрытый инцидент.";
export const productionRequiresIndicatorMessage =
  "Заполните хотя бы один показатель выработки.";
export const productionBrandFactPairMessage =
  "Для каждого факта выберите марку, а для выбранной марки укажите факт.";
export const productionDuplicateBrandMessage =
  "Одна марка не должна повторяться в одной категории.";

const equipmentReserveDowntimeReason = "Резерв";

export function isProductionBrandColumnFieldName(fieldName: string) {
  return /^(?:forming|sorting|unformed|chamotte)(?:Brand|Fact)(?:[1-9]|[1-4]\d|50)$/u.test(
    fieldName,
  );
}

export function isProductionBrandRequiredForFact(
  fact: string | undefined,
) {
  return (fact?.trim().length ?? 0) > 0;
}

export function validateDispatcherPayloadForSubmit(
  form: DispatcherFormDefinition,
  payload: DispatcherSubmissionPayload,
) {
  if (form.id === "equipment") {
    return validateEquipmentPayloadForSubmit(payload);
  }

  if (form.id === "production") {
    return validateProductionPayloadForSubmit(form, payload);
  }

  if (
    form.id === "incident_close" &&
    (payload.incidentNumber === undefined ||
      payload.incidentNumber.trim().length === 0)
  ) {
    return incidentCloseRequiresOpenIncidentMessage;
  }

  if (
    form.id === "visitor_exit" &&
    (payload.visitorEntryId === undefined ||
      payload.visitorEntryId.trim().length === 0)
  ) {
    return visitorExitRequiresEntryMessage;
  }

  return undefined;
}

function validateProductionPayloadForSubmit(
  form: DispatcherFormDefinition,
  payload: DispatcherSubmissionPayload,
) {
  for (const prefix of ["forming", "sorting"] as const) {
    const fact = payload[`${prefix}Day`]?.trim() ?? "";
    const brand = payload[`${prefix}ProductBrand`]?.trim() ?? "";

    if (isProductionBrandRequiredForFact(fact) !== (brand.length > 0)) {
      return productionBrandFactPairMessage;
    }
  }

  for (const prefix of [
    "forming",
    "sorting",
    "unformed",
    "chamotte",
  ] as const) {
    const brands = new Set<string>();

    for (let index = 1; index <= 50; index += 1) {
      const brand = payload[`${prefix}Brand${index}`]?.trim() ?? "";
      const fact = payload[`${prefix}Fact${index}`]?.trim() ?? "";

      if (
        (brand.length > 0) !== isProductionBrandRequiredForFact(fact)
      ) {
        return productionBrandFactPairMessage;
      }

      if (brand.length === 0) continue;

      const brandKey = brand.replace(/\s+/gu, " ").toLocaleLowerCase("ru-RU");

      if (brands.has(brandKey)) {
        return productionDuplicateBrandMessage;
      }

      brands.add(brandKey);
    }
  }

  const hasIndicator = Object.entries(payload).some(
    ([fieldName, value]) =>
      fieldName !== "reportDate" &&
      !/(?:Brand|ProductBrand)(?:\d+)?$/u.test(fieldName) &&
      value.trim().length > 0,
  );

  if (!hasIndicator) {
    return productionRequiresIndicatorMessage;
  }

  return undefined;
}

export function validateEquipmentPayloadForSubmit(
  payload: DispatcherSubmissionPayload,
) {
  const downtimeReason = payload.downtimeReason?.trim() ?? "";
  const downtimeHours = readPayloadNumber(payload.downtimeHours);

  if (
    downtimeReason.length > 0 &&
    (downtimeHours === undefined || downtimeHours <= 0)
  ) {
    return equipmentDowntimeReasonRequiresHoursMessage;
  }

  if (
    downtimeHours !== undefined &&
    downtimeHours > 0 &&
    downtimeReason.length === 0
  ) {
    return equipmentDowntimeHoursRequireReasonMessage;
  }

  if (
    downtimeReason === equipmentReserveDowntimeReason &&
    downtimeHours !== undefined &&
    downtimeHours !== 8
  ) {
    return equipmentReserveDowntimeRequiresEightHoursMessage;
  }

  if (downtimeHours !== undefined && downtimeHours > 8) {
    return equipmentDowntimeMaxHoursMessage;
  }

  if (downtimeHours !== undefined && downtimeHours < 8) {
    const productionTons = readPayloadNumber(payload.productionTons);

    if (productionTons === undefined || productionTons <= 0) {
      return equipmentDowntimeRequiresProductionMessage;
    }
  }

  return undefined;
}

function readPayloadNumber(value: string | undefined) {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : undefined;
}
