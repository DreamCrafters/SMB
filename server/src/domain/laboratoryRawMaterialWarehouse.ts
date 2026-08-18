import type {
  LaboratoryRawMaterialWarehouseReviewRequest,
  LaboratoryRawMaterialWarehouseSubmission,
} from "../contracts/laboratoryRawMaterialWarehouse.js";

export type LaboratoryRawMaterialWarehouseSubmissionValidation =
  | { ok: true; value: LaboratoryRawMaterialWarehouseSubmission }
  | { ok: false; errors: string[] };

export type LaboratoryRawMaterialWarehouseReviewValidation =
  | { ok: true; value: LaboratoryRawMaterialWarehouseReviewRequest }
  | { ok: false; errors: string[] };

const decimalPattern = /^\d+(?:[.,]\d{1,3})?$/u;
const maximumQuantity = 99_999_999_999.999;

export function validateLaboratoryRawMaterialWarehouseSubmission(
  input: unknown,
): LaboratoryRawMaterialWarehouseSubmissionValidation {
  if (!isRecord(input)) {
    return { ok: false, errors: ["Передайте движение сырья."] };
  }

  const errors: string[] = [];
  const movementDate = readCalendarDate(
    input.movementDate,
    "Укажите корректную дату движения.",
    errors,
  );
  const materialLabel = readRequiredText(
    input.materialLabel,
    "Укажите вид сырья.",
    120,
    errors,
  );
  const stackLocation = readRequiredText(
    input.stackLocation,
    "Укажите номер штабеля или место хранения.",
    255,
    errors,
  );
  const receivedTons = readQuantity(
    input.receivedTons,
    "Поступило, тонн",
    errors,
  );
  const supplier = readOptionalText(input.supplier, "Поставщик", 255, errors);
  const shippedTons = readQuantity(
    input.shippedTons,
    "Отгрузили, тонн",
    errors,
  );
  const recipient = readOptionalText(
    input.recipient,
    "Кому отгрузили",
    255,
    errors,
  );

  if (
    receivedTons !== undefined &&
    shippedTons !== undefined &&
    Number(receivedTons) === 0 &&
    Number(shippedTons) === 0
  ) {
    errors.push("Укажите поступление или отгрузку больше нуля.");
  }
  if (
    receivedTons !== undefined &&
    Number(receivedTons) > 0 &&
    supplier === ""
  ) {
    errors.push("Укажите поставщика для поступившего сырья.");
  }
  if (
    shippedTons !== undefined &&
    Number(shippedTons) > 0 &&
    recipient === ""
  ) {
    errors.push("Укажите получателя отгруженного сырья.");
  }

  if (
    errors.length > 0 ||
    movementDate === undefined ||
    materialLabel === undefined ||
    stackLocation === undefined ||
    receivedTons === undefined ||
    supplier === undefined ||
    shippedTons === undefined ||
    recipient === undefined
  ) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      movementDate,
      materialLabel,
      stackLocation,
      receivedTons,
      supplier,
      shippedTons,
      recipient,
    },
  };
}

export function validateLaboratoryRawMaterialWarehouseReviewRequest(
  input: unknown,
): LaboratoryRawMaterialWarehouseReviewValidation {
  if (!isRecord(input) || (input.action !== "approve" && input.action !== "correct")) {
    return {
      ok: false,
      errors: ["Выберите подтверждение или корректировку движения сырья."],
    };
  }
  if (input.action === "approve") {
    return { ok: true, value: { action: "approve" } };
  }
  const validation = validateLaboratoryRawMaterialWarehouseSubmission(
    input.record,
  );
  return validation.ok
    ? { ok: true, value: { action: "correct", record: validation.value } }
    : validation;
}

function readCalendarDate(
  value: unknown,
  message: string,
  errors: string[],
) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    errors.push(message);
    return undefined;
  }
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    errors.push(message);
    return undefined;
  }
  return value;
}

function readQuantity(value: unknown, label: string, errors: string[]) {
  const text = value === undefined || value === null || value === ""
    ? "0"
    : typeof value === "number"
      ? String(value)
      : typeof value === "string"
        ? value.trim()
        : "";
  const normalized = text.replace(",", ".");
  if (
    !decimalPattern.test(text) ||
    !Number.isFinite(Number(normalized)) ||
    Number(normalized) > maximumQuantity
  ) {
    errors.push(
      `Поле «${label}» должно быть неотрицательным числом не более чем с тремя знаками после запятой.`,
    );
    return undefined;
  }
  return trimDecimalZeros(normalized);
}

function readRequiredText(
  value: unknown,
  message: string,
  maxLength: number,
  errors: string[],
) {
  const normalized = normalizeText(value);
  if (normalized === undefined || normalized.length === 0) {
    errors.push(message);
    return undefined;
  }
  if (normalized.length > maxLength) {
    errors.push(`${message.replace(/[.]$/u, "")} Значение слишком длинное.`);
    return undefined;
  }
  return normalized;
}

function readOptionalText(
  value: unknown,
  label: string,
  maxLength: number,
  errors: string[],
) {
  if (value === undefined || value === null || value === "") return "";
  const normalized = normalizeText(value);
  if (normalized === undefined) {
    errors.push(`Поле «${label}» заполнено некорректно.`);
    return undefined;
  }
  if (normalized.length > maxLength) {
    errors.push(`Поле «${label}» должно быть не длиннее ${maxLength} символов.`);
    return undefined;
  }
  return normalized;
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/gu, " ") : undefined;
}

function trimDecimalZeros(value: string) {
  const [integer, fraction] = value.split(".");
  if (fraction === undefined) return integer;
  const trimmedFraction = fraction.replace(/0+$/u, "");
  return trimmedFraction === "" ? integer : `${integer}.${trimmedFraction}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
