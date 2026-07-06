import type {
  DispatcherFormDefinition,
  DispatcherSubmissionPayload,
} from "../contracts";

export const equipmentDowntimeReasonRequiresHoursMessage =
  "Укажите время простоя больше 0 часов, если выбрана причина простоя.";
export const equipmentDowntimeRequiresProductionMessage =
  "Если простой меньше 8 часов, выработка должна быть больше 0.";
export const visitorExitRequiresEntryMessage =
  "Выберите посетителя, который вошёл и ещё не вышел.";

export function validateDispatcherPayloadForSubmit(
  form: DispatcherFormDefinition,
  payload: DispatcherSubmissionPayload,
) {
  if (form.id === "equipment") {
    return validateEquipmentPayloadForSubmit(payload);
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
